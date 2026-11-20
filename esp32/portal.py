# Portal de configuração: a placa cria uma rede Wi-Fi própria com uma página para
# trocar a rede e a conta, sem precisar editar arquivos nem usar o computador.
import json
import time
import network
import socket
import machine

import projeto as cfg

ARQUIVO = "config.json"
AP_SENHA = "estacao123"     # senha da rede da placa durante a configuração (mínimo 8 caracteres)
MAX_REDES = 3               # quantas redes Wi-Fi a placa lembra (casa, celular, trabalho...)


# ---------------------------------------------------------------- arquivo de configuração
def carregar_config():
    try:
        with open(ARQUIVO) as f:
            c = json.load(f)
        if c.get("redes") and c.get("conta", {}).get("email"):
            return c
    except (OSError, ValueError):
        pass
    return None


def salvar_config(c):
    with open(ARQUIVO, "w") as f:
        json.dump(c, f)


def botao_boot_segurado(segundos=3):
    b = machine.Pin(0, machine.Pin.IN, machine.Pin.PULL_UP)
    if b.value() == 1:
        return False
    inicio = time.ticks_ms()
    while b.value() == 0:
        if time.ticks_diff(time.ticks_ms(), inicio) >= segundos * 1000:
            return True
        time.sleep_ms(50)
    return False


# ---------------------------------------------------------------- utilidades de texto
def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def url_decode(t):
    partes = t.replace("+", " ").split("%")
    b = bytearray(partes[0].encode())
    for p in partes[1:]:
        try:
            b.append(int(p[:2], 16))
            b.extend(p[2:].encode())
        except ValueError:
            b.extend(("%" + p).encode())
    return b.decode()


def ler_formulario(corpo):
    campos = {}
    for par in corpo.split("&"):
        k, _, v = par.partition("=")
        if k:
            campos[url_decode(k)] = url_decode(v)
    return campos


def aplicar_formulario(antigo, campos):
    ssid = campos.get("ssid", "").strip()
    senha_wifi = campos.get("senha_wifi", "")
    email = campos.get("email", "").strip()
    senha_conta = campos.get("senha_conta", "")

    if not senha_conta and antigo and antigo["conta"]["email"] == email:
        senha_conta = antigo["conta"]["senha"]          # só trocando de rede: mantém a senha da conta
    if not ssid or not email or not senha_conta:
        return None, "Preencha a rede, o e-mail e a senha da conta."

    redes = [{"ssid": ssid, "senha": senha_wifi}]
    for r in (antigo or {}).get("redes", []):
        if r["ssid"] != ssid:
            redes.append(r)
    return {"redes": redes[:MAX_REDES], "conta": {"email": email, "senha": senha_conta}}, None


# ---------------------------------------------------------------- páginas
CSS = ("body{font-family:sans-serif;background:#0D1420;color:#E8E6DE;margin:0;padding:20px}"
       "main{max-width:420px;margin:0 auto}h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px}"
       "p,small{color:#9AA8BA;font-size:14px}label{display:block;font-size:14px;margin:12px 0 4px}"
       "input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #2A3849;"
       "background:#1C2836;color:#E8E6DE;font-size:16px}"
       "button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:8px;background:#E8A33D;"
       "color:#0D1420;font-size:16px;font-weight:bold}.erro{color:#E8654C}")

PAGINA = ("<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
          "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
          "<title>Configurar estação</title><style>@@CSS@@</style></head><body><main>"
          "<h1>Configurar estação</h1>"
          "<p>Escolha a rede Wi-Fi que a placa vai usar e a conta do painel. "
          "Ainda não tem conta? Crie em <b>@@SITE@@/cadastro.html</b> (com internet) e volte aqui.</p>"
          "<p class=\"erro\">@@AVISO@@</p>"
          "<form method=\"POST\" action=\"/salvar\">"
          "<h2>Rede Wi-Fi (2,4 GHz)</h2>"
          "<label>Nome da rede</label><input name=\"ssid\" list=\"redes\" autocomplete=\"off\" required>"
          "<datalist id=\"redes\">@@REDES@@</datalist>"
          "<label>Senha da rede</label><input name=\"senha_wifi\" type=\"password\" autocomplete=\"off\">"
          "<small>Deixe em branco se a rede não tiver senha.</small>"
          "<h2>Sua conta do painel</h2>"
          "<label>E-mail</label><input name=\"email\" type=\"email\" value=\"@@EMAIL@@\" required>"
          "<label>Senha da conta</label><input name=\"senha_conta\" type=\"password\" autocomplete=\"off\">"
          "<small>Só trocando de rede? Deixe em branco para manter a senha atual.</small>"
          "<button type=\"submit\">Salvar e reiniciar</button></form></main></body></html>")

SALVO = ("<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
         "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
         "<style>@@CSS@@</style></head><body><main><h1>Salvo!</h1>"
         "<p>A placa vai reiniciar e conectar em <b>@@REDE@@</b>. Pode fechar esta página.</p></main></body></html>")


def montar_pagina(redes, config, aviso=""):
    opcoes = "".join("<option value=\"%s\">" % esc(r) for r in redes)
    email = config["conta"]["email"] if config else ""
    return (PAGINA.replace("@@CSS@@", CSS).replace("@@SITE@@", esc(cfg.SITE)).replace("@@AVISO@@", esc(aviso))
            .replace("@@REDES@@", opcoes).replace("@@EMAIL@@", esc(email)))


# ---------------------------------------------------------------- servidor
def ler_requisicao(cl):
    dados = b""
    while b"\r\n\r\n" not in dados:
        parte = cl.recv(512)
        if not parte:
            break
        dados += parte
        if len(dados) > 4096:
            break
    cab, _, corpo = dados.partition(b"\r\n\r\n")
    linhas = cab.decode().split("\r\n")
    metodo, caminho = (linhas[0].split(" ") + ["", ""])[:2]
    tamanho = 0
    for l in linhas[1:]:
        if l.lower().startswith("content-length:"):
            tamanho = int(l.split(":")[1])
    while len(corpo) < tamanho:
        parte = cl.recv(512)
        if not parte:
            break
        corpo += parte
    return metodo, caminho, corpo.decode()


def responder(cl, html):
    cl.send(b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n")
    dados = html.encode()
    for i in range(0, len(dados), 512):
        cl.send(dados[i:i + 512])


def abrir_portal(config, timeout_s=None):
    """Abre o portal. Sempre termina reiniciando a placa (após salvar ou por tempo esgotado)."""
    sta = network.WLAN(network.STA_IF)
    sta.active(True)
    redes = []
    try:
        for r in sta.scan():
            try:
                nome = r[0].decode()
                if nome and nome not in redes:
                    redes.append(nome)
            except Exception:
                pass
    except OSError:
        pass

    mac = sta.config("mac")
    nome_ap = "Estacao-%02X%02X" % (mac[4], mac[5])
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    ap.config(essid=nome_ap, password=AP_SENHA, authmode=network.AUTH_WPA_WPA2_PSK)

    print("=" * 45)
    print("Portal de configuração aberto")
    print("1) No celular, conecte no Wi-Fi:", nome_ap, "(senha: %s)" % AP_SENHA)
    print("2) Abra no navegador: http://192.168.4.1")
    print("=" * 45)

    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", 80))
    s.listen(2)
    s.settimeout(2)
    inicio = time.time()

    while True:
        if timeout_s and time.time() - inicio > timeout_s:
            print("Portal fechado por tempo esgotado; reiniciando")
            machine.reset()
        try:
            cl, _ = s.accept()
        except OSError:
            continue
        try:
            cl.settimeout(5)
            metodo, caminho, corpo = ler_requisicao(cl)
            if metodo == "POST" and caminho.startswith("/salvar"):
                novo, aviso = aplicar_formulario(config, ler_formulario(corpo))
                if novo is None:
                    responder(cl, montar_pagina(redes, config, aviso))
                else:
                    salvar_config(novo)
                    responder(cl, SALVO.replace("@@CSS@@", CSS).replace("@@REDE@@", esc(novo["redes"][0]["ssid"])))
                    cl.close()
                    time.sleep(2)
                    machine.reset()
            else:
                responder(cl, montar_pagina(redes, config))
        except Exception as e:
            print("Erro no portal:", e)
        finally:
            try:
                cl.close()
            except Exception:
                pass
