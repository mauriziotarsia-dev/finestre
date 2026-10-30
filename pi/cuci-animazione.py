#!/usr/bin/env python3
"""Cuce le animazioni dei paesaggi perché nella finestra sembrino vere.

Maurizio (30/10), guardando la città dalle torri animata: «la città vibra, si muove rispetto allo sfondo
di continuo … gli uccelli compaiono e scompaiono dal nulla … le nuvole ogni tanto è come se perdessero
qualche frame … la nebbia compare e scompare».

Il video che fa l'AI (Gemini Omni) ridisegna OGNI fotogramma da capo: anche quello che dovrebbe stare
fermo (case, torri, campi) cambia un po' a ogni immagine e trema di uno o due pixel. Misurato sulla città
dalle torri: le case cambiano ogni fotogramma quanto le nuvole, con scatti fino a 2 pixel; alcuni
fotogrammi sono doppi (le nuvole si fermano un attimo e ripartono); l'ultimo fotogramma non somiglia al
primo (al giro la scena salta) e la nebbia nasce a metà video, così a ogni giro sparisce di colpo.

Che cosa fa, fotogramma per fotogramma:
  1. FERMO: tutto quello che non è cielo e non si muove davvero viene da un'unica immagine di
     riferimento, la mediana dei primi due secondi (stabilizzati): niente tremolio, niente nebbia
     che nasce, gli stessi colori del video.
  2. CIELO: le nuvole restano quelle del video, stabilizzate e passate in una mediana di 5 fotogrammi
     che toglie gli uccelli (troppo veloci per sopravvivere) e il ribollire, non le nuvole (lente).
     Gli uccelli li disegna la finestra, entrando dai bordi.
  3. ACQUA E FUMO: le zone che si muovono sempre allo stesso modo dall'inizio alla fine (un fiume, il
     fumo dei camini) restano vive; quelle che CAMBIANO nel tempo (nebbia che sale) no.
  4. GIRO: gli ultimi 2 secondi sfumano nei primi, dentro il file: il giro non si vede più.
  5. 30 IMMAGINI AL SECONDO (interpolate): sugli schermi a 60 Hz ogni immagine resta esattamente due
     giri di schermo; a 24 restava ora due ora tre, ed era quello lo «scatto» delle nuvole.

Uso:
  python3 cuci-animazione.py entrata.mp4 uscita.mp4 [--profondita mappa.png --immagine giorno.jpg]
  python3 cuci-animazione.py --casa <chiave-della-casa> [--una]      (sul Raspberry: cuce da solo le nuove, a piena
                                                                      qualità e a bassa priorità; nel frattempo le finestre
                                                                      usano il fermo e la maschera fatti dal telefono)
Chi lo fa (Maurizio, 30/10: «dal più al meno performante, in ordine di disponibilità»): può girare insieme
su più apparecchi, e lo fa il più potente acceso: ognuno si fa vedere ogni 20 secondi, e
il più forte acceso lo prende subito; il primo che prende il lavoro lo segna e gli altri passano oltre.
  mini PC GMKtec G10 (Ryzen 5 3500U)   --forza 3    il più veloce (~6-8 minuti a video)
  laptop (Intel N100)                  --forza 2    quando è acceso (~10 minuti)
  Raspberry Pi 4                       --forza 1    sempre acceso, il più lento (~30-45 minuti)
Se il più forte è spento, il successivo parte al massimo entro un minuto e mezzo (subito, se è spento da prima); se è acceso ma occupato con un altro video,
dopo 2 minuti.
Su tutti gira a bassa priorità e con 2 processori: le finestre e il TV prima di tutto.
Serve: Python 3 con opencv e numpy, e ffmpeg.
  Raspberry:  sudo apt install python3-opencv ffmpeg
  Windows:    winget install Python.Python.3.12 Gyan.FFmpeg  poi  pip install opencv-python numpy
"""
import argparse, collections, hashlib, json, os, re, subprocess, sys, tempfile, threading, time, urllib.error, urllib.parse, urllib.request
import numpy as np
import cv2

SECONDI_GIRO = 3.0          # quanto dura la sfumatura fra la fine e l'inizio (nebbia e fumo la nascondono bene)
SECONDI_RIFERIMENTO = 2.0   # da quanti secondi iniziali nasce l'immagine ferma
FPS_USCITA = 30
FF_THREADS = '0'            # 0 = tutti i processori; sul Raspberry (--casa) 2


def leggi_info(percorso):
    c = cv2.VideoCapture(percorso)
    n = int(c.get(cv2.CAP_PROP_FRAME_COUNT)); fps = c.get(cv2.CAP_PROP_FPS) or 24
    w = int(c.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(c.get(cv2.CAP_PROP_FRAME_HEIGHT))
    c.release()
    return n, fps, w, h


def fotogrammi(percorso, da=0, quanti=None):
    c = cv2.VideoCapture(percorso)
    if da: c.set(cv2.CAP_PROP_POS_FRAMES, da)
    i = 0
    while quanti is None or i < quanti:
        ok, f = c.read()
        if not ok: break
        yield f; i += 1
    c.release()


def piccolo(f, lato=270):
    h, w = f.shape[:2]; s = lato / w
    return cv2.resize(f, (lato, int(round(h * s))), interpolation=cv2.INTER_AREA)


def maschera_cielo(w, h, profondita=None, immagine=None, fuoco_x=0.5, primo=None):
    """1 dove c'è cielo. Con la mappa di profondità del paesaggio (il cielo è quasi nero) riportata
    sull'inquadratura del video; senza, dal colore del primo fotogramma (in alto, chiaro o azzurro)."""
    if profondita is not None and immagine is not None:
        d = cv2.imread(profondita, cv2.IMREAD_GRAYSCALE); im = cv2.imread(immagine)
        ih, iw = im.shape[:2]
        d = cv2.resize(d, (iw, ih), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
        s = max(w / iw, h / ih); sw, sh = w / s, h / s           # il video è l'immagine «a copertura»
        x0 = (iw - sw) * fuoco_x; y0 = (ih - sh) / 2
        d = d[int(round(y0)):int(round(y0 + sh)), int(round(x0)):int(round(x0 + sw))]
        d = cv2.resize(d, (w, h), interpolation=cv2.INTER_LINEAR)
        m = np.clip((0.03 - d) / 0.02, 0, 1)
    else:
        f = primo.astype(np.float32) / 255
        l = f @ np.array([.114, .587, .299], np.float32)
        az = np.clip((f[..., 0] - f[..., 2]) * 2.5 + .3, 0, 1)
        y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        m = np.clip((.55 - y) / .35, 0, 1) * np.clip((l - .25) / .3, 0, 1) * np.maximum(az, np.clip((l - .6) / .25, 0, 1))
    # un filo dentro il bordo (un pixel di torre ribollente nel cielo si vedrebbe), poi morbido
    m = cv2.erode(m, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(m, (0, 0), 3)


def stima_spostamenti(percorso, fermo_basso):
    """Di quanto trema ogni fotogramma rispetto al primo, misurato su quello che dovrebbe stare fermo."""
    rif = None; sp = []
    finestra = None
    for f in fotogrammi(percorso):
        g = cv2.cvtColor(cv2.resize(f, None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
        g = g * fermo_basso
        if rif is None:
            rif = g; finestra = cv2.createHanningWindow((g.shape[1], g.shape[0]), cv2.CV_32F); sp.append((0., 0.)); continue
        (dx, dy), r = cv2.phaseCorrelate(rif, g, finestra)
        sp.append((dx * 2, dy * 2) if r > .05 and abs(dx) < 8 and abs(dy) < 8 else sp[-1])
    sp = np.array(sp, np.float32)
    # la deriva lenta si tiene (è il video), si tolgono gli scatti
    return sp


def sposta(f, dx, dy):
    if abs(dx) < .02 and abs(dy) < .02: return f
    M = np.float32([[1, 0, -dx], [0, 1, -dy]])
    return cv2.warpAffine(f, M, (f.shape[1], f.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def analizza(percorso, n, fps, w, h, cielo):
    """Spostamenti, immagine ferma e zone vive (acqua, fumo) in un passaggio solo, a bassa risoluzione dove si può."""
    fermo = 1 - cv2.resize(cielo, (w // 2, h // 2))
    sp = stima_spostamenti(percorso, fermo)
    k_rif = max(9, int(fps * SECONDI_RIFERIMENTO))
    passo = max(1, k_rif // 25)
    ref = []
    piccoli = []
    for i, f in enumerate(fotogrammi(percorso)):
        f = sposta(f, *sp[i])
        if i < k_rif and i % passo == 0: ref.append(f)
        piccoli.append(piccolo(f).astype(np.float32))
    riferimento = np.median(np.stack(ref), axis=0).astype(np.uint8)
    P = np.stack(piccoli)                                       # n × h' × w' × 3
    L = P @ np.array([.114, .587, .299], np.float32)
    q = max(4, len(L) // 5)
    vivo = L.std(0)                                             # quanto si muove
    tendenza = np.abs(L[-q:].mean(0) - L[:q].mean(0))           # quanto cambia fra inizio e fine (nebbia che sale)
    # vivo davvero: si muove molto più del ribollire, e alla fine è com'era all'inizio
    soglia = max(6.0, float(np.percentile(vivo, 70)) * 1.8)
    # ⚠ 30/10 (Maurizio: «si è perso l'effetto della nebbia sotto l'abbazia che mi piaceva molto»): la nebbia
    # che c'è già nel paesaggio e si muove (e il fumo dei camini) resta viva anche se scorre; quella che nasce
    # dal nulla a metà video (dove all'inizio c'era un prato) no
    rif_p = np.median(P[:max(9, int(fps * SECONDI_RIFERIMENTO))], axis=0).astype(np.uint8)
    hsv = cv2.cvtColor(rif_p, cv2.COLOR_BGR2HSV).astype(np.float32)
    nebbioso = ((hsv[..., 1] < 70) & (hsv[..., 2] > 120)).astype(np.uint8)
    nebbioso = cv2.dilate(nebbioso, np.ones((9, 9), np.uint8)) > 0
    z = (((vivo > soglia) & (tendenza < vivo * .6)) | ((vivo > soglia * .45) & nebbioso)).astype(np.float32)
    z = cv2.morphologyEx(z, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))   # niente puntini sparsi
    z = cv2.morphologyEx(z, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))  # i banchi di nebbia interi, non a chiazze
    z = cv2.dilate(z, np.ones((3, 3), np.uint8))
    zone = cv2.GaussianBlur(cv2.resize(z, (w, h), interpolation=cv2.INTER_LINEAR), (0, 0), 14)
    # il cielo: dove l'AI «inciampa» (un fotogramma di colpo più scuro e ridisegnato, a metà video) e quanto
    # scorre ogni nuvola, per ricucire lo strappo
    mc = cv2.resize(cielo, (L.shape[2], L.shape[1]))
    peso = mc.sum() + 1e-6
    luce = np.array([(P[i] * mc[..., None]).sum((0, 1)) / peso for i in range(len(P))])          # n × 3
    liscia = np.stack([np.convolve(np.pad(luce[:, k], 12, mode='edge'), np.exp(-np.arange(-12, 13) ** 2 / 72) / np.exp(-np.arange(-12, 13) ** 2 / 72).sum(), 'valid') for k in range(3)], 1)
    guadagni = np.clip(liscia / np.maximum(luce, 1), .9, 1.1)                                     # la luce del cielo senza sbalzi
    Lc = L * mc
    salti = np.array([0.] + [float((np.abs(Lc[i] - Lc[i - 1])).sum() / peso) for i in range(1, len(L))])
    scorre = [(0., 0.)] + [cv2.phaseCorrelate(Lc[i - 1], Lc[i])[0] for i in range(1, len(L))]
    scala = w / L.shape[2]
    scorre = np.array(scorre, np.float32) * scala
    soglia_salto = max(1.2, float(np.median(salti[1:])) * 2.5)
    strappi = [i for i in range(1, len(L)) if salti[i] > soglia_salto]
    for i in strappi:                                         # lo scorrere vero lì è quello dei vicini
        vicini = [scorre[j] for j in range(max(1, i - 4), min(len(L), i + 5)) if j not in strappi]
        if vicini: scorre[i] = np.median(vicini, axis=0)
    sostituti = ricuci(percorso, sp, strappi, scorre, len(L))
    return sp, riferimento, np.clip(zone, 0, 1), guadagni, sostituti, {
        'soglia_vivo': round(soglia, 1), 'parte_viva': round(float(z.mean()) * 100, 1), 'strappi_nel_cielo': strappi}


def ricuci(percorso, sp, strappi, scorre, n, raggio=4):
    """Attorno a ogni strappo del cielo, i fotogrammi si rifanno dai due sani ai lati: quello di prima
    spinto avanti quanto scorrono le nuvole, quello di dopo tirato indietro, sfumati. Lo strappo sparisce."""
    sost = {}
    for i in strappi:
        a, b = max(0, i - raggio), min(n - 1, i + raggio - 1)
        if b - a < 2: continue
        fa = sposta(next(fotogrammi(percorso, a, 1)), *sp[a]).astype(np.float32)
        fb = sposta(next(fotogrammi(percorso, b, 1)), *sp[b]).astype(np.float32)
        for j in range(a + 1, b):
            t = (j - a) / (b - a)
            avanti = scorre[a + 1:j + 1].sum(0); indietro = scorre[j + 1:b + 1].sum(0)
            sost[j] = sposta(fa, -avanti[0], -avanti[1]) * (1 - t) + sposta(fb, indietro[0], indietro[1]) * t
    return sost


class Cucitore:
    """Fotogrammi ripuliti da `da` in poi: fermo dal riferimento, cielo dal video (mediana di 5), zone vive dal video."""
    def __init__(self, percorso, da, sp, riferimento, cielo, zone, guadagni=None, sostituti=None):
        self.percorso, self.da, self.sp = percorso, da, sp
        self.guadagni, self.sostituti = guadagni, sostituti or {}
        self.rif = riferimento.astype(np.float32)
        # nelle zone vive si muove solo ciò che è chiaro e poco colorato (nebbia, fumo, acqua che luccica):
        # i cipressi scuri dentro un banco di nebbia restano fermi, la nebbia intorno scorre
        hsv = cv2.cvtColor(riferimento, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
        chiaro = np.clip((hsv[..., 2] - .38) / .22, 0, 1) * np.clip((.42 - hsv[..., 1]) / .22, 0, 1)
        chiaro = cv2.GaussianBlur(chiaro, (0, 0), 2)
        self.mc = cielo[..., None]; self.mz = (np.clip(zone - cielo, 0, 1) * chiaro)[..., None]

    def __iter__(self):
        primo = max(0, self.da - 2)
        it = enumerate(fotogrammi(self.percorso, primo), primo)
        buf = collections.OrderedDict(); finito = False; j = self.da
        while True:
            while not finito and (not buf or next(reversed(buf)) < j + 2):
                x = next(it, None)
                if x is None: finito = True; break
                i, f = x
                g = self.sostituti[i] if i in self.sostituti else sposta(f, *self.sp[min(i, len(self.sp) - 1)]).astype(np.float32)
                if self.guadagni is not None and i < len(self.guadagni): g = g * self.guadagni[i].astype(np.float32)
                buf[i] = g
            for i in [i for i in buf if i < j - 2]: del buf[i]
            if j not in buf: return
            vicini = [buf[i] for i in range(j - 2, j + 3) if i in buf]
            cielo5 = np.median(np.stack(vicini), axis=0) if len(vicini) >= 3 else buf[j]
            out = self.rif * (1 - self.mc - self.mz) + cielo5 * self.mc + buf[j] * self.mz
            yield np.clip(out, 0, 255).astype(np.uint8)
            j += 1


def cuci(entrata, uscita, profondita=None, immagine=None, fuoco_x=0.5, larghezza=None, veloce=False, fermo=None, maschera=None):
    n, fps, w, h = leggi_info(entrata)
    primo = next(fotogrammi(entrata))
    cielo = maschera_cielo(w, h, profondita, immagine, fuoco_x, primo)
    sp, rif, zone, guad, sost, info = analizza(entrata, n, fps, w, h, cielo)
    c = int(round(fps * SECONDI_GIRO))
    lung = n - c                                               # il giro: n - c fotogrammi
    # ⚠ 30/10: il video serve solo dove si muove (nebbia, fumo, acqua): il resto lo disegna il fermo a piena
    # risoluzione. Così il video può essere piccolo: alto al massimo 1080, che il Raspberry 4 decodifica col suo
    # circuito (1080×1920 no: lo decodificava il processore, e le finestre andavano a 30 immagini a scatti)
    if not larghezza and h > 1088: larghezza = int(round(w * 1080 / h / 2)) * 2
    W, H = (larghezza, int(round(h * larghezza / w / 2)) * 2) if larghezza else (w, h)
    filtro = (f'minterpolate=fps={FPS_USCITA}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' if not veloce
              else f'framerate=fps={FPS_USCITA}')
    if (W, H) != (w, h): filtro += f',scale={W}:{H}:flags=lanczos'
    n_uscita = int(round(lung / fps * FPS_USCITA))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', FF_THREADS, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
           '-vf', filtro, '-frames:v', str(n_uscita), '-an', '-c:v', 'libx264', '-preset', 'slow' if not veloce else 'veryfast', '-crf', '19',
           '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', uscita]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    inizio = iter(Cucitore(entrata, 0, sp, rif, cielo, zone, guad, sost))
    fine = iter(Cucitore(entrata, lung, sp, rif, cielo, zone, guad, sost))
    scritti = 0; testa = []
    for j in range(lung):
        a = next(inizio)
        if j < c:
            b = next(fine); t = (j + .5) / c; t = t * t * (3 - 2 * t)
            a = (b.astype(np.float32) * (1 - t) + a.astype(np.float32) * t).astype(np.uint8)
        if j < 4: testa.append(a)
        ff.stdin.write(a.tobytes()); scritti += 1
    # i primi fotogrammi di nuovo in coda: così anche quelli intermedi dell'ultimo tratto guardano
    # all'inizio del giro (poi si taglia al numero giusto: il giro dura esattamente lung / fps secondi)
    try:
        for a in testa: ff.stdin.write(a.tobytes())
        ff.stdin.close()
    except BrokenPipeError:
        pass                                                  # ffmpeg ha già i fotogrammi che gli servivano
    ff.wait()
    if ff.returncode: raise RuntimeError('ffmpeg non ha finito')
    # il fermo (a piena risoluzione) e la maschera di dove si muove: la finestra compone dal vivo
    if fermo: cv2.imwrite(fermo, rif, [cv2.IMWRITE_JPEG_QUALITY, 93])
    if maschera:
        m = np.clip(zone - cielo, 0, 1)
        cv2.imwrite(maschera, (cv2.resize(m, (270, int(round(270 * h / w))), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8))
    info.update({'video': f'{W}x{H}', 'fotogrammi_in': n, 'fps_in': round(fps, 2), 'secondi_giro': round(lung / fps, 2),
                 'tremolio_max_px': round(float(np.abs(sp).max()), 2), 'cielo_pct': round(float(cielo.mean()) * 100, 1)})
    return info


# ── sul Raspberry: cuce da solo le animazioni nuove della casa ───────────────────────────────────────────
URL = 'https://olcfvghjfzyazogfsjbk.supabase.co'
DEPOSITO = 'dmaster-media'
CHIAVE_PUBBLICA = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJp'
                   'YXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc')


def _chiedi(metodo, percorso, corpo=None, tipo='application/json', extra=None):
    h = {'apikey': CHIAVE_PUBBLICA, 'Authorization': 'Bearer ' + CHIAVE_PUBBLICA}
    if corpo is not None: h['Content-Type'] = tipo
    h.update(extra or {})
    r = urllib.request.Request(URL + percorso, data=corpo, method=metodo, headers=h)
    with urllib.request.urlopen(r, timeout=120) as x: return x.read()


def cartella_di(casa):
    return hashlib.sha256(('finestre:' + casa).encode()).hexdigest()[:24]


import base64
PUNTO_PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')


def _eta_minuti(f):
    t = f.get('created_at') or f.get('updated_at') or ''
    try:
        from datetime import datetime, timezone
        return (datetime.now(timezone.utc) - datetime.fromisoformat(t.replace('Z', '+00:00'))).total_seconds() / 60
    except Exception:
        return 1e9


def _prenota(cart, segno, chi):
    """Prende il lavoro: crea il file-segno (se c'è già, qualcun altro l'ha preso prima: la creazione fallisce)."""
    try:
        # il deposito accetta solo immagini e video: il segno è un'immagine di un punto (chi lo tiene sta nel registro)
        _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(segno), PUNTO_PNG, 'image/png')
        return True
    except urllib.error.HTTPError:
        return False


def _libera(cart, segno):
    try: _chiedi('DELETE', f'/storage/v1/object/{DEPOSITO}', json.dumps({'prefixes': [f'{cart}/{segno}']}).encode())
    except Exception: pass


def _eta_agg(f):
    """minuti dall'ultimo aggiornamento del file (per i segni rinfrescati)"""
    return _eta_minuti({'created_at': f.get('updated_at') or f.get('created_at')})


def _rinfresca(cart, nome):
    _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), PUNTO_PNG, 'image/png', {'x-upsert': 'true'})


def giro_casa(casa, larghezza=None, veloce=False, forza=1, chi='pc'):
    """Un giro: cuce le animazioni nuove. Possono girare più apparecchi insieme (mini PC, laptop, Raspberry):
    lo fa il più potente acceso, subito.
      · ognuno si fa vedere a ogni giro (ogni 20 secondi) con un segno di presenza «zz-cucitore-<forza>-<chi>.png»;
      · un video nuovo lo prende chi è acceso ed è il più forte: se uno più forte si è fatto vedere nell'ultimo
        minuto e mezzo, si lascia a lui; se dopo 2 minuti non l'ha ancora preso (è occupato con un altro), lo
        prende il primo libero;
      · il lavoro si prende con un segno «…_anim-giorno-incorso.png» che solo uno riesce a creare e che chi
        lavora rinfresca ogni 30 secondi: se non si rinfresca da 3 minuti, chi lavorava si è spento e si riprende.
    (Maurizio, 30/10: «il fallback non può essere dopo così tanti minuti»: niente più attese fisse.)"""
    cart = 'finestre/' + cartella_di(casa)
    io = f'zz-cucitore-{forza}-' + (re.sub(r'[^a-z0-9-]+', '-', chi.lower()).strip('-') or 'pc') + '.png'
    try: _rinfresca(cart, io)
    except Exception as e: print('presenza non segnata:', e, file=sys.stderr, flush=True)
    elenco = json.loads(_chiedi('POST', f'/storage/v1/object/list/{DEPOSITO}', json.dumps({'prefix': cart, 'limit': 1000}).encode()))
    file = {f['name']: f for f in elenco}
    nomi = list(file)
    piu_forte = any(n != io and (m := re.match(r'zz-cucitore-(\d+)-', n)) and int(m.group(1)) > forza and _eta_agg(f) < 1.5
                    for n, f in file.items())
    fatti = 0
    for nome in nomi:
        base, _, parte = nome.rpartition('_')                  # parte = anim-giorno.mp4
        if parte not in ('anim-giorno.mp4', 'anim-alba.mp4', 'anim-tramonto.mp4', 'anim-notte.mp4'): continue
        originale = f'{base}_{parte[:-4]}-originale.mp4'      # il file dell'AI resta qui, intatto (la libreria lo ignora)
        if originale in nomi: continue                         # già cucita
        if piu_forte and _eta_minuti(file[nome]) < 2: continue  # c'è uno più forte acceso: tocca a lui
        segno = f'{base}_{parte[:-4]}-incorso.png'
        if segno in file:
            if _eta_agg(file[segno]) < 3: continue             # ci sta lavorando un altro
            _libera(cart, segno)
        if not _prenota(cart, segno, chi): continue
        print(chi, 'cuce', nome, flush=True)
        vivo = threading.Event()
        def battito():
            while not vivo.wait(30):
                try: _rinfresca(cart, segno); _rinfresca(cart, io)
                except Exception: pass
        threading.Thread(target=battito, daemon=True).start()
        try:
            fatti += _cuci_uno(cart, nomi, nome, base, parte, originale, larghezza, veloce)
        finally:
            vivo.set(); _libera(cart, segno)
    return fatti


def _cuci_uno(cart, nomi, nome, base, parte, originale, larghezza, veloce):
    if True:
        pub = lambda n: f'{URL}/storage/v1/object/public/{DEPOSITO}/{cart}/' + urllib.parse.quote(n)
        with tempfile.TemporaryDirectory() as d:
            e, u = os.path.join(d, 'e.mp4'), os.path.join(d, 'u.mp4')
            urllib.request.urlretrieve(pub(nome), e)
            prof = imm = None
            if f'{base}_profondita.png' in nomi and f'{base}_giorno.jpg' in nomi:
                prof, imm = os.path.join(d, 'p.png'), os.path.join(d, 'g.jpg')
                urllib.request.urlretrieve(pub(f'{base}_profondita.png'), prof); urllib.request.urlretrieve(pub(f'{base}_giorno.jpg'), imm)
            fx = 0.5
            for kw in (base.split('@', 1)[1].split('.') if '@' in base else []):
                if kw.startswith('fx') and kw[2:].isdigit(): fx = min(100, int(kw[2:])) / 100
            fj, mp = os.path.join(d, 'f.jpg'), os.path.join(d, 'm.png')
            info = cuci(e, u, prof, imm, fx, larghezza, veloce, fj, mp)
            _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(originale), open(e, 'rb').read(), 'video/mp4')
            _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), open(u, 'rb').read(), 'video/mp4',
                    {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            # fermo e maschera nuovi, al posto di quelli fatti dal telefono alla creazione (js/fermo.js)
            ora = parte[5:-4]
            for nf, fl, tipo in ((f'{base}_fermo-{ora}.jpg', fj, 'image/jpeg'), (f'{base}_maschera-{ora}.png', mp, 'image/png')):
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nf), open(fl, 'rb').read(), tipo,
                        {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            print('  fatto:', info, flush=True)
            return 1


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('entrata', nargs='?'); a.add_argument('uscita', nargs='?')
    a.add_argument('--profondita'); a.add_argument('--immagine'); a.add_argument('--fuoco', type=float, default=.5)
    a.add_argument('--fermo', help='dove salvare il paesaggio fermo (jpg)'); a.add_argument('--maschera', help='dove salvare la maschera (png)')
    a.add_argument('--larghezza', type=int, help='larghezza del video cucito (es. 720); di serie quella dell\'originale')
    a.add_argument('--veloce', action='store_true', help='fotogrammi intermedi sfumati invece che calcolati (Raspberry)')
    a.add_argument('--casa', help='chiave della casa: cuce le animazioni nuove nel deposito')
    a.add_argument('--una', action='store_true', help='con --casa: un giro solo e poi esce')
    a.add_argument('--forza', type=int, default=1, help='con --casa: quanto è potente (3 mini PC, 2 laptop, 1 Raspberry): lo fa il più forte acceso')
    a.add_argument('--chi', default=os.environ.get('COMPUTERNAME') or (os.uname().nodename if hasattr(os, 'uname') else 'pc'), help='nome di questo apparecchio (nei segni)')
    o = a.parse_args()
    if o.casa:
        # sul Raspberry che intanto disegna le finestre: priorità bassa e pochi processori, le finestre prima di tutto
        try: os.nice(19)
        except Exception:
            try:                                              # Windows: priorità «inferiore al normale»
                import ctypes; ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)
            except Exception: pass
        cv2.setNumThreads(2); global FF_THREADS; FF_THREADS = '2'
        while True:
            try: giro_casa(o.casa, o.larghezza, veloce=o.veloce, forza=o.forza, chi=o.chi)
            except Exception as e: print('giro non riuscito:', e, file=sys.stderr, flush=True)
            if o.una: break
            time.sleep(20)
        return
    if not (o.entrata and o.uscita): a.error('servono entrata e uscita (oppure --casa)')
    print(json.dumps(cuci(o.entrata, o.uscita, o.profondita, o.immagine, o.fuoco, o.larghezza, o.veloce, o.fermo, o.maschera), indent=1))


if __name__ == '__main__':
    main()
