# Driver mínimo do BMP280 (também funciona com BME280 para temperatura e pressão).
# Fórmulas de compensação do datasheet da Bosch (inteiros de 64 bits).
import struct
import time


class BMP280:
    def __init__(self, i2c, addr=None):
        self.i2c = i2c
        if addr is None:
            for a in (0x76, 0x77):
                try:
                    i2c.readfrom_mem(a, 0xD0, 1)
                    addr = a
                    break
                except OSError:
                    pass
            if addr is None:
                raise OSError("BMP280 não responde no I2C (confira SDA no GPIO21, SCL no GPIO22 e 3,3 V)")
        self.addr = addr

        self.chip_id = i2c.readfrom_mem(addr, 0xD0, 1)[0]
        if self.chip_id not in (0x56, 0x57, 0x58, 0x60):
            raise OSError("Sensor desconhecido (ID 0x%02X)" % self.chip_id)

        c = i2c.readfrom_mem(addr, 0x88, 24)
        (self.T1, self.T2, self.T3,
         self.P1, self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9) = struct.unpack('<HhhHhhhhhhhh', c)

        i2c.writeto_mem(addr, 0xE0, b'\xB6')   # reset
        time.sleep_ms(10)
        i2c.writeto_mem(addr, 0xF5, b'\xA8')   # filtro x4, standby 1 s
        i2c.writeto_mem(addr, 0xF4, b'\x2F')   # temp x1, pressão x4, modo normal
        time.sleep_ms(100)

    def ler(self):
        """Retorna (temperatura em °C, pressão em hPa)."""
        d = self.i2c.readfrom_mem(self.addr, 0xF7, 6)
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)

        v1 = (((adc_t >> 3) - (self.T1 << 1)) * self.T2) >> 11
        v2 = (((((adc_t >> 4) - self.T1) * ((adc_t >> 4) - self.T1)) >> 12) * self.T3) >> 14
        t_fine = v1 + v2
        temp = ((t_fine * 5 + 128) >> 8) / 100

        v1 = t_fine - 128000
        v2 = v1 * v1 * self.P6
        v2 = v2 + ((v1 * self.P5) << 17)
        v2 = v2 + (self.P4 << 35)
        v1 = ((v1 * v1 * self.P3) >> 8) + ((v1 * self.P2) << 12)
        v1 = (((1 << 47) + v1) * self.P1) >> 33
        if v1 == 0:
            return temp, None
        p = 1048576 - adc_p
        p = (((p << 31) - v2) * 3125) // v1
        v1 = (self.P9 * (p >> 13) * (p >> 13)) >> 25
        v2 = (self.P8 * p) >> 19
        p = ((p + v1 + v2) >> 8) + (self.P7 << 4)
        return temp, p / 25600
