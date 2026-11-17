# togli-radar.py · 17/11 · toglie il ricevitore del radar dal computer del TV (ROG Ally), SENZA PowerShell.
# Maurizio, dopo le prove del 16-17/11: «togliamo il radar e risistema tutto senza». Toglie solo cose messe da noi:
#   1. chiude il ricevitore acceso (chi tiene la porta 8788, trovato con netstat);
#   2. cancella «Illusionist Radar.cmd» dall'Esecuzione automatica e la cartella %LOCALAPPDATA%\IllusionistRadar;
#   3. cancella il sensore.py che il cucitore vecchio aveva scaricato accanto a sé (solo se è davvero il nostro);
#   4. manda com'è andata in finestre/banco/radar-<pc>.json (lo legge Claude).
# Non tocca impostazioni di Windows. Uso (Gestione attività → Esegui nuova attività):
#   py -3.12 -c "import urllib.request as u;exec(u.urlopen('https://mauriziotarsia-dev.github.io/finestre/pi/togli-radar.py').read())"
import glob, json, os, re, shutil, subprocess, time, urllib.request

U = 'https://olcfvghjfzyazogfsjbk.supabase.co'
CHIAVE = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0'
          '.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc')
pc = os.environ.get('COMPUTERNAME', 'pc')
nome = re.sub(r'[^a-z0-9-]', '', pc.lower()) or 'pc'
passi = []


def passo(t):
    passi.append(time.strftime('%H:%M:%S') + ' ' + t)
    print('==', t, flush=True)


def comando(*a):
    try:
        return subprocess.run(a, capture_output=True, timeout=20).stdout.decode('cp850', 'replace')
    except Exception as e:
        return 'errore: %s' % e


# 1. il ricevitore acceso: chi ascolta sulla 8788 (indirizzo locale …:8788, remoto 0.0.0.0:0)
pid = {c[-1] for c in (r.split() for r in comando('netstat', '-ano', '-p', 'TCP').splitlines())
       if len(c) >= 5 and c[1].endswith(':8788') and c[2] in ('0.0.0.0:0', '[::]:0') and c[-1].isdigit()}
for p in pid:
    passo('ricevitore %s: %s' % (p, comando('taskkill', '/F', '/PID', p).strip()[:200]))
if not pid:
    passo('nessun ricevitore acceso sulla porta 8788')

# 2. l'avvio automatico e la cartella del ricevitore
avvio = os.path.join(os.environ['APPDATA'], r'Microsoft\Windows\Start Menu\Programs\Startup')
f = os.path.join(avvio, 'Illusionist Radar.cmd')
if os.path.exists(f):
    os.remove(f); passo('tolto dall\'avvio automatico: Illusionist Radar.cmd')
else:
    passo('Illusionist Radar.cmd non c\'era')
cartella = os.path.join(os.environ['LOCALAPPDATA'], 'IllusionistRadar')
time.sleep(1)
if os.path.isdir(cartella):
    shutil.rmtree(cartella, ignore_errors=True)
    passo('cartella IllusionistRadar ' + ('cancellata' if not os.path.exists(cartella) else 'NON cancellata del tutto'))
else:
    passo('cartella IllusionistRadar non c\'era')

# 3. il sensore.py accanto al cucitore (lo scaricava il cucitore vecchio): la cartella si legge dagli avvii automatici
for cmd in glob.glob(os.path.join(avvio, '*.cmd')) + glob.glob(os.path.join(avvio, '*.bat')):
    try:
        testo = open(cmd, encoding='utf-8', errors='replace').read()
    except Exception:
        continue
    for cuci in re.findall(r'[A-Za-z]:\\[^"\r\n]*?cuci-animazione\.py', testo):
        s = os.path.join(os.path.dirname(os.path.expandvars(cuci)), 'sensore.py')
        if os.path.exists(s):
            try:
                if b'8788' in open(s, 'rb').read() or b'radar' in open(s, 'rb').read():
                    os.remove(s); passo('cancellato ' + s)
            except Exception as e:
                passo('%s non cancellato: %s' % (s, e))
passo('avvio automatico adesso: ' + ', '.join(sorted(os.listdir(avvio))))

corpo = json.dumps({'quando': time.strftime('%Y-%m-%dT%H:%M:%S'), 'pc': pc, 'stato': 'radar tolto', 'passi': passi},
                   ensure_ascii=False, indent=1).encode()
r = urllib.request.Request(U + '/storage/v1/object/dmaster-media/finestre/banco/radar-' + nome + '.json', data=corpo, method='POST',
                           headers={'apikey': CHIAVE, 'Authorization': 'Bearer ' + CHIAVE, 'x-upsert': 'true', 'Content-Type': 'image/png'})
try:
    urllib.request.urlopen(r, timeout=20).read()
except Exception as e:
    print('(rapporto non mandato:', e, ')')
print('\nFATTO. Questa finestra si chiude da sola fra 15 secondi.')
time.sleep(15)
