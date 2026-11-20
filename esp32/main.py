from machine import Pin, ADC, I2C, WDT, reset
import time
import gc
import dht
import network
import ntptime

try:
    import urequests as requests
except ImportError:
    import requests

import segredos as cfg

try:
    from bmp280 import BMP280
except ImportError:
    BMP280 = None
    print("ATENÇÃO: o arquivo bmp280.py não está na placa")

# ---------------------------------------------------------------- ajustes
INTERVALO_LEITURA_S = 2      # o DHT22 não aceita leituras mais rápidas que 2 s
INTERVALO_ENVIO_S = 15       # de quanto em quanto tempo manda para o Firebase

# Sensor de luz. Teste: cubra o sensor com a mão e olhe o "valor bruto" no terminal.
# Se o valor bruto SUBIR no escuro, coloque True (assim o painel mostra pouca luz no escuro).
LDR_INVERTIDO = False

USAR_WATCHDOG = True         # reinicia a placa se ela travar (rede caiu no meio de um envio etc.)
WATCHDOG_MS = 120000         # para editar arquivos pelo Thonny sem a placa reiniciar sozinha, coloque False
REINICIAR_A_CADA_S = 86400   # reinício preventivo a cada 24 h

# ---------------------------------------------------------------- sensores
dht_sensor = dht.DHT22(Pin(4))

ldr = ADC(Pin(34))           # saída AO do módulo de luz
ldr.atten(ADC.ATTN_11DB)

gas = ADC(Pin(35))           # saída AO do MQ-135, com divisor de tensão
gas.atten(ADC.ATTN_11DB)

i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=100000)
bmp = None
proxima_tentativa_bmp = time.ticks_ms()

wdt = None


def alimentar():
    if wdt is not None:
        wdt.feed()


def iniciar_bmp():
    global bmp
    if BMP280 is None:
        return
    try:
        bmp = BMP280(i2c)
        print("BMP280 ok (endereço 0x%02X, ID 0x%02X)" % (bmp.addr, bmp.chip_id))
    except OSError as e:
        bmp = None
        print("BMP280 indisponível:", e)


def ler_adc(adc, amostras=16):
    total = 0
    for _ in range(amostras):
        total += adc.read_u16() >> 4      # 0..4095
        time.sleep_ms(2)
    return total // amostras


def ler_sensores():
    global bmp, proxima_tentativa_bmp

    luz_bruta = ler_adc(ldr)
    luz = 4095 - luz_bruta if LDR_INVERTIDO else luz_bruta

    try:
        dht_sensor.measure()
        temperatura = dht_sensor.temperature()
        umidade = dht_sensor.humidity()
    except OSError:
        temperatura = None
        umidade = None

    # Se o BMP280 falhou (fio solto, queda de tensão), tenta iniciar de novo a cada 30 s
    if bmp is None and time.ticks_diff(time.ticks_ms(), proxima_tentativa_bmp) >= 0:
        iniciar_bmp()
        proxima_tentativa_bmp = time.ticks_add(time.ticks_ms(), 30000)

    pressao = None
    if bmp is not None:
        try:
            _, pressao = bmp.ler()
        except OSError as e:
            print("Falha ao ler o BMP280:", e)
            bmp = None

    return {
        "temperatura": temperatura,
        "umidade": umidade,
        "pressao": pressao,
        "luminosidade": luz,
        "luz_bruta": luz_bruta,      # só para conferência no terminal; não é enviado
        "gas": ler_adc(gas),
    }


def mostrar(l):
    print("-" * 45)
    print("Luminosidade: %d%% (valor bruto do sensor: %d)" % (l["luminosidade"] * 100 // 4095, l["luz_bruta"]))
    if l["temperatura"] is not None:
        print("Temperatura: %.1f °C" % l["temperatura"])
        print("Umidade: %.1f %%" % l["umidade"])
    else:
        print("Erro ao ler o DHT22")
    if l["pressao"] is not None:
        print("Pressão: %.1f hPa" % l["pressao"])
    else:
        print("Erro ao ler o BMP280")
    print("MQ-135:", l["gas"])


# ---------------------------------------------------------------- Wi-Fi e relógio
def conectar_wifi():
    wlan = network.WLAN(network.STA_IF)
    # Recomeça do zero: evita o "Wifi Internal State Error" depois de um Stop/reboot no meio da conexão
    wlan.active(False)
    time.sleep(1)
    wlan.active(True)

    for tentativa in range(1, 4):
        alimentar()
        try:
            wlan.disconnect()
            time.sleep(0.5)
            print("Conectando ao Wi-Fi (%d/3): %s" % (tentativa, cfg.WIFI_SSID))
            wlan.connect(cfg.WIFI_SSID, cfg.WIFI_SENHA)
            inicio = time.time()
            while not wlan.isconnected():
                alimentar()
                if time.time() - inicio > 15:
                    raise OSError("tempo esgotado")
                time.sleep(0.5)
            print("Wi-Fi ok:", wlan.ifconfig()[0])
            return wlan
        except OSError as e:
            print("Falhou:", e)
    raise OSError("Wi-Fi não conectou (confira nome e senha; a rede precisa ser 2,4 GHz)")


# MicroPython no ESP32 conta o tempo desde 2000; o Firebase e o painel usam 1970
EPOCH = 946684800 if time.gmtime(0)[0] == 2000 else 0


def sincronizar_relogio():
    for _ in range(5):
        alimentar()
        try:
            ntptime.settime()
            return True
        except OSError:
            time.sleep(1)
    return False


def agora_ms():
    return (time.time() + EPOCH) * 1000


# ---------------------------------------------------------------- Firebase
estado = {"token": None, "uid": None, "expira": 0}


def login_firebase():
    url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + cfg.API_KEY
    r = requests.post(url, json={"email": cfg.EMAIL, "password": cfg.SENHA, "returnSecureToken": True})
    try:
        d = r.json()
    finally:
        r.close()
    if "idToken" not in d:
        msg = str(d.get("error", {}).get("message", "resposta inesperada"))
        raise OSError("Login no Firebase falhou: " + msg + " (confira EMAIL e SENHA no segredos.py)")
    estado["token"] = d["idToken"]
    estado["uid"] = d["localId"]
    estado["expira"] = time.time() + int(d["expiresIn"]) - 300   # renova 5 min antes
    print("Login no Firebase ok")


def garantir_login():
    if estado["token"] is None or time.time() >= estado["expira"]:
        login_firebase()


def url_db(sub):
    return "%s/usuarios/%s/%s.json?auth=%s" % (cfg.DATABASE_URL, estado["uid"], sub, estado["token"])


def checar(r, acao):
    status = r.status_code
    r.close()
    if status == 401:
        estado["token"] = None          # força novo login na próxima volta
    if status != 200:
        raise OSError("%s: HTTP %d" % (acao, status))


def buscar_contexto():
    r = requests.get(url_db("sessao/atual"))
    try:
        return r.json() or {}
    finally:
        r.close()


def escolher_posicao(ctx):
    modo = ctx.get("modo")
    lat, lon = ctx.get("latitude"), ctx.get("longitude")
    if modo in ("fixo", "celular") and lat is not None and lon is not None:
        if modo == "celular":
            ts = ctx.get("posicao_ts")
            if ts is None or agora_ms() - ts > 120000:      # o celular parou de atualizar
                return None, None, "gps", None
        return lat, lon, modo, ctx.get("nome_local")
    return None, None, "gps", None


def enviar(l):
    gc.collect()
    garantir_login()
    ctx = buscar_contexto()
    lat, lon, origem, nome_local = escolher_posicao(ctx)

    payload = {
        "temperatura": l["temperatura"],
        "umidade": l["umidade"],
        "pressao": l["pressao"],
        "luminosidade": l["luminosidade"],
        "gas": l["gas"],
        "latitude": lat,
        "longitude": lon,
        "origem_local": origem,
        "nome_local": nome_local,
        "operador": ctx.get("operador"),
        "dispositivo": ctx.get("dispositivo"),
        "timestamp": int(agora_ms()),
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    checar(requests.put(url_db("leituras/atual"), json=payload), "gravar leitura atual")
    checar(requests.post(url_db("leituras/historico"), json=payload), "gravar histórico")
    print("Enviado ao Firebase")


# ---------------------------------------------------------------- programa
def executar():
    global wdt

    if cfg.WIFI_SSID.startswith("NOME_DA") or cfg.EMAIL.startswith("seu-email"):
        while True:
            print("Edite o segredos.py com o Wi-Fi e a conta e envie-o para a placa.")
            time.sleep(10)

    if USAR_WATCHDOG:
        wdt = WDT(timeout=WATCHDOG_MS)

    wlan = None
    while wlan is None:
        try:
            wlan = conectar_wifi()
        except OSError as e:
            print(e)
            for _ in range(10):         # espera 10 s e tenta de novo, sem parar o programa
                alimentar()
                time.sleep(1)

    if not sincronizar_relogio():
        print("Aviso: não foi possível acertar o relógio (NTP); os horários ficarão errados")

    inicio = time.ticks_ms()
    ultimo_envio = 0

    while True:
        alimentar()
        gc.collect()

        if time.ticks_diff(time.ticks_ms(), inicio) > REINICIAR_A_CADA_S * 1000:
            print("Reinício preventivo")
            reset()

        leitura = ler_sensores()
        mostrar(leitura)

        if time.time() - ultimo_envio >= INTERVALO_ENVIO_S:
            try:
                if not wlan.isconnected():
                    wlan = conectar_wifi()
                enviar(leitura)
                ultimo_envio = time.time()
            except Exception as e:
                print("Falha no envio:", e)
                ultimo_envio = time.time() - INTERVALO_ENVIO_S + 5     # tenta de novo em 5 s
            alimentar()

        time.sleep(INTERVALO_LEITURA_S)


try:
    executar()
except KeyboardInterrupt:
    raise                                   # Ctrl+C no Thonny continua parando o programa
except Exception as e:
    print("Erro inesperado:", e)
    time.sleep(5)
    reset()                                 # recomeça sozinha em vez de ficar parada no REPL
