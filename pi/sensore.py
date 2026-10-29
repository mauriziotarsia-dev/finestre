#!/usr/bin/env python3
"""Sensore di presenza per la «prospettiva viva» delle finestre.

Legge il radar HLK-LD2450 (fino a 3 persone, posizione in mm) dalla seriale e offre le posizioni
alla pagina della finestra come flusso di eventi su http://localhost:8787/persone.

Collegamento (consigliato): il kit con la schedina USB → una porta USB del Raspberry (/dev/ttyUSB0).
In alternativa ai pin: 5V→pin 2, GND→pin 6, TX del radar→pin 10 (RXD), RX del radar→pin 8 (TXD),
con la seriale abilitata (raspi-config → Interface → Serial: no console, sì hardware) → /dev/serial0.

Avvio:  python3 ~/finestre/pi/sensore.py            (cerca da solo la porta)
        python3 ~/finestre/pi/sensore.py --prova    (senza radar: una persona finta che passeggia)
"""
import glob, json, math, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA_HTTP = 8787
VELOCITA = 256000                    # baud del LD2450
persone = []                         # [{'x': mm, 'y': mm, 'v': cm/s}]
aggiornato = 0.0
blocco = threading.Lock()


def valore(lo, hi):
    """Il LD2450 scrive il segno nel bit alto al contrario: 1 = positivo."""
    raw = lo | (hi << 8)
    return (raw & 0x7FFF) if raw & 0x8000 else -(raw & 0x7FFF)


def leggi_radar(porta):
    import serial                    # python3-serial, già nel sistema
    s = serial.Serial(porta, VELOCITA, timeout=1)
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
            trovate = []
            for k in range(3):
                b = quadro[4 + k * 8: 12 + k * 8]
                if not any(b):
                    continue
                x, y, v = valore(b[0], b[1]), valore(b[2], b[3]), valore(b[4], b[5])
                trovate.append({'x': x, 'y': y, 'v': v})
            pubblica(trovate)


def finta():
    t0 = time.time()
    while True:
        t = time.time() - t0
        pubblica([{'x': int(1200 * math.sin(t / 4)), 'y': int(2200 + 600 * math.sin(t / 7)), 'v': 0}])
        time.sleep(0.1)


def pubblica(lista):
    global persone, aggiornato
    with blocco:
        persone, aggiornato = lista, time.time()


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
            with blocco:
                corpo = json.dumps({'persone': persone, 'eta': round(time.time() - aggiornato, 1)}).encode()
            self.send_response(200); self.intestazioni()
            self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(corpo); return
        if not self.path.startswith('/persone'):
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.intestazioni()
        self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-cache'); self.end_headers()
        try:
            while True:
                with blocco:
                    fresche = time.time() - aggiornato < 1.5
                    dati = {'persone': persone if fresche else []}
                self.wfile.write(('data: ' + json.dumps(dati) + '\n\n').encode()); self.wfile.flush()
                time.sleep(0.1)                         # 10 volte al secondo
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *a):
        pass


def main():
    if '--prova' in sys.argv:
        threading.Thread(target=finta, daemon=True).start()
    else:
        porte = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*') + ['/dev/serial0']
        porta = next((p for p in porte if glob.glob(p)), None)
        if not porta:
            sys.exit('Nessuna porta seriale trovata: il radar è collegato?')
        def ciclo():
            while True:
                try:
                    leggi_radar(porta)
                except Exception as e:
                    print('radar:', e, file=sys.stderr); time.sleep(3)
        threading.Thread(target=ciclo, daemon=True).start()
        print('Radar su', porta)
    print('Servizio su http://localhost:%d/persone' % PORTA_HTTP)
    ThreadingHTTPServer(('127.0.0.1', PORTA_HTTP), Servizio).serve_forever()


if __name__ == '__main__':
    main()
