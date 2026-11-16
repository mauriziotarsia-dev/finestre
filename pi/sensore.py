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
     47250 (programma in esp32/radar-udp). Il radar può stare nella stanza, il computer altrove.
     16/11: gira su qualunque computer di casa con Python (oggi la ROG Ally del TV, Windows).
     Se il broadcast non arriva (Windows che blocca la porta in ingresso, router che non lo inoltra),
     dopo 3 secondi di silenzio il ricevitore cerca la schedina nella rete di casa e le si collega lui
     (TCP, porta 47251): una connessione in uscita, che Windows lascia passare senza chiedere niente.
     Ogni pacchetto ha il suo numero: se arriva per tutte e due le strade, passa una volta sola.
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
PORTA_TCP = 47251                     # la stessa lettura, chiesta dal ricevitore (vedi cerca_schedina)
VELOCITA = 256000                    # baud del LD2450
MAGIA = b'LD24'                      # pacchetto dell'ESP32: LD24 · id radar · numero · millis · 24 byte dei bersagli

stato = {'persone': [], 'quando': 0.0, 'radar': None, 'n': 0, 'via': None, 'schedina': None}
ultimo_udp = [0.0]                   # quando è arrivato l'ultimo pacchetto in broadcast
numeri = {}                          # radar → numero dell'ultimo pacchetto passato
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


def nuovo(radar, numero):
    """Vero se il pacchetto non è già passato per l'altra strada (i numeri ricominciano dopo 65535)."""
    prima = numeri.get(radar)
    if prima is not None and not (0 < (numero - prima) % 65536 < 32768):
        return False
    numeri[radar] = numero
    return True


def pacchetto(dati, via):
    """Un pacchetto dell'ESP32: LD24 · id radar · numero (2 byte) · millis (4 byte) · 24 byte dei bersagli."""
    if len(dati) < 35 or dati[:4] != MAGIA:
        return
    radar, numero = dati[4], dati[5] | (dati[6] << 8)
    with cambio:
        if not nuovo(radar, numero):
            return
    pubblica(bersagli(dati[11:35]), radar, via)


def pubblica(lista, radar=None, via=None):
    with cambio:
        stato['persone'], stato['quando'], stato['radar'], stato['via'] = lista, time.monotonic(), radar, via
        stato['n'] += 1
        cambio.notify_all()          # chi aspetta (la pagina) riparte subito


def ascolta_wifi():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('', PORTA_UDP))
    print('In ascolto del radar sul Wi-Fi, porta UDP', PORTA_UDP)
    while True:
        dati, chi = s.recvfrom(256)
        if len(dati) >= 35 and dati[:4] == MAGIA:
            ultimo_udp[0] = time.monotonic()
            stato['schedina'] = chi[0]
            pacchetto(dati, 'udp')


def miei_indirizzi():
    """Gli indirizzi di questo computer nella rete di casa (senza mandare niente a nessuno)."""
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1))
        ips.add(s.getsockname()[0]); s.close()
    except OSError:
        pass
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return [ip for ip in ips if not ip.startswith(('127.', '169.254.'))]


def prova(ip):
    try:
        return socket.create_connection((ip, PORTA_TCP), timeout=0.5)
    except OSError:
        return None


def trova_schedina():
    """Prima l'indirizzo dell'ultima volta e il nome della schedina, poi tutta la rete di casa (254 indirizzi, mezzo secondo)."""
    from concurrent.futures import ThreadPoolExecutor
    for ip in [stato['schedina']] if stato['schedina'] else []:
        c = prova(ip)
        if c:
            return c, ip
    try:
        ip = socket.gethostbyname('radar-dmaster.local')
        c = prova(ip)
        if c:
            return c, ip
    except OSError:
        pass
    candidati = []
    for mio in miei_indirizzi():
        base = mio.rsplit('.', 1)[0]
        candidati += [base + '.' + str(k) for k in range(1, 255) if base + '.' + str(k) != mio]
    trovata = None
    with ThreadPoolExecutor(max_workers=128) as ex:
        for ip, c in zip(candidati, ex.map(prova, candidati)):
            if c and not trovata:
                trovata = (c, ip)
            elif c:
                c.close()
    return trovata or (None, None)


def cerca_schedina():
    """Se il broadcast tace da 3 secondi, ci si collega noi alla schedina (TCP). Windows lascia passare le
    connessioni in uscita senza chiedere: niente avviso del firewall, niente impostazioni di rete."""
    while True:
        time.sleep(1)
        if time.monotonic() - ultimo_udp[0] < 3:
            continue
        c, ip = trova_schedina()
        if not c:
            time.sleep(15)
            continue
        print('Collegato alla schedina del radar', ip)
        stato['schedina'] = ip
        c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        c.settimeout(5)
        resto = b''
        try:
            while True:
                dati = c.recv(512)
                if not dati:
                    break
                resto += dati
                while True:
                    i = resto.find(MAGIA)
                    if i < 0:
                        resto = resto[-3:]
                        break
                    if len(resto) < i + 35:
                        resto = resto[i:]
                        break
                    pacchetto(resto[i:i + 35], 'tcp')
                    resto = resto[i + 35:]
        except OSError:
            pass
        c.close()
        print('Schedina del radar persa: la cerco di nuovo')


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
                                    'eta_ms': round((time.monotonic() - stato['quando']) * 1000) if stato['n'] else None,
                                    'via': stato['via'], 'schedina': stato['schedina']}).encode()
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
        threading.Thread(target=cerca_schedina, daemon=True).start()
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
