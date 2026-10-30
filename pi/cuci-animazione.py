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
  python3 cuci-animazione.py --casa <chiave-della-casa> [--una]      (sul Raspberry: cuce da solo le nuove)
Serve: python3-opencv, python3-numpy, ffmpeg  (sudo apt install python3-opencv ffmpeg)
"""
import argparse, collections, hashlib, json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request
import numpy as np
import cv2

SECONDI_GIRO = 3.0          # quanto dura la sfumatura fra la fine e l'inizio (nebbia e fumo la nascondono bene)
SECONDI_RIFERIMENTO = 2.0   # da quanti secondi iniziali nasce l'immagine ferma
FPS_USCITA = 30


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


def cuci(entrata, uscita, profondita=None, immagine=None, fuoco_x=0.5, larghezza=None, veloce=False):
    n, fps, w, h = leggi_info(entrata)
    primo = next(fotogrammi(entrata))
    cielo = maschera_cielo(w, h, profondita, immagine, fuoco_x, primo)
    sp, rif, zone, guad, sost, info = analizza(entrata, n, fps, w, h, cielo)
    c = int(round(fps * SECONDI_GIRO))
    lung = n - c                                               # il giro: n - c fotogrammi
    W, H = (larghezza, int(round(h * larghezza / w / 2)) * 2) if larghezza else (w, h)
    filtro = (f'minterpolate=fps={FPS_USCITA}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' if not veloce
              else f'framerate=fps={FPS_USCITA}')
    if (W, H) != (w, h): filtro += f',scale={W}:{H}:flags=lanczos'
    n_uscita = int(round(lung / fps * FPS_USCITA))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
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
    info.update({'fotogrammi_in': n, 'fps_in': round(fps, 2), 'secondi_giro': round(lung / fps, 2),
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


def giro_casa(casa, larghezza=None, veloce=True):
    cart = 'finestre/' + cartella_di(casa)
    nomi = [f['name'] for f in json.loads(_chiedi('POST', f'/storage/v1/object/list/{DEPOSITO}',
            json.dumps({'prefix': cart, 'limit': 1000}).encode()))]
    fatti = 0
    for nome in nomi:
        if '_anim-' not in nome or not nome.endswith('.mp4'): continue
        base, parte = nome.rsplit('_', 1)                      # parte = anim-giorno.mp4
        originale = f'{base}_{parte[:-4]}-originale.mp4'      # il file dell'AI resta qui, intatto (la libreria lo ignora)
        if originale in nomi: continue                         # già cucita
        print('Cucio', nome, flush=True)
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
            info = cuci(e, u, prof, imm, fx, larghezza, veloce)
            _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(originale), open(e, 'rb').read(), 'video/mp4')
            _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), open(u, 'rb').read(), 'video/mp4',
                    {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            print('  fatto:', info, flush=True); fatti += 1
    return fatti


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('entrata', nargs='?'); a.add_argument('uscita', nargs='?')
    a.add_argument('--profondita'); a.add_argument('--immagine'); a.add_argument('--fuoco', type=float, default=.5)
    a.add_argument('--larghezza', type=int, help='larghezza del video cucito (es. 720); di serie quella dell\'originale')
    a.add_argument('--veloce', action='store_true', help='fotogrammi intermedi sfumati invece che calcolati (Raspberry)')
    a.add_argument('--casa', help='chiave della casa: cuce le animazioni nuove nel deposito')
    a.add_argument('--una', action='store_true', help='con --casa: un giro solo e poi esce')
    o = a.parse_args()
    if o.casa:
        while True:
            try: giro_casa(o.casa, o.larghezza, veloce=True if o.veloce or not o.una else o.veloce)
            except Exception as e: print('giro non riuscito:', e, file=sys.stderr, flush=True)
            if o.una: break
            time.sleep(120)
        return
    if not (o.entrata and o.uscita): a.error('servono entrata e uscita (oppure --casa)')
    print(json.dumps(cuci(o.entrata, o.uscita, o.profondita, o.immagine, o.fuoco, o.larghezza, o.veloce), indent=1))


if __name__ == '__main__':
    main()
