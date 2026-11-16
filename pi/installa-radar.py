# installa-radar.py · 16/11 · il ricevitore del radar (pi/sensore.py) sul computer del TV (ROG Ally), SENZA PowerShell.
# Sulla Ally PowerShell non parte («Impossibile accedere al dispositivo…»): Maurizio ha scelto di installare con Python,
# che c'è già (lo usa il cucitore dei video). Fa le stesse cose di installa-radar.ps1:
#   1. scarica sensore.py in %LOCALAPPDATA%\IllusionistRadar;
#   2. mette «Illusionist Radar.cmd» in Esecuzione automatica: a ogni accesso riscarica sensore.py (se la rete c'è)
#      e lo avvia con pythonw, senza finestra;
#   3. lo avvia adesso e controlla che risponda su http://localhost:8788/stato;
#   4. manda com'è andata in finestre/banco/radar-<pc>.json (lo legge Claude).
# Non tocca impostazioni di Windows: legge soltanto la rete Wi-Fi in uso e le regole del firewall che parlano di Python.
# Se Windows chiede se Python può usare la rete, decide Maurizio: con «Consenti» le letture arrivano in broadcast,
# altrimenti il ricevitore si collega lui alla schedina (TCP in uscita).
# Uso (Esegui, Win+R):
#   py -3.12 -c "import urllib.request as u;exec(u.urlopen('https://mauriziotarsia-dev.github.io/finestre/pi/installa-radar.py').read())"
import json, os, re, socket, subprocess, sys, time, urllib.request

SITO = 'https://mauriziotarsia-dev.github.io/finestre/pi/'
U = 'https://olcfvghjfzyazogfsjbk.supabase.co'
CHIAVE = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0'
          '.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc')
pc = os.environ.get('COMPUTERNAME', 'pc')
nome = re.sub(r'[^a-z0-9-]', '', pc.lower()) or 'pc'
passi, dettagli = [], {}


def passo(t):
    riga = time.strftime('%H:%M:%S') + ' ' + t
    passi.append(riga)
    print('==', t, flush=True)


def rapporto(stato):
    corpo = json.dumps({'quando': time.strftime('%Y-%m-%dT%H:%M:%S'), 'pc': pc, 'stato': stato, 'via': 'python',
                        'passi': passi, 'dettagli': dettagli}, ensure_ascii=False, indent=1).encode()
    r = urllib.request.Request(U + '/storage/v1/object/dmaster-media/finestre/banco/radar-' + nome + '.json', data=corpo, method='POST',
                               headers={'apikey': CHIAVE, 'Authorization': 'Bearer ' + CHIAVE, 'x-upsert': 'true', 'Content-Type': 'image/png'})
    try:
        urllib.request.urlopen(r, timeout=20).read()
    except Exception as e:
        print('(rapporto non mandato:', e, ')')


def comando(*a):
    try:
        return subprocess.run(a, capture_output=True, timeout=20).stdout.decode('cp850', 'replace')
    except Exception as e:
        return 'errore: %s' % e


rapporto('inizio')
cartella = os.path.join(os.environ['LOCALAPPDATA'], 'IllusionistRadar')
os.makedirs(cartella, exist_ok=True)
py = sys.executable
pyw = py[:-len('python.exe')] + 'pythonw.exe' if py.lower().endswith('python.exe') else py
passo('python: %s · senza finestra: %s' % (py, pyw))

try:
    dati = urllib.request.urlopen(SITO + 'sensore.py', timeout=20).read()
    open(os.path.join(cartella, 'sensore.py'), 'wb').write(dati)
    passo('sensore.py scaricato (%d byte)' % len(dati))
except Exception as e:
    passo('sensore.py NON scaricato: %s' % e)

# l'avvio automatico: aggiorna sensore.py solo se lo scarica per intero (se la rete manca resta quello di prima)
aggiorna = ("import urllib.request as u;d=u.urlopen('" + SITO + "sensore.py',timeout=10).read();"
            "open('sensore.py','wb').write(d)")
cmd = ('@echo off\r\n'
       'rem Illusionist - ricevitore del radar per la prospettiva viva del TV (pi/installa-radar.py)\r\n'
       'cd /d "%s"\r\n'
       '"%s" -c "%s" >nul 2>&1\r\n'
       'start "" "%s" sensore.py\r\n') % (cartella, py, aggiorna, pyw)
avvio = os.path.join(os.environ['APPDATA'], r'Microsoft\Windows\Start Menu\Programs\Startup', 'Illusionist Radar.cmd')
open(avvio, 'w', encoding='ascii').write(cmd)
passo('avvio automatico: ' + avvio)

# un ricevitore vecchio ancora acceso (per esempio da avvio-g10.cmd) terrebbe la porta 8788: si chiude
def chiedi():
    try:
        return json.loads(urllib.request.urlopen('http://localhost:8788/stato', timeout=3).read())
    except Exception:
        return None
prima = chiedi()
if prima is not None:
    dettagli['primaDiInstallare'] = prima
    passo('c\'era già un ricevitore acceso: lo chiudo')
    passo('  ' + comando('wmic', 'process', 'where', "commandline like '%sensore.py%'", 'call', 'terminate').strip()[:300])
    time.sleep(2)

passo('parte adesso (se Windows chiede per la rete, decidi tu: funziona in tutti e due i casi)')
subprocess.Popen([pyw, 'sensore.py'], cwd=cartella, creationflags=0x00000008 | 0x00000200)   # DETACHED_PROCESS | NEW_PROCESS_GROUP
for _ in range(12):
    time.sleep(2)
    dettagli['ricevitore'] = chiedi()
    if dettagli['ricevitore'] and dettagli['ricevitore'].get('schedina'):
        break
passo('ricevitore: ' + json.dumps(dettagli['ricevitore']))

passo('rete in uso (solo lettura)')
wlan = comando('netsh', 'wlan', 'show', 'interfaces')
dettagli['wifi'] = [l.strip() for l in wlan.splitlines() if re.match(r'\s*(SSID|Stato|State|Banda|Band|Canale|Channel|Segnale|Signal)\b', l)]
try:
    dettagli['indirizzi'] = sorted({ip for ip in socket.gethostbyname_ex(socket.gethostname())[2] if not ip.startswith('127.')})
except Exception:
    pass
fw = comando('netsh', 'advfirewall', 'firewall', 'show', 'rule', 'name=all', 'verbose')
blocchi, uno = [], []
for l in fw.splitlines():
    if not l.strip():
        if any('python' in x.lower() for x in uno):
            blocchi.append([x.strip() for x in uno if re.match(r'\s*(Nome regola|Rule Name|Abilitato|Enabled|Direzione|Direction|Profili|Profiles|Azione|Action|Programma|Program)\b', x)])
        uno = []
    else:
        uno.append(l)
dettagli['firewallPython'] = blocchi[:12]

ok = bool(dettagli.get('ricevitore'))
rapporto('fatto' if ok else 'non risponde')
passo('FATTO: il ricevitore risponde' if ok else 'ATTENZIONE: il ricevitore non risponde')
print('\nQuesta finestra si chiude da sola fra 20 secondi.')
time.sleep(20)
