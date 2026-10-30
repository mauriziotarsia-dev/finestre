#!/usr/bin/env python3
"""Sensore di presenza per la «prospettiva viva» delle finestre.

Riceve le letture del radar HLK-LD2450 (fino a 3 persone, posizione in mm) e le offre alla pagina
della finestra come flusso di eventi su http://localhost:8788/persone.

TEMPO REALE (30/10, obiettivo di Maurizio: al massimo 80 ms dal movimento all'immagine):
  · ogni lettura parte verso la pagina APPENA arriva (prima si mandava 10 volte al secondo a orologio,
    e una lettura poteva aspettare fino a un decimo di secondo);
  · con la lettura viaggia la sua età (eta_ms): la pagina sa quanto è vecchia e la «previene».

Da dove arrivano le letture:
  1. dal Wi-Fi (normale): la schedina ESP32 accanto al radar le manda in broadcast UDP sulla porta
     47250 (programma in esp32/radar-udp). Il radar può stare nella stanza, il Raspberry in cantina.
  2. dalla seriale (prove): il radar collegato al Raspberry con l'adattatore USB (/dev/ttyUSB0)
     oppure ai pin (/dev/serial0). Si accende con --seriale.
  3. --prova: una persona finta che passeggia, 20 letture al secondo, senza radar.

Avvio:  python3 ~/finestre/pi/sensore.py              (ascolta il Wi-Fi)
        python3 ~/finestre/pi/sensore.py --seriale    (anche la seriale)
        python3 ~/finestre/pi/sensore.py --prova
⚠ Porta 8788, non 8787: la 8787 è del server di proiezione di DMaster.
"""
import glob, json, math, socket, struct, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA_HTTP = 8788
PORTA_UDP = 47250
VELOCITA = 256000                    # baud del LD2450
MAGIA = b'LD24'                      # pacchetto dell'ESP32: LD24 · id radar · numero · millis · 24 byte dei bersagli

stato = {'persone': [], 'quando': 0.0, 'radar': None, 'n': 0}
cambio = threading.Condition()


def valore(lo, hi):
    """Il LD2450 scrive il segno nel bit alto al contrario: 1 = positivo."""
    raw = lo | (hi << 8)
    return (raw & 0x7FFF) if raw & 0x8000 else -(raw & 0x7FFF)


def bersagli(b24):
    """I tre bersagli di un quadro del radar (8 byte l'uno): x, y in mm, velocità in cm/s."""
    trovate = []
    for k in range(3):
        b = b24[k * 8:(k + 1) * 8]
        if not any(b):
            continue
        trovate.append({'x': valore(b[0], b[1]), 'y': valore(b[2], b[3]), 'v': valore(b[4], b[5])})
    return trovate


def pubblica(lista, radar=None):
    with cambio:
        stato['persone'], stato['quando'], stato['radar'] = lista, time.monotonic(), radar
        stato['n'] += 1
        cambio.notify_all()          # chi aspetta (la pagina) riparte subito


def ascolta_wifi():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('', PORTA_UDP))
    print('In ascolto del radar sul Wi-Fi, porta UDP', PORTA_UDP)
    while True:
        dati, _ = s.recvfrom(256)
        if len(dati) < 35 or dati[:4] != MAGIA:
            continue
        radar = dati[4]
        pubblica(bersagli(dati[11:35]), radar)


def leggi_seriale(porta):
    import serial                    # python3-serial, già nel sistema
    s = serial.Serial(porta, VELOCITA, timeout=0.05)
    resto = b''
    while True:
        resto += s.read(64)
        while True:
            i = resto.find(b'\xAA\xFF\x03\x00')
            if i < 0 or len(resto) < i + 30:
                resto = resto[max(0, len(resto) - 30):] if i < 0 else resto[i:]
                break
            quadro, resto = resto[i:i + 30], resto[i + 30:]
            if quadro[28:30] != b'\x55\xCC':
                continue
            pubblica(bersagli(quadro[4:28]), 0)


def finta():
    t0 = time.time()
    while True:
        t = time.time() - t0
        pubblica([{'x': int(1200 * math.sin(t / 2)), 'y': int(2200 + 600 * math.sin(t / 5)), 'v': 0}], 9)
        time.sleep(0.05)


class Servizio(BaseHTTPRequestHandler):
    def intestazioni(self):
        # la pagina arriva da internet (GitHub Pages) e chiede a localhost: servono questi permessi
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self.intestazioni(); self.end_headers()

    def do_GET(self):
        if self.path.startswith('/stato'):
            with cambio:
                corpo = json.dumps({'persone': stato['persone'], 'radar': stato['radar'], 'letture': stato['n'],
                                    'eta_ms': round((time.monotonic() - stato['quando']) * 1000)}).encode()
            self.send_response(200); self.intestazioni()
            self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(corpo); return
        if not self.path.startswith('/persone'):
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.intestazioni()
        self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-cache'); self.end_headers()
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)   # niente attese per riempire i pacchetti
        visto = -1
        try:
            while True:
                with cambio:
                    cambio.wait_for(lambda: stato['n'] != visto, timeout=1.0)
                    visto = stato['n']
                    eta = time.monotonic() - stato['quando']
                    dati = {'persone': stato['persone'] if eta < 1.5 else [], 'eta_ms': round(eta * 1000, 1), 'radar': stato['radar']}
                self.wfile.write(('data: ' + json.dumps(dati) + '\n\n').encode()); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *a):
        pass


def main():
    if '--prova' in sys.argv:
        threading.Thread(target=finta, daemon=True).start()
    else:
        threading.Thread(target=ascolta_wifi, daemon=True).start()
        if '--seriale' in sys.argv:
            porte = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*') + ['/dev/serial0']
            porta = next((p for p in porte if glob.glob(p)), None)
            if porta:
                def ciclo():
                    while True:
                        try:
                            leggi_seriale(porta)
                        except Exception as e:
                            print('radar:', e, file=sys.stderr); time.sleep(3)
                threading.Thread(target=ciclo, daemon=True).start()
                print('Radar anche sulla seriale', porta)
    print('Servizio su http://localhost:%d/persone' % PORTA_HTTP)
    ThreadingHTTPServer(('127.0.0.1', PORTA_HTTP), Servizio).serve_forever()


if __name__ == '__main__':
    main()
