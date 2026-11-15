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

INGRANDIMENTO AI (Maurizio, 30/10: «voglio 4K sulla TV grande»). Con la prospettiva viva la finestra ingrandisce
l'immagine del 20% per avere un bordo da scoprire: l'immagine deve essere 1,2 volte lo schermo, e l'AI non ci arriva
(foto 832×2080 o 768×1344, video 720×1280 o 1080×1920; per il TV 4K servirebbero 4608×2592). Sui computer con una
scheda video (mini PC, laptop; non il Raspberry) le foto, i cieli e il fermo dei video vengono ingranditi con
Real-ESRGAN, che ridisegna i dettagli invece di allargare i pixel:
  finestrelle (immagini verticali)   2560 di altezza    → nel foro 656×1640 la risoluzione piena anche a 40 cm
  TV (immagini orizzontali)          4608 di larghezza  → 4K vero (3840×2160) col bordo per la prospettiva
  cielo che scorre                   fino a 4096×2048   (oltre, il Raspberry non lo carica)
Il video resta piccolo: serve solo dove si muove (nebbia, fumo, acqua), tutto il resto lo disegna il fermo.
L'originale dell'AI resta accanto, «…-originale.jpg».

Serve: Python 3 con opencv e numpy, e ffmpeg; per l'ingrandimento anche realesrgan-ncnn-py (Python 3.12).
  Raspberry:  sudo apt install python3-opencv ffmpeg
  Windows:    winget install Python.Python.3.12 Gyan.FFmpeg  poi  pip install opencv-python numpy realesrgan-ncnn-py
"""
import argparse, base64, collections, gzip, hashlib, json, os, re, socket, ssl, struct, subprocess, sys, tempfile, threading, time, urllib.error, urllib.parse, urllib.request
import numpy as np
import cv2

SECONDI_GIRO = 3.0          # quanto dura la sfumatura fra la fine e l'inizio (nebbia e fumo la nascondono bene)
SECONDI_RIFERIMENTO = 2.0   # da quanti secondi iniziali nasce l'immagine ferma
FPS_USCITA = 30
FF_THREADS = '0'
SENZA_CIELO = False         # 13/11: True mentre si cuce un interno            # 0 = tutti i processori; sul Raspberry (--casa) 2


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
    sull'inquadratura del video; senza, dal colore del primo fotogramma (in alto, chiaro o azzurro).
    13/11: in un interno (la taverna, parola «interno») il cielo non c'è: le travi in alto non vanno prese per cielo."""
    if SENZA_CIELO: return np.zeros((h, w), np.float32)
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
    if SENZA_CIELO: return _spostamenti_dentro(percorso)
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


def _spostamenti_dentro(percorso):
    """⚠ 15/11 (Maurizio, video del TV dal telefono: «l'immagine trema e si sposta»). In un interno la cuoca e il fuoco
    occupano una bella parte del quadro: misurando il tremolio su tutto, la correzione inseguiva loro e il video tremava
    più dell'originale (mensola del camino: fino a 3 px contro 1,6). Poi, misurato sul video sullo schermo, restavano
    scatti di 1-3 px in fotogrammi singoli. Ora si seguono uno per uno i punti di contorno che stanno fermi (dove lo
    scarto nel tempo è piccolo) e lo spostamento di ogni fotogramma è la mediana dei loro spostamenti."""
    G = [cv2.cvtColor(cv2.resize(f, None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY) for f in fotogrammi(percorso)]
    S = np.stack(G[::max(1, len(G) // 60)]).astype(np.float32).std(0)
    fermo = cv2.erode((S < 5).astype(np.uint8), np.ones((7, 7), np.uint8)) * 255
    p0 = cv2.goodFeaturesToTrack(G[0], 400, .01, 6, mask=fermo)
    if p0 is None or len(p0) < 12:
        rif = G[0].astype(np.float32); fin = cv2.createHanningWindow((G[0].shape[1], G[0].shape[0]), cv2.CV_32F)
        return np.array([(0., 0.)] + [tuple(2 * v for v in cv2.phaseCorrelate(rif, g.astype(np.float32), fin)[0]) for g in G[1:]], np.float32)
    sp = [(0., 0.)]
    for g in G[1:]:
        p1, st, err = cv2.calcOpticalFlowPyrLK(G[0], g, p0, None, winSize=(21, 21), maxLevel=3)
        ok = st[:, 0] == 1
        if ok.sum() < 8: sp.append(sp[-1]); continue
        d = (p1 - p0)[ok, 0]; med = np.median(d, 0)
        buoni = np.hypot(*(d - med).T) < 1.0                      # via i punti che si sono mossi davvero (una mano che passa)
        dx, dy = np.median(d[buoni], 0) if buoni.sum() >= 6 else med
        sp.append((float(dx) * 2, float(dy) * 2) if abs(dx) < 8 and abs(dy) < 8 else sp[-1])
    return np.array(sp, np.float32)


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
    # ⚠ 14/11 notte · DENTRO: LE PERSONE E LE FIAMME (Maurizio, davanti alla taverna: «Anima di più la taverna di giorno»,
    # «per un movimento più marcato dei personaggi?»). Il video dell'AI della taverna il movimento l'aveva: la cuoca
    # impasta, si china, gira la testa (misurato: nella sua zona la luce cambia di 22-37 livelli, il camino di 16).
    # Era il cucitore a toglierlo: nelle zone vive lascia passare dal video solo ciò che è chiaro e poco colorato
    # (nebbia, fumo, acqua: giusto per i paesaggi), quindi della cuoca si muovevano grembiule e cuffia sopra un corpo
    # fermo e sfocato (la mediana dei primi due secondi di una che si muove), e delle fiamme solo il cuore bianco.
    # In un interno, dove ci sono persone che si muovono e fiamme si prende il video intero, a colori pieni, con un
    # margine attorno perché braccia e teste non escano dalla zona; le zone «a nebbia» (raggi di luce, fumo) restano
    # com'erano. Non si chiede che la fine somigli all'inizio: una persona ferma e sfocata è peggio di un passaggio.
    forte = None
    if SENZA_CIELO:
        # chi cambia FORMA (le persone): si confronta l'immagine a contrasto locale normalizzato, così la luce del fuoco
        # che sale e scende su muri, soffitto e pavimento non conta (misurato a questa grandezza: cuoca .47, la sua testa
        # .89; muri, soffitto, pavimento, tavoli .08-.25). Poi le fiamme: dove la luce cambia moltissimo, con un margine
        # piccolo, perché lì attorno c'è il muro che nel fermo in 4K è più bello del video
        def _norm(x):
            m = cv2.GaussianBlur(x, (0, 0), 4); d = x - m
            return d / (np.sqrt(cv2.GaussianBlur(d * d, (0, 0), 4)) + 4.)
        forma = np.stack([_norm(x) for x in L]).std(0)
        pers = (forma > .42).astype(np.uint8)
        pers = cv2.morphologyEx(pers, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        nb, etich, stat, _ = cv2.connectedComponentsWithStats(pers, 8)
        tieni = np.zeros(nb, np.uint8); tieni[1:] = stat[1:, cv2.CC_STAT_AREA] >= max(10, L.shape[1] * L.shape[2] // 3000)
        pers = tieni[etich].astype(np.float32)
        # ⚠ 15/11 (Maurizio, finestrelle: «quando beve e solleva il bicchiere, la base del bicchiere rimane visibile ferma
        # sul tavolo»): quello che la persona tocca e sposta (il boccale, la scodella) per un po' non c'è più, ma la forma
        # di quel punto cambia poco nel resto del video: restava fuori dal video pieno, e il fermo ci lasciava il boccale.
        # Si aggiunge, vicino alle persone, ogni punto che almeno per un ventesimo del video è molto diverso dal solito
        lontano = np.percentile(np.abs(L - np.median(L, 0)), 95, axis=0)
        # solo attorno alle persone vere (macchie grandi: l'uomo al tavolo, a questa grandezza, è più di 500 punti), non
        # attorno ai puntini di polvere nei raggi o alle fiamme, che si porterebbero dietro muri e raggi interi
        grandi = np.zeros(nb, np.uint8); grandi[1:] = stat[1:, cv2.CC_STAT_AREA] >= max(30, L.shape[1] * L.shape[2] // 1200)
        semi = grandi[etich].astype(np.uint8)
        pers = np.maximum(pers, ((lontano > 18) & (cv2.dilate(semi, np.ones((21, 21), np.uint8)) > 0)).astype(np.float32))
        # ⚠ 15/11 (Maurizio: «la gonna in basso è ferma ma poi si vede lo stacco dove si muove»): della cuoca si muovono
        # braccia, busto e testa; la gonna ondeggia appena e restava fuori, ferma nel fermo, con lo stacco a metà gamba.
        # Sotto ogni persona vera la zona piena scende verso terra (per due quinti della sua altezza)
        nb2, et2, st2, _ = cv2.connectedComponentsWithStats(semi, 8)
        for k in range(1, nb2):
            x, y, ww, hh = st2[k, :4]; blob = (et2[y:y + hh, x:x + ww] == k).astype(np.float32)
            giu = int(hh * .4) + 3
            for d in range(1, giu, 2):
                y0 = y + d; y1 = min(pers.shape[0], y0 + hh)
                if y0 >= pers.shape[0]: break
                pers[y0:y1, x:x + ww] = np.maximum(pers[y0:y1, x:x + ww], blob[:y1 - y0])
        pers = cv2.morphologyEx(pers, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))   # una persona intera, non a pezzi
        pers = cv2.dilate(pers, np.ones((5, 5), np.uint8))                          # il margine per braccia e testa
        fiam = (vivo > max(18., soglia * 2.6)).astype(np.float32)
        fiam = cv2.dilate(cv2.morphologyEx(fiam, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)), np.ones((3, 3), np.uint8))
        zf = np.maximum(pers, fiam)
        forte = np.clip(cv2.GaussianBlur(cv2.resize(zf, (w, h), interpolation=cv2.INTER_LINEAR), (0, 0), 6) * 1.3, 0, 1)
        # le persone, piccole: per scegliere dove richiudere il giro e dove saltare fra i pezzi (15/11: senza le fiamme, che
        # tremolando di continuo coprivano i movimenti delle persone: il ritorno di corsa dell'uomo alla posa iniziale
        # risultava appena 1,5 volte il passo normale)
        firma = (L[:, pers > .5] if (pers > .5).sum() >= 40 else L[:, zf > .5]).astype(np.float16)
        zone = np.maximum(zone, forte)
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
        'soglia_vivo': round(soglia, 1), 'parte_viva': round(float(z.mean()) * 100, 1), 'strappi_nel_cielo': strappi,
        **({'parte_piena': round(float((forte > .5).mean()) * 100, 1), '_firma': firma} if forte is not None else {})}, forte


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
    def __init__(self, percorso, da, sp, riferimento, cielo, zone, guadagni=None, sostituti=None, forte=None):
        self.percorso, self.da, self.sp = percorso, da, sp
        self.guadagni, self.sostituti = guadagni, sostituti or {}
        self.rif = riferimento.astype(np.float32)
        # nelle zone vive si muove solo ciò che è chiaro e poco colorato (nebbia, fumo, acqua che luccica):
        # i cipressi scuri dentro un banco di nebbia restano fermi, la nebbia intorno scorre
        hsv = cv2.cvtColor(riferimento, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
        chiaro = np.clip((hsv[..., 2] - .38) / .22, 0, 1) * np.clip((.42 - hsv[..., 1]) / .22, 0, 1)
        chiaro = cv2.GaussianBlur(chiaro, (0, 0), 2)
        self.mc = cielo[..., None]; self.mz = (np.clip(zone - cielo, 0, 1) * chiaro)[..., None]
        # dentro: dove si muovono persone e fiamme il video passa intero (vedi «DENTRO: LE PERSONE E LE FIAMME»)
        if forte is not None: self.mz = np.maximum(self.mz, np.clip(forte - cielo, 0, 1)[..., None])

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
            yield np.clip(out + .5, 0, 255).astype(np.uint8)          # arrotondato: troncando, mezzo livello più scuro
            j += 1


def fermo_dalla_foto(rif, alta, zone, cielo, fx=0.5):
    """13/11 notte · Maurizio: «aumentiamo risoluzione, dettagli…». Le immagini ora arrivano in 4K, ma il fermo (tutto
    quello che non si muove) veniva dal video, a 1080: il dettaglio del 4K si perdeva proprio quando la scena è animata.
    Il video parte da quell'immagine con la camera ferma: si allinea la foto al video (ECC sulle parti ferme) e, se
    combacia, il fermo è la foto a piena risoluzione; i colori del video si portano verso la foto, così dove si muove
    (fuoco, candele, persone) non si vede il bordo. Se non combacia, resta il fermo del video. → (fermo, lut) o (None, None)"""
    img = cv2.imread(alta)
    if img is None: return None, None
    H, W = img.shape[:2]; h, w = rif.shape[:2]
    # 14/11 · il video è la foto ritagliata alla sua forma (js/ai.js, adatta: «cover», fx in orizzontale, centro in verticale):
    # si ritaglia la foto allo stesso modo, così combacia anche quando la foto è più stretta o più larga del video
    if abs(W / H - w / h) > .01:
        sc = max(w / W, h / H); sw, sh = w / sc, h / sc
        x0, y0 = int(round((W - sw) * fx)), int(round((H - sh) / 2))
        img = img[max(0, y0):max(0, y0) + int(round(sh)), max(0, x0):max(0, x0) + int(round(sw))]
        H, W = img.shape[:2]
    if W < w * 1.4 or abs(W / H - w / h) > .03: return None, None          # non più grande del video, o altra forma
    piccola = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
    ferme = ((cv2.resize(zone, (w, h)) < .1) & (cv2.resize(cielo, (w, h)) < .5)).astype(np.uint8)
    # 14/11 · era .3: nell'abbazia (40% cielo, nebbia che si muove in tutte le valli) le parti ferme sono il 25% e il fermo
    # tornava quello del video a 1080 proprio dove il 4K si vede (abbazia, cipressi, primo piano). Per allineare basta molto meno
    if ferme.mean() < .12: return None, None                               # quasi tutto si muove: meglio il video
    ga = cv2.GaussianBlur(cv2.cvtColor(rif, cv2.COLOR_BGR2GRAY), (0, 0), 1.2).astype(np.float32) / 255
    gb = cv2.GaussianBlur(cv2.cvtColor(piccola, cv2.COLOR_BGR2GRAY), (0, 0), 1.2).astype(np.float32) / 255
    M = np.eye(2, 3, dtype=np.float32)
    try:
        cc, M = cv2.findTransformECC(ga, gb, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), ferme, 5)
    except cv2.error:
        return None, None
    if cc < .9 or np.abs(M[:, :2] - np.eye(2)).max() > .05 or np.abs(M[:, 2]).max() > w * .04: return None, None
    Mg = M.copy(); Mg[:, 2] *= W / w                                       # lo stesso allineamento a piena risoluzione
    grande = cv2.warpAffine(img, Mg, (W, H), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    allineata = cv2.warpAffine(piccola, M, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    # i colori: per ogni canale, il video (rif) portato sulla foto dove sta fermo
    sel = ferme.astype(bool)
    lut = np.zeros((1, 256, 3), np.uint8)
    for c in range(3):
        v = rif[..., c][sel].astype(np.float32); f = allineata[..., c][sel].astype(np.float32)
        g = (f.std() + 1e-3) / (v.std() + 1e-3); o = f.mean() - g * v.mean()
        if not (.75 < g < 1.33) or abs(o) > 40: return None, None              # troppo diversi: non è la stessa scena
        lut[0, :, c] = np.clip(np.arange(256) * g + o + .5, 0, 255).astype(np.uint8)
    return grande, lut


_DIS = []


def _flusso(a, b):
    """Come si spostano i punti da a a b (a mezza risoluzione, poi riportato alla misura piena)."""
    if not _DIS: _DIS.append(cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM))
    h, w = a.shape[:2]
    g = [cv2.cvtColor(cv2.resize(x, (w // 2, h // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY) for x in (a, b)]
    return cv2.resize(_DIS[0].calc(g[0], g[1], None), (w, h)) * 2


def _tramezzo(a, b, t):
    """15/11 · il fotogramma a una frazione t (0…1) della strada fra la posa di a e quella di b, seguendo il movimento
    (braccia e testa si spostano invece di sfumare una nell'altra): float32"""
    f01, f10 = _flusso(a, b), _flusso(b, a)
    # quello che è fermo (muri, pentole) resta fermo: si muove solo dove le due pose sono davvero diverse (misurato sul
    # video sullo schermo: col solo limite sul flusso, nel passaggio del giro la cucina ballava ancora di 1-3 px)
    diversi = cv2.GaussianBlur(np.abs(a.astype(np.float32) - b.astype(np.float32)).max(2), (0, 0), 6)
    k = np.clip((diversi - 6) / 10, 0, 1); k = cv2.GaussianBlur(k * k * (3 - 2 * k), (0, 0), 8)
    for f in (f01, f10):
        v = np.clip((np.hypot(f[..., 0], f[..., 1]) - .6) / 1.2, 0, 1); f *= (v * v * (3 - 2 * v) * k)[..., None]
    ft0 = -(1 - t) * t * f01 + t * t * f10
    ft1 = (1 - t) ** 2 * f01 - t * (1 - t) * f10
    h, w = a.shape[:2]; gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    wa = cv2.remap(a, gx + ft0[..., 0], gy + ft0[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wb = cv2.remap(b, gx + ft1[..., 0], gy + ft1[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return wa.astype(np.float32) * (1 - t) + wb.astype(np.float32) * t


def giunte_dei_pezzi(n, fps):
    """15/11 · dove l'originale è fatto di più pezzi messi in fila (metti_in_fila: pezzi lunghi uguale, un numero intero
    di secondi, sfumati per SFUMA_PEZZI): i fotogrammi [inizio, fine) di ogni sfumata. Vuoto se non torna."""
    D = n / fps
    for k in (2, 3, 4):
        Lp = (D + (k - 1) * SFUMA_PEZZI) / k
        if 4 <= Lp <= 12 and abs(Lp - round(Lp)) < .08:
            return [(int(round(i * (Lp - SFUMA_PEZZI) * fps)), int(round((i * (Lp - SFUMA_PEZZI) + SFUMA_PEZZI) * fps))) for i in range(1, k)]
    return []


def _percorso_dentro(firma, n, fps):
    """⚠ 15/11 (Maurizio: «si vede il loop in due frame, dove penso vengano legati i due loop. Va sistemato»). I due pezzi
    dell'AI partono dalla stessa posa e dovrebbero tornarci, ma non ci tornano davvero: alla giunta e al giro la cuoca
    cambiava posa, e il passaggio (per quanto seguisse il movimento) si vedeva. Qui non si lega più fine con inizio
    a tempo fisso: si cerca, a cavallo di ogni giunta e del giro, la coppia di istanti in cui le persone sono più simili
    (misurato: circa due passi normali di differenza) e si salta dall'uno all'altro con un passaggio di pochi fotogrammi.
    Si scarta anche il ritorno di corsa alla posa iniziale che l'AI mette in fondo ai pezzi (scatti oltre 2,5 volte il
    passo normale nell'ultimo tratto). Torna l'elenco dei fotogrammi da scrivere: ('f', k) o ('m', a, b, t)."""
    F = firma.astype(np.float32)
    D = lambda a, b: float(np.abs(F[a] - F[b]).mean())
    passi = np.array([D(k, k + 1) for k in range(n - 1)]); tip = float(np.median(passi)) or 1.
    def migliore(A, B):
        best = (1e18, None, None)
        for a in A:
            for b in B:
                d = D(a, b)
                if d < best[0]: best = (d, a, b)
        return best
    tagli = []; da = 0
    for g0, g1 in giunte_dei_pezzi(n, fps):
        d, a, b = migliore(range(max(da + int(2 * fps), g0 - int(2 * fps)), g0), range(g1, min(n - int(3 * fps), g1 + int(2 * fps))))
        if a is None: continue
        tagli.append((a, b, d)); da = b
    # il giro: l'ultimo istante buono prima dello scatto finale dell'AI, verso un istante dei primi due secondi
    coda0 = max(da + int(3 * fps), n - int(3.5 * fps))
    scatti = [k for k in range(coda0, n - 1) if passi[k] > 2.5 * tip]
    fine_max = (scatti[0] - 1) if scatti else n - 1
    if fine_max - coda0 < int(fps * .5): fine_max = n - 1
    d, e, s0 = migliore(range(coda0, fine_max + 1), range(0, int(2 * fps)))
    seq = []; inizio = s0
    morf = lambda d: int(np.clip(round(d / tip * 1.5), 2, 6))
    for a, b, d in tagli:
        seq += [('f', k) for k in range(inizio, a + 1)]
        m = morf(d); seq += [('m', a, b, (q + 1) / (m + 1)) for q in range(m)]
        inizio = b
    seq += [('f', k) for k in range(inizio, e + 1)]
    m = morf(d); seq += [('m', e, s0, (q + 1) / (m + 1)) for q in range(m)]
    # ⚠ 15/11 (Maurizio, sul TV: «si vede il loop in due frame»): misurato sul video del TV, i due scatti più grandi
    # (3,5 e 5,3 s) non erano le giunte ma il video dell'AI: in un fotogramma la cuoca intera si sposta di colpo. Ogni
    # salto oltre il doppio del passo normale si spalma su sei fotogrammi seguendo il movimento
    lisci = []
    for q in range(2, len(seq) - 3):
        if not all(seq[q + r][0] == 'f' and seq[q + r][1] == seq[q][1] + r for r in range(-2, 4)): continue
        k = seq[q][1]
        if passi[k] > 2 * tip and not any(abs(k - l) < 6 for l in lisci): lisci.append(k)
    for k in lisci:
        q = next(i for i, it in enumerate(seq) if it[0] == 'f' and it[1] == k)
        seq[q - 1:q + 3] = [('m', k - 2, k + 3, (r + 1) / 5) for r in range(4)]
    info0 = {'salti_lisciati': [round(k / fps, 2) for k in lisci]}
    info = {'tagli': [{'da': round(a / fps, 2), 'a': round(b / fps, 2), 'passi': round(d2 / tip, 1)} for a, b, d2 in tagli],
            'giro': {'fine': round(e / fps, 2), 'inizio': round(s0 / fps, 2), 'passi': round(d / tip, 1)}, **info0}
    return seq, info


def cuci(entrata, uscita, profondita=None, immagine=None, fuoco_x=0.5, larghezza=None, veloce=False, fermo=None, maschera=None, alta=None, sfuma=None, fx_video=None):
    n, fps, w, h = leggi_info(entrata)
    primo = next(fotogrammi(entrata))
    cielo = maschera_cielo(w, h, profondita, immagine, fuoco_x, primo)
    sp, rif, zone, guad, sost, info, forte = analizza(entrata, n, fps, w, h, cielo)
    foto, lut = fermo_dalla_foto(rif, alta, zone, cielo, fuoco_x if fx_video is None else fx_video) if alta else (None, None)
    c = int(round(fps * (sfuma or SECONDI_GIRO)))            # 14/11: coi pezzi (tutti da e verso la stessa immagine) basta 1,5 s
    lung = n - c                                               # il giro: n - c fotogrammi
    percorso = None
    if forte is not None and info.get('_firma') is not None and info['_firma'].shape[1]:
        percorso, it = _percorso_dentro(info['_firma'], n, fps); info.update(it); lung = len(percorso)
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
    # su Windows, lanciato da pythonw, ffmpeg aprirebbe una finestra nera sopra il TV per tutta la cucitura (11/11)
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    inizio = iter(Cucitore(entrata, 0, sp, rif, cielo, zone, guad, sost, forte))
    fine = iter(Cucitore(entrata, lung, sp, rif, cielo, zone, guad, sost, forte)) if percorso is None else None
    # ⚠ 14/11 notte · LE PERSONE AL GIRO DEL LOOP: sfumate per un secondo e mezzo come la nebbia, la cuoca (che a fine
    # video non è esattamente nella posa dell'inizio) appariva doppia, due pose sovrapposte: proprio il momento da cui si
    # capisce il loop. Dove c'è video pieno si passa invece in un quinto di secondo, nell'istante del tratto in cui la
    # fine somiglia di più all'inizio; il resto sfuma come prima
    # ⚠ 15/11 (Maurizio, finestrelle: «si vede il loop benissimo sull'uomo in due frammenti»): il passaggio in un quinto
    # di secondo era uno scatto, e a metà video ce n'era un altro, la sfumata fra i due pezzi dell'AI (l'uomo per mezzo
    # secondo doppio). Ora, dove c'è video pieno, in tutti e due i punti la posa di prima va verso quella di dopo seguendo
    # il movimento (_tramezzo): al giro in un terzo di secondo, fra fine e inizio che scorrono tutti e due; a metà, dalla
    # posa dell'ultimo fotogramma intero del primo pezzo a quella del primo intero del secondo
    MEZZO = 8
    firma = info.pop('_firma', None); j0 = None; giunte = []
    if firma is not None and firma.shape[1] and c >= 2 * MEZZO + 2 and percorso is None:
        dif = np.array([float(np.abs(firma[j].astype(np.float32) - firma[lung + j].astype(np.float32)).mean()) for j in range(c)])
        dif = np.convolve(np.pad(dif, 2, mode='edge'), np.ones(5) / 5, 'valid')
        j0 = MEZZO // 2 + 1 + int(np.argmin(dif[MEZZO // 2 + 1:c - MEZZO // 2 - 1]))
        info['giro_persone'] = {'secondo': round(j0 / fps, 2), 'scarto': round(float(dif[j0]), 1), 'scarto_medio': round(float(dif.mean()), 1)}
        Wf = forte[..., None].astype(np.float32)
        giunte = [(g0 - 2, g1 + 1) for g0, g1 in giunte_dei_pezzi(n, fps) if g0 - 2 > c and g1 + 1 < lung]
        if giunte: info['giunte_persone'] = [round(g0 / fps, 2) for g0, _ in giunte]
    scritti = 0; testa = []; tenuti = []

    def scrivi(x):
        nonlocal scritti
        if lut is not None: x = cv2.LUT(x, lut)                   # i colori del video come la foto (fermo dalla foto)
        if len(testa) < 4: testa.append(x)
        ff.stdin.write(x.tobytes()); scritti += 1

    if percorso is not None:
        # interni: i fotogrammi nell'ordine scelto da _percorso_dentro (letti una volta sola, in avanti)
        servono = {k for it in percorso if it[0] == 'm' for k in it[1:3]}; tenuti = {}; letto = -1; a = None
        def prendi(k):
            nonlocal letto, a
            while letto < k:
                a = next(inizio); letto += 1
                if letto in servono: tenuti[letto] = a
            return tenuti.get(k, a)
        primo_s = percorso[0][1] if percorso[0][0] == 'f' else None
        if primo_s is not None: servono.add(primo_s)
        for it in percorso:
            if it[0] == 'f': scrivi(prendi(it[1])); continue
            _, ka, kb, t = it
            if kb < ka: A, B = prendi(ka), tenuti[kb]                # il giro: verso un fotogramma già passato
            else: A = tenuti[ka] if ka in tenuti else prendi(ka); B = prendi(kb)
            t = t * t * (3 - 2 * t)
            scrivi(np.clip(_tramezzo(A, B, t) + .5, 0, 255).astype(np.uint8))
    for j in range(lung if percorso is None else 0):
        a = next(inizio)
        if j < c:
            b = next(fine); t = (j + .5) / c; t = t * t * (3 - 2 * t)
            if j0 is not None:
                tf = 1. if j >= j0 + MEZZO // 2 else 0.
                t = t * (1 - Wf) + tf * Wf
            # ⚠ 14/11: arrotondato, non troncato. Troncando, il tratto sfumato (il primo secondo e mezzo del giro) veniva
            # quasi un livello più scuro del resto: al giro del loop la nebbia e il fuoco facevano un piccolo scatto
            x = b.astype(np.float32) * (1 - t) + a.astype(np.float32) * t
            if j0 is not None and j0 - MEZZO // 2 <= j < j0 + MEZZO // 2:
                tm = (j - (j0 - MEZZO // 2) + .5) / MEZZO; tm = tm * tm * (3 - 2 * tm)
                x = x * (1 - Wf) + _tramezzo(b, a, tm) * Wf
            a = np.clip(x + .5, 0, 255).astype(np.uint8)
        g = next((gg for gg in giunte if gg[0] <= j <= gg[1]), None)
        if g is None: scrivi(a); continue
        tenuti.append(a)                                          # la giunta fra due pezzi: si tiene finché arriva la posa d'arrivo
        if j < g[1]: continue
        A, B = tenuti[0], tenuti[-1]; m = len(tenuti) - 1
        scrivi(A)
        for k in range(1, m):
            tm = k / m; tm = tm * tm * (3 - 2 * tm)
            scrivi(np.clip(tenuti[k].astype(np.float32) * (1 - Wf) + _tramezzo(A, B, tm) * Wf + .5, 0, 255).astype(np.uint8))
        scrivi(B); tenuti = []
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
    if fermo: cv2.imwrite(fermo, foto if foto is not None else rif, [cv2.IMWRITE_JPEG_QUALITY, 93])
    if maschera:
        m = np.clip(zone - cielo, 0, 1)
        # dentro la maschera ha due piani (li legge js/vista.js, paesaggio()): fino a metà, le zone «a nebbia» (dal video
        # passa solo il chiaro e poco colorato); da metà in su, persone e fiamme: video intero
        if forte is not None: m = .5 * np.maximum(m, np.clip(forte * 3, 0, 1)) + .5 * forte
        cv2.imwrite(maschera, (cv2.resize(m, (270, int(round(270 * h / w))), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8))
    info.update({'fermo': 'foto %dx%d' % (foto.shape[1], foto.shape[0]) if foto is not None else 'video', 'video': f'{W}x{H}', 'fotogrammi_in': n, 'fps_in': round(fps, 2), 'secondi_giro': round(lung / fps, 2),
                 'tremolio_max_px': round(float(np.abs(sp).max()), 2), 'cielo_pct': round(float(cielo.mean()) * 100, 1)})
    return info


# ── ingrandimento AI ─────────────────────────────────────────────────────────────────────────────────────
LATO_FINESTRELLA = 2560     # altezza delle immagini verticali: foro 1640 × 1,2 di bordo × 1,08 quando ci si avvicina, con margine
LATO_TV = 4608              # larghezza delle immagini orizzontali: 3840 (4K) × 1,2 di bordo
CIELO_MAX = (4096, 2048)    # il cielo che scorre: oltre 4096 il Raspberry non lo carica
_esr = None


def ingranditore():
    """Real-ESRGAN sulla scheda video (Vulkan: la Radeon del G10, la Intel del laptop). None se non c'è."""
    global _esr
    if _esr is None:
        try:
            from realesrgan_ncnn_py import Realesrgan
            _esr = Realesrgan(gpuid=0, model=4)            # realesrgan-x4plus: paesaggi e dipinti, ×4
        except Exception as e:
            print('ingrandimento AI non disponibile:', e, file=sys.stderr, flush=True); _esr = False
    return _esr or None


def misura_giusta(w, h, parte):
    """Quanto deve essere grande l'immagine per lo schermo che la mostra; None se lo è già."""
    if parte.startswith('cielo-'): k = min(CIELO_MAX[0] / w, CIELO_MAX[1] / h)
    elif h >= w: k = LATO_FINESTRELLA / h                  # verticale: le finestrelle
    else: k = LATO_TV / w                                  # orizzontale: il TV (o una foto orizzontale, di cui il foro mostra una striscia)
    return (int(round(w * k / 2)) * 2, int(round(h * k / 2)) * 2) if k > 1.12 else None


def ingrandisci(img, W, H, giro=False):
    """L'immagine a W×H: Real-ESRGAN ×4 e poi ridotta (così i suoi difetti spariscono), con un quarto di
    ingrandimento classico che tiene la grana naturale (da solo Real-ESRGAN fa i cipressi lontani «di plastica»).
    giro=True per il cielo che scorre: i due lati si devono continuare, si ingrandisce con un pezzo dell'altro lato."""
    if not giro and max(img.shape[:2]) >= 3200:                      # 13/11: già 4K dall'AI, basta il bordo della prospettiva
        return cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
    e = ingranditore()
    if not e: return None
    b = 32 if giro else 0
    src = np.concatenate([img[:, -b:], img, img[:, :b]], 1) if b else img
    x4 = e.process_cv2(np.ascontiguousarray(src))
    if b: x4 = x4[:, 4 * b:-4 * b]
    a = cv2.resize(x4, (W, H), interpolation=cv2.INTER_AREA)
    c = cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
    return cv2.addWeighted(a, .75, c, .25, 0)


def _visti_percorso():
    return os.path.join(os.path.expanduser('~'), '.cucitore-visti.json')


def _visti():
    try: return json.load(open(_visti_percorso()))
    except Exception: return {}


def ingrandisci_foto(cart, file, nomi, piu_forte, forza, chi, io):
    """Le foto, i cieli e i fermi più piccoli di quanto serve allo schermo: ingranditi e rimessi al loro posto.
    Lo fa solo chi ha una scheda video (forza 2 o più), uno alla volta, come le animazioni."""
    if forza < 2: return 0
    visti = _visti(); fatti = 0
    for nome in nomi:
        base, _, coda = nome.rpartition('_')
        m = re.fullmatch(r'((?:est-)?(?:giorno|alba|tramonto|notte|cielo-(?:giorno|alba|tramonto|notte)|fermo-(giorno|alba|tramonto|notte)))\.jpg', coda)
        if not m: continue
        parte = m.group(1); pre = 'est-' if parte.startswith('est-') else ''
        originale = f'{base}_{parte}-originale.jpg'
        if originale in nomi: continue                                         # già ingrandita
        if m.group(2) and f'{base}_{pre}anim-{m.group(2)}-originale.mp4' not in nomi: continue   # fermo del telefono: arriva quello cucito
        quando = file[nome].get('updated_at') or ''
        if visti.get(nome) == quando: continue                                 # già guardata: è grande abbastanza
        if piu_forte and _eta_agg(file[nome]) < 2: _SOSPESI[0] += 1; continue  # la lascia al più forte: si riguarda al prossimo giro
        if not ingranditore(): return fatti
        segno = f'{base}_{parte}-incorso.png'
        if segno in file:
            if _eta_agg(file[segno]) < 3: _SOSPESI[0] += 1; continue
            _libera(cart, segno)
        if not _prenota(cart, segno, chi): _SOSPESI[0] += 1; continue
        try:
            with tempfile.TemporaryDirectory() as d:
                e = os.path.join(d, 'e.jpg'); _scarica(cart, nome, e)
                img = cv2.imread(e); h, w = img.shape[:2]
                misura = misura_giusta(w, h, parte[len(pre):])
                if not misura:
                    visti[nome] = quando
                    json.dump(visti, open(_visti_percorso(), 'w')); continue
                print(chi, 'ingrandisce', nome, f'{w}x{h} → {misura[0]}x{misura[1]}', flush=True)
                t = time.time()
                u = ingrandisci(img, *misura, giro=parte[len(pre):].startswith('cielo-'))
                if u is None: return fatti
                ok, jpg = cv2.imencode('.jpg', u, [cv2.IMWRITE_JPEG_QUALITY, 92])
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(originale), open(e, 'rb').read(), 'image/jpeg', {'x-upsert': 'true'})
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), jpg.tobytes(), 'image/jpeg',
                        {'x-upsert': 'true', 'cache-control': 'max-age=60'})
                print(f'  fatto in {time.time() - t:.0f} s', flush=True); fatti += 1
                _rinfresca(cart, io)
        finally:
            _libera(cart, segno)
    return fatti


# ── sul Raspberry: cuce da solo le animazioni nuove della casa ───────────────────────────────────────────
URL = 'https://olcfvghjfzyazogfsjbk.supabase.co'
DEPOSITO = 'dmaster-media'
CHIAVE_PUBBLICA = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJp'
                   'YXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc')


# ── casa privata (30/10): questo computer è un membro «lavoratore» della casa, abbinato col codice ──────
# Entra con un accesso anonimo (ricordato in ~/.cucitore-accesso.json) e lavora nel deposito privato
# «atmosfera/<casa>/»; senza abbinamento resta il vecchio modo (--casa <chiave>, deposito pubblico).
ACCESSO = None
FILE_ACCESSO = os.path.join(os.path.expanduser('~'), '.cucitore-accesso.json')


def _salva_accesso():
    with open(FILE_ACCESSO, 'w') as f: json.dump(ACCESSO, f)
    try: os.chmod(FILE_ACCESSO, 0o600)
    except Exception: pass


def _sessione(d):
    return {'access_token': d['access_token'], 'refresh_token': d['refresh_token'], 'scade': time.time() + int(d.get('expires_in', 3600)),
            'utente': (d.get('user') or {}).get('id') or (ACCESSO or {}).get('utente'), 'casa': (ACCESSO or {}).get('casa')}


def _gettone():
    global ACCESSO
    if not ACCESSO: return CHIAVE_PUBBLICA
    if time.time() > ACCESSO['scade'] - 120:
        r = urllib.request.Request(URL + '/auth/v1/token?grant_type=refresh_token', data=json.dumps({'refresh_token': ACCESSO['refresh_token']}).encode(),
                                   method='POST', headers={'apikey': CHIAVE_PUBBLICA, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(r, timeout=60) as x: ACCESSO = _sessione(json.loads(x.read()))
        _salva_accesso()
    return ACCESSO['access_token']


def abbina(chi):
    """Accesso anonimo, codice di 6 cifre da scrivere sul telefono (Impostazioni → Account e casa → Abbina), attesa."""
    global ACCESSO
    if not ACCESSO:
        r = urllib.request.Request(URL + '/auth/v1/signup', data=json.dumps({'data': {}}).encode(), method='POST',
                                   headers={'apikey': CHIAVE_PUBBLICA, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(r, timeout=60) as x: ACCESSO = _sessione(json.loads(x.read()))
        _salva_accesso()
    codice = json.loads(_chiedi('POST', '/rest/v1/rpc/atm_chiedi_codice', json.dumps({'ruolo': 'lavoratore', 'nome': 'Rifinitura · ' + chi}).encode()))
    print('\n   Codice per aggiungere questo computer alla stanza:   ' + codice[:3] + ' ' + codice[3:] +
          "\n   Nell'app delle finestre sul telefono: «Aggiungi schermo» → scrivi le 6 cifre (o in DMaster: Impostazioni → Account). Vale 10 minuti.\n", flush=True)
    for _ in range(200):
        time.sleep(3)
        righe = json.loads(_chiedi('GET', f"/rest/v1/atm_membri?select=casa&utente=eq.{ACCESSO['utente']}"))
        if righe:
            ACCESSO['casa'] = righe[0]['casa']; _salva_accesso()
            print('   Aggiunto alla stanza ✓', flush=True); return True
    print('   Codice scaduto: rilancia con --abbina', flush=True); return False


def _scarica(cart, nome, dest):
    via = 'authenticated' if ACCESSO else 'public'
    with open(dest, 'wb') as f: f.write(_chiedi('GET', f'/storage/v1/object/{via}/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome)))


def _chiedi(metodo, percorso, corpo=None, tipo='application/json', extra=None):
    h = {'apikey': CHIAVE_PUBBLICA, 'Authorization': 'Bearer ' + _gettone()}
    if corpo is not None: h['Content-Type'] = tipo
    # 14/11 sera · gli elenchi viaggiano compressi (113 KB → 19 KB): il traffico in uscita da Supabase è contato
    if '/object/list/' in percorso or percorso.startswith('/rest/'): h['Accept-Encoding'] = 'gzip'
    h.update(extra or {})
    r = urllib.request.Request(URL + percorso, data=corpo, method=metodo, headers=h)
    with urllib.request.urlopen(r, timeout=300) as x:
        d = x.read()
        return gzip.decompress(d) if (x.headers.get('Content-Encoding') or '').lower() == 'gzip' else d


def _elenco(cart):
    return json.loads(_chiedi('POST', f'/storage/v1/object/list/{DEPOSITO}', json.dumps({'prefix': cart, 'limit': 1000}).encode()))


def _recenti(cart, quanti=8):
    """I file toccati per ultimi (nome e ora), senza i segni di presenza dei cucitori, che si rinfrescano a ogni giro:
    se questa lista è uguale a quella di prima, nella cartella non è cambiato niente. Pesa meno di 1 KB."""
    r = json.loads(_chiedi('POST', f'/storage/v1/object/list/{DEPOSITO}',
                           json.dumps({'prefix': cart, 'limit': quanti, 'sortBy': {'column': 'updated_at', 'order': 'desc'}}).encode()))
    return [(f['name'], f.get('updated_at')) for f in r if not f['name'].startswith('zz-cucitore-')]


# ⚠ 14/11 sera · IL GIRO LEGGERO. Il giro chiedeva a Supabase l'elenco intero della cartella due volte ogni 20 secondi,
# da ogni computer acceso: 113 KB a risposta, con Ally e G10 accesi 1,7 GB al giorno di traffico, quando il piano
# gratuito ne dà 5 al mese (è arrivata a Maurizio la mail di Supabase). Ora, se all'ultimo giro non c'era niente da fare
# né niente in sospeso, si chiedono solo i file toccati per ultimi (_recenti): se sono gli stessi di prima non è cambiato
# niente e il giro finisce lì. L'elenco intero si rifà quando qualcosa cambia, quando c'è lavoro in sospeso (un video
# lasciato al più forte, uno che un altro sta cucendo) e comunque una volta all'ora (a riposo i giri sono uno ogni
# 10 minuti, vedi «LA SPINTA»: con l'elenco intero a ogni giro di sicurezza erano ancora 5 MB al giorno).
_RIPOSO = {}        # per cartella: {'firma': i file recenti all'ultimo giro intero senza niente da fare, 'quando': quando}
_SOSPESI = [0]      # quante cose l'ultimo giro intero ha lasciato in sospeso (ad altri, o a dopo)


_LIBRERIA = None
def _libreria():
    """La cartella dei paesaggi: quella comune a tutte le stanze del proprietario (31/10, «paesaggi comuni»)."""
    global _LIBRERIA
    if _LIBRERIA: return _LIBRERIA
    try:
        righe = json.loads(_chiedi('GET', '/rest/v1/atm_case?select=libreria&id=eq.' + ACCESSO['casa']))
        _LIBRERIA = (righe[0].get('libreria') if righe else None) or ACCESSO['casa']
    except Exception as e:
        print('libreria non letta, uso la stanza:', e, file=sys.stderr, flush=True)
        return ACCESSO['casa']
    return _LIBRERIA


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


try: VERSIONE_CUCITORE = hashlib.sha1(open(os.path.abspath(__file__), 'rb').read()).hexdigest()[:8]
except Exception: VERSIONE_CUCITORE = '?'


def _rinfresca(cart, nome):
    # 14/11 · nel segno di presenza anche la versione del cucitore (in coda al PNG): si vede da lontano chi è aggiornato
    corpo = PUNTO_PNG + (b'#v=' + VERSIONE_CUCITORE.encode() if nome.startswith('zz-cucitore-') else b'')
    _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), corpo, 'image/png', {'x-upsert': 'true'})


def _cart_e_io(casa, forza, chi):
    """La cartella dei paesaggi e il nome del segno di presenza di questo apparecchio."""
    cart = _libreria() if ACCESSO and ACCESSO.get('casa') else 'finestre/' + cartella_di(casa)
    return cart, f'zz-cucitore-{forza}-' + (re.sub(r'[^a-z0-9-]+', '-', chi.lower()).strip('-') or 'pc') + '.png'


def _priorita_bassa():
    """15/11 · per il cucitore che aiuta mentre disegna le finestre: dopo di loro (Windows: «inferiore al normale»)."""
    try: os.nice(10)
    except Exception:
        try:
            import ctypes; ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)
        except Exception: pass


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
    cart, io = _cart_e_io(casa, forza, chi)
    try: _rinfresca(cart, io)
    except Exception as e: print('presenza non segnata:', e, file=sys.stderr, flush=True)
    riposo = _RIPOSO.setdefault(cart, {'firma': None, 'quando': 0.0})
    try: firma = _recenti(cart)
    except Exception: firma = None
    if firma is not None and firma == riposo['firma'] and time.time() - riposo['quando'] < 3600: return 0   # niente di nuovo (vedi «IL GIRO LEGGERO»)
    _SOSPESI[0] = 0
    quando_elenco = time.time()
    elenco = _elenco(cart)
    file = {f['name']: f for f in elenco}
    nomi = list(file)
    piu_forte = any(n != io and (m := re.match(r'zz-cucitore-(\d+)-', n)) and int(m.group(1)) > forza and _eta_agg(f) < 1.5
                    for n, f in file.items())
    fatti = 0
    for nome in nomi:
        base, _, parte = nome.rpartition('_')                  # parte = anim-giorno.mp4
        if not re.fullmatch(r'(est-)?anim-(giorno|alba|tramonto|notte)\.mp4', parte): continue   # est-: la vista del TV
        originale = f'{base}_{parte[:-4]}-originale.mp4'      # il file dell'AI resta qui, intatto (la libreria lo ignora)
        if originale in nomi: continue                         # già cucita
        _SOSPESI[0] += 1                                       # c'è un video da cucire: finché c'è, i giri restano interi
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
    if not fatti and forza >= 2:                               # 14/11: le animazioni già cucite col cucitore di prima, una per giro
        for nome in nomi:
            base, _, parte = nome.rpartition('_')
            if not re.fullmatch(r'(est-)?anim-(giorno|alba|tramonto|notte)\.mp4', parte): continue
            originale = f'{base}_{parte[:-4]}-originale.mp4'
            # 14/11 notte: gli interni cuciti prima di «DENTRO: LE PERSONE E LE FIAMME» si rifanno una volta (segno v3);
            # 15/11: e di nuovo con il boccale dentro la zona piena e i passaggi che seguono il movimento (segno v4), poi
            # senza il tremolio della cucina e con le persone intere fino a terra (segno v5), poi con i punti fermi seguiti uno
            # per uno e il passaggio del giro solo dove le pose sono diverse (segno v6), poi coi salti fra le pose più simili
            # alla giunta e al giro (segno v7)
            dentro = 'interno' in (base.split('@', 1)[1].split('.') if '@' in base else [])
            if originale not in nomi or f'{base}_{parte[:-4]}-' + ('v7' if dentro else 'v2') + '.png' in nomi: continue
            _SOSPESI[0] += 1                                   # c'è un video da ricucire
            # 15/11 (Maurizio aspettava la taverna: mezz'ora a video sull'Ally, uno dopo l'altro): se il più forte è già
            # occupato con una ricucitura, il meno forte prende la successiva invece di aspettare; a priorità bassa, perché
            # intanto disegna le sue finestre
            occupato = any(n.endswith('-incorso.png') and _eta_agg(f) < 3 for n, f in file.items())
            if piu_forte and not occupato: break
            if piu_forte: _priorita_bassa()
            segno = f'{base}_{parte[:-4]}-incorso.png'
            if segno in file:
                if _eta_agg(file[segno]) < 3: continue
                _libera(cart, segno)
            if not _prenota(cart, segno, chi): continue
            print(chi, 'ricuce', nome, flush=True)
            vivo = threading.Event()
            def battito():
                while not vivo.wait(30):
                    try: _rinfresca(cart, segno); _rinfresca(cart, io)
                    except Exception: pass
            threading.Thread(target=battito, daemon=True).start()
            try:
                fatti += _cuci_uno(cart, nomi, nome, base, parte, originale, larghezza, veloce, ricuci=True)
            except Exception as ex:
                print('  ricucitura non riuscita:', ex, file=sys.stderr, flush=True)
                try:                                                                                                  # non riprovarla all'infinito
                    for v in ('v2', 'v3', 'v4', 'v5', 'v6', 'v7'): _rinfresca(cart, f'{base}_{parte[:-4]}-{v}.png')
                except Exception: pass
            finally:
                vivo.set(); _libera(cart, segno)
            break
    if not fatti:                                              # le animazioni prima di tutto; poi, se c'è tempo, le foto
        try:
            if time.time() - quando_elenco > 30:               # una cucitura provata e non riuscita ha preso tempo: l'elenco si rifà
                elenco = _elenco(cart)
                file = {f['name']: f for f in elenco}
            fatti += ingrandisci_foto(cart, file, list(file), piu_forte, forza, chi, io)
        except Exception as e:
            _SOSPESI[0] += 1
            print('ingrandimento non riuscito:', e, file=sys.stderr, flush=True)
    # a riposo solo se questo giro intero non ha fatto niente e non ha lasciato niente in sospeso
    riposo['firma'] = firma if not fatti and not _SOSPESI[0] else None
    riposo['quando'] = time.time()
    return fatti


# ── LA SPINTA (14/11 sera) ───────────────────────────────────────────────────────────────────────────────
# Maurizio: «Il cucitore non serve così frequentemente. Facciamolo push». Il cucitore non chiede più di continuo se c'è
# lavoro: glielo dice chi lo porta. Il telefono, pochi secondi dopo aver caricato un video o un'immagine, manda l'evento
# «cuci» su un canale tutto del cucitore (cucitore-<casa>: il traffico della stanza qui non arriva); un filo resta in
# ascolto su quel canale e sveglia il giro. Poi:
#   · finché c'è lavoro in corso o in sospeso, i giri restano ogni 20 secondi, come prima;
#   · a riposo, col canale su, si dorme: un giro leggero ogni 10 minuti, per sicurezza (una spinta persa, un file
#     arrivato da un'altra strada) e per l'aggiornamento da GitHub;
#   · se il canale non c'è (rete, stanza privata), un giro leggero al minuto.
# Chiamati tutti insieme, ognuno si fa vedere subito e i meno forti aspettano qualche secondo: così il più forte
# acceso prende il lavoro per primo, come prima.
# Il websocket è fatto con la sola libreria di Python: sui computer di Maurizio non serve installare niente.
SVEGLIA = threading.Event()
_SPINTA = {'viva': 0.0, 'ultima': 0.0}        # quando il canale ha risposto l'ultima volta, quando è arrivata l'ultima spinta


def _ws_apri(url, timeout=20):
    """Apre il websocket (wss). Torna (socket, quello che è già arrivato dopo la stretta di mano)."""
    u = urllib.parse.urlsplit(url); host = u.hostname; porta = u.port or 443
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    if proxy:
        pu = urllib.parse.urlsplit(proxy)
        s = socket.create_connection((pu.hostname, pu.port or 8080), timeout=timeout)
        auth = ''
        if pu.username:
            auth = 'Proxy-Authorization: Basic ' + base64.b64encode((urllib.parse.unquote(pu.username) + ':' + urllib.parse.unquote(pu.password or '')).encode()).decode() + '\r\n'
        s.sendall(f'CONNECT {host}:{porta} HTTP/1.1\r\nHost: {host}:{porta}\r\n{auth}\r\n'.encode())
        r = b''
        while b'\r\n\r\n' not in r:
            c = s.recv(4096)
            if not c: raise OSError('proxy chiuso')
            r += c
        if b' 200' not in r.split(b'\r\n', 1)[0]: raise OSError('proxy: ' + r[:80].decode('latin1'))
    else:
        s = socket.create_connection((host, porta), timeout=timeout)
    s = ssl.create_default_context().wrap_socket(s, server_hostname=host)
    chiave = base64.b64encode(os.urandom(16)).decode()
    percorso = (u.path or '/') + ('?' + u.query if u.query else '')
    s.sendall((f'GET {percorso} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
               f'Sec-WebSocket-Key: {chiave}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
    r = b''
    while b'\r\n\r\n' not in r:
        c = s.recv(4096)
        if not c: raise OSError('chiuso durante la stretta di mano')
        r += c
    testa, _, resto = r.partition(b'\r\n\r\n')
    if b' 101' not in testa.split(b'\r\n', 1)[0]: raise OSError('niente websocket: ' + testa[:120].decode('latin1'))
    return s, bytearray(resto)


def _ws_manda(s, dati, op=1):
    d = dati if isinstance(dati, (bytes, bytearray)) else dati.encode(); n = len(d); m = os.urandom(4)
    lung = bytes([0x80 | n]) if n < 126 else (bytes([0x80 | 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x80 | 127]) + struct.pack('>Q', n))
    s.sendall(bytes([0x80 | op]) + lung + m + bytes(b ^ m[i % 4] for i, b in enumerate(d)))


def _ws_messaggi(buf, parz):
    """Toglie da buf i messaggi interi già arrivati e li dà come (tipo, dati): 1 testo, 8 chiusura, 9 ping, 10 pong.
    I messaggi spezzati in più pezzi si ricompongono (parz tiene i pezzi fra una chiamata e l'altra)."""
    fuori = []
    while True:
        if len(buf) < 2: break
        b0, b1 = buf[0], buf[1]; n = b1 & 0x7f; i = 2
        if n == 126:
            if len(buf) < 4: break
            n = struct.unpack('>H', bytes(buf[2:4]))[0]; i = 4
        elif n == 127:
            if len(buf) < 10: break
            n = struct.unpack('>Q', bytes(buf[2:10]))[0]; i = 10
        masc = None
        if b1 & 0x80:
            if len(buf) < i + 4: break
            masc = bytes(buf[i:i + 4]); i += 4
        if len(buf) < i + n: break
        d = bytes(buf[i:i + n]); del buf[:i + n]
        if masc: d = bytes(b ^ masc[k % 4] for k, b in enumerate(d))
        op, fine = b0 & 0x0f, b0 & 0x80
        if op >= 8: fuori.append((op, d)); continue          # messaggi di servizio: mai spezzati
        if op != 0: parz[:] = [op, bytearray()]
        if not parz: continue                                 # un seguito senza inizio: si butta
        parz[1] += d
        if fine: fuori.append((parz[0], bytes(parz[1]))); parz[:] = []
    return fuori


def ascolta_spinte(casa):
    """Il filo che resta in ascolto sul canale del cucitore: all'evento «cuci» sveglia il giro. Se il canale cade si
    riapre da solo (dopo 5 secondi, poi sempre più di rado, al massimo ogni 2 minuti)."""
    tema = 'realtime:cucitore-' + casa
    url = 'wss://' + URL.split('//', 1)[1] + '/realtime/v1/websocket?apikey=' + CHIAVE_PUBBLICA + '&vsn=1.0.0'
    pausa = 5
    while True:
        s = None
        try:
            s, buf = _ws_apri(url); s.settimeout(2)
            _ws_manda(s, json.dumps({'topic': tema, 'event': 'phx_join', 'ref': '1', 'join_ref': '1', 'payload': {'config': {
                'broadcast': {'ack': False, 'self': False}, 'presence': {'key': ''}, 'postgres_changes': [], 'private': False}}}))
            n = 1; battito = sentito = time.time(); parz = []
            while True:
                if time.time() - battito > 25:
                    n += 1; battito = time.time()
                    _ws_manda(s, json.dumps({'topic': 'phoenix', 'event': 'heartbeat', 'payload': {}, 'ref': str(n)}))
                if time.time() - sentito > 70: raise OSError('il canale tace')
                try: c = s.recv(65536)
                except (socket.timeout, TimeoutError): c = None
                if c == b'': raise OSError('canale chiuso')
                if c: buf += c
                for op, d in _ws_messaggi(buf, parz):
                    if op == 9: _ws_manda(s, d, 10)
                    elif op == 8: raise OSError('canale chiuso dal servizio')
                    elif op == 1:
                        m = json.loads(d); ev = m.get('event'); corpo = m.get('payload') or {}
                        sentito = time.time()
                        if ev == 'phx_reply':
                            if corpo.get('status') != 'ok': raise OSError('canale: ' + json.dumps(corpo)[:120])
                            if not _SPINTA['viva']: print('spinta: in ascolto sul canale del cucitore', flush=True)
                            _SPINTA['viva'] = time.time(); pausa = 5
                        elif ev in ('phx_error', 'phx_close'): raise OSError('canale: ' + ev)
                        elif ev == 'broadcast' and corpo.get('event') == 'cuci':
                            # 14/11 notte (Maurizio: «non puoi fare tu push? Così iniziano subito»): con {aggiorna: true}
                            # al risveglio si guarda subito se su GitHub c'è un cucitore nuovo, senza aspettare i 10 minuti
                            if (corpo.get('payload') or {}).get('aggiorna'): _controllato[0] = 0.0
                            _SPINTA['ultima'] = time.time(); SVEGLIA.set()
        except Exception as e:
            print('spinta: canale giù (' + str(e)[:100] + '), riprovo fra', pausa, 's', file=sys.stderr, flush=True)
        finally:
            try:
                if s: s.close()
            except Exception: pass
        _SPINTA['viva'] = 0.0
        time.sleep(pausa); pausa = min(120, pausa * 2)


def _aspetta(fatti, casa, forza, chi):
    """Fra un giro e l'altro (vedi «LA SPINTA»): 20 secondi se c'è lavoro in corso o in sospeso; altrimenti si dorme
    finché qualcuno chiama (col canale su: al massimo 10 minuti; senza: un minuto)."""
    if fatti or _SOSPESI[0]: attesa = 20
    elif time.time() - _SPINTA['viva'] < 60: attesa = 600
    else: attesa = 60
    if not SVEGLIA.wait(attesa): return
    SVEGLIA.clear()
    # chiamati tutti insieme: ci si fa vedere subito, poi i meno forti aspettano, così il più forte prende il lavoro per primo
    try: _rinfresca(*_cart_e_io(casa, forza, chi))
    except Exception: pass
    time.sleep(2 + 4 * max(0, 3 - forza))


URL_CUCITORE = 'https://mauriziotarsia-dev.github.io/finestre/pi/cuci-animazione.py'
_controllato = [0.0]


def aggiornati():
    """14/11 · Maurizio ha riacceso G10 e Ally dallo stop: il cucitore ripartito dallo stop era quello vecchio (lo si
    scarica solo all'avvio di Windows) e ha cucito il giorno dell'abbazia col solo primo pezzo. Ogni 10 minuti, fra un
    giro e l'altro (mai durante una cucitura), si guarda se su GitHub c'è un cucitore diverso: se sì, si scarica al posto
    di questo e si riparte con gli stessi argomenti (il radar, già acceso, resta com'è)."""
    if time.time() - _controllato[0] < 600: return
    _controllato[0] = time.time()
    try:
        nuovo = urllib.request.urlopen(URL_CUCITORE + '?t=' + str(int(time.time())), timeout=30).read()
        qui = os.path.abspath(__file__)
        if not nuovo or b'def giro_casa' not in nuovo or nuovo == open(qui, 'rb').read(): return
        compile(nuovo, qui, 'exec')                                  # solo un file intero e valido
        open(qui + '.nuovo', 'wb').write(nuovo); os.replace(qui + '.nuovo', qui)
        print('cucitore aggiornato da GitHub: riparto', flush=True)
        if os.name == 'nt':
            subprocess.Popen([sys.executable, qui] + sys.argv[1:], cwd=os.path.dirname(qui),
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'DETACHED_PROCESS', 0))
            os._exit(0)
        os.execv(sys.executable, [sys.executable, qui] + sys.argv[1:])
    except Exception as e:
        print('aggiornamento non controllato:', e, file=sys.stderr, flush=True)


SFUMA_PEZZI = 0.6


def metti_in_fila(pezzi, uscita):
    """13/11 notte · il giro lungo: più video da 10 s, ognuno con un movimento diverso, che partono e finiscono tutti
    sulla stessa immagine, messi uno dopo l'altro (ricodificati insieme: stessi fotogrammi al secondo e stessa misura)."""
    n, fps, w, h = leggi_info(pezzi[0])
    # 14/11 · il deposito accetta file fino a 50 MB: due pezzi da 8 s a crf 12 facevano 55 MB e il caricamento
    # dell'originale falliva dopo mezz'ora di lavoro, all'infinito. Tetto al flusso: ~40 MB qualunque sia la durata
    durata = sum(i[0] / max(1, i[1]) for i in map(leggi_info, pezzi))
    kbps = max(4000, int(40e6 * 8 / max(1, durata) / 1000))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', FF_THREADS]
    for x in pezzi: cmd += ['-i', x]
    # 14/11 · fra un pezzo e l'altro una dissolvenza di 0,6 s: l'AI non torna mai esattamente all'immagine, e col
    # semplice accodamento a metà giro il fuoco della taverna (e la nebbia dell'abbazia) facevano uno scatto
    dur = [i[0] / max(1, i[1]) for i in map(leggi_info, pezzi)]
    filtro = ''.join(f'[{i}:v]fps={fps:.3f},scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p,settb=AVTB[v{i}];' for i in range(len(pezzi)))
    prima, fino = 'v0', 0.0
    for i in range(1, len(pezzi)):
        fino += dur[i - 1] - SFUMA_PEZZI
        dopo = 'out' if i == len(pezzi) - 1 else f'x{i}'
        filtro += f'[{prima}][v{i}]xfade=transition=fade:duration={SFUMA_PEZZI}:offset={fino:.3f}[{dopo}];'
        prima = dopo
    if len(pezzi) == 1: filtro += '[v0]null[out];'
    cmd += ['-filter_complex', filtro.rstrip(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
            '-maxrate', f'{kbps}k', '-bufsize', f'{kbps}k', '-pix_fmt', 'yuv420p', uscita]
    subprocess.run(cmd, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def _cuci_uno(cart, nomi, nome, base, parte, originale, larghezza, veloce, ricuci=False):
    """ricuci: l'animazione è già cucita (con il cucitore di prima): si riparte dal video originale dell'AI, che resta
    com'è, e si rifanno video, fermo e maschera (14/11: il fermo dalla foto a piena risoluzione anche per i paesaggi vecchi)."""
    if True:
        with tempfile.TemporaryDirectory() as d:
            e, u = os.path.join(d, 'e.mp4'), os.path.join(d, 'u.mp4')
            _scarica(cart, originale if ricuci else nome, e)
            # i pezzi in più del giro lungo (…_anim-notte-pezzo2.mp4 …): in fila dopo il primo
            # 14/11 · anche quando si ricuce: se i pezzi sono ancora lì, l'ha cucita un cucitore vecchio col solo primo pezzo
            pezzi_n = [f'{base}_{parte[:-4]}-pezzo{k}.mp4' for k in range(2, 9) if f'{base}_{parte[:-4]}-pezzo{k}.mp4' in nomi]
            if pezzi_n:
                pz = [e]
                for i, pn in enumerate(pezzi_n):
                    x = os.path.join(d, f'p{i + 2}.mp4'); _scarica(cart, pn, x); pz.append(x)
                tutta = os.path.join(d, 'tutta.mp4'); metti_in_fila(pz, tutta); e = tutta
                print('  in fila', len(pz), 'pezzi', flush=True)
            prof = imm = None
            pre = 'est-' if parte.startswith('est-') else ''                 # la vista del TV ha la sua profondità
            if f'{base}_{pre}profondita.png' in nomi and f'{base}_{pre}giorno.jpg' in nomi:
                prof, imm = os.path.join(d, 'p.png'), os.path.join(d, 'g.jpg')
                _scarica(cart, f'{base}_{pre}profondita.png', prof); _scarica(cart, f'{base}_{pre}giorno.jpg', imm)
            fx = 0.5
            global SENZA_CIELO
            SENZA_CIELO = 'interno' in (base.split('@', 1)[1].split('.') if '@' in base else [])
            for kw in (base.split('@', 1)[1].split('.') if '@' in base else []):
                if kw.startswith('fx') and kw[2:].isdigit(): fx = min(100, int(kw[2:])) / 100
            fj, mp = os.path.join(d, 'f.jpg'), os.path.join(d, 'm.png')
            alta = None                                                   # la foto della stessa ora: il fermo a piena risoluzione
            ora_f = parte[len(pre) + 5:-4]
            if f'{base}_{pre}{ora_f}.jpg' in nomi:
                alta = os.path.join(d, 'a.jpg'); _scarica(cart, f'{base}_{pre}{ora_f}.jpg', alta)
            fxv = 0.5 if (pre or 'largo' in (base.split('@', 1)[1].split('.') if '@' in base else []) or 'interno' in (base.split('@', 1)[1].split('.') if '@' in base else [])) else fx
            info = cuci(e, u, prof, imm, fx, larghezza, veloce, fj, mp, alta, 1.5 if (pezzi_n or (ricuci and leggi_info(e)[0] / max(1, leggi_info(e)[1]) > 12)) else None, fxv)
            if not ricuci or pezzi_n:                                    # l'originale lungo, con tutti i pezzi in fila
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(originale), open(e, 'rb').read(), 'video/mp4', {'x-upsert': 'true'})
            _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nome), open(u, 'rb').read(), 'video/mp4',
                    {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            # fermo e maschera nuovi, al posto di quelli fatti dal telefono alla creazione (js/fermo.js).
            # Il fermo disegna tutto quello che non si muove: se qui c'è la scheda video si ingrandisce subito,
            # altrimenti lo farà il primo computer che ce l'ha (togliendo il suo vecchio originale, se c'era)
            ora = parte[len(pre) + 5:-4]
            nfo = f'{base}_{pre}fermo-{ora}-originale.jpg'
            fimg = cv2.imread(fj); misura = misura_giusta(fimg.shape[1], fimg.shape[0], 'fermo-' + ora)
            grande = ingrandisci(fimg, *misura) if misura and ingranditore() else None
            if grande is not None:
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nfo), open(fj, 'rb').read(), 'image/jpeg', {'x-upsert': 'true'})
                cv2.imwrite(fj, grande, [cv2.IMWRITE_JPEG_QUALITY, 92])
            elif nfo in nomi:
                _libera(cart, nfo)
            for nf, fl, tipo in ((f'{base}_{pre}fermo-{ora}.jpg', fj, 'image/jpeg'), (f'{base}_{pre}maschera-{ora}.png', mp, 'image/png')):
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(nf), open(fl, 'rb').read(), tipo,
                        {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            # 13/11 · la copia piccola del fermo (lato lungo 1280) per l'anteprima del telefono, come per le luci (11/11)
            try:
                k = min(1, 1280 / max(fimg.shape[:2])); mini = cv2.resize(fimg, (round(fimg.shape[1] * k), round(fimg.shape[0] * k)), interpolation=cv2.INTER_AREA)
                ok, buf = cv2.imencode('.jpg', mini, [cv2.IMWRITE_JPEG_QUALITY, 82, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
                _chiedi('POST', f'/storage/v1/object/{DEPOSITO}/{cart}/' + urllib.parse.quote(f'{base}_{pre}mini-fermo-{ora}.jpg'), buf.tobytes(), 'image/jpeg',
                        {'x-upsert': 'true', 'cache-control': 'max-age=60'})
            except Exception as ex: print('copia piccola del fermo non fatta:', ex, file=sys.stderr, flush=True)
            for pn in pezzi_n: _libera(cart, pn)                          # i pezzi sono dentro l'originale lungo
            try:
                _rinfresca(cart, f'{base}_{parte[:-4]}-v2.png')          # cucita con il fermo dalla foto (o provato): non si rifà
                if SENZA_CIELO: _rinfresca(cart, f'{base}_{parte[:-4]}-v7.png')   # un interno, con persone e fiamme vive (15/11: v5, tremolio e gonna)
            except Exception: pass
            print('  fatto:', info, flush=True)
            return 1


def avvia_radar(chi):
    """13/11 · il ricevitore del radar (pi/sensore.py) gira sul PC del TV. Dal 9/11 il TV ha la ROG Ally (prima il G10,
    che lo faceva partire col suo installatore): l'Ally scarica a ogni avvio solo questo cucitore, quindi è il cucitore
    a scaricare anche sensore.py e a farlo partire, se la porta 8788 è libera (= non gira già)."""
    if os.name != 'nt' or chi.lower() not in ('ally', 'tv'): return
    import socket
    try:
        with socket.socket() as so: so.bind(('127.0.0.1', 8788))
    except OSError: return                                     # c'è già
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sensore.py')
    try: urllib.request.urlretrieve('https://mauriziotarsia-dev.github.io/finestre/pi/sensore.py', dest)
    except Exception as e: print('sensore.py non scaricato:', e, file=sys.stderr, flush=True)
    if not os.path.exists(dest): return
    exe = sys.executable.replace('python.exe', 'pythonw.exe')
    subprocess.Popen([exe if os.path.exists(exe) else sys.executable, dest], cwd=os.path.dirname(dest),
                     creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'DETACHED_PROCESS', 0))
    print('radar: ricevitore avviato', flush=True)


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
    a.add_argument('--abbina', action='store_true', help='abbina questo computer alla casa privata (codice da scrivere sul telefono)')
    a.add_argument('--pieno', action='store_true', help='con --casa: priorità normale e tutti i processori (10/11, Maurizio: «diamo la priorità alla cucitura ed alla qualità», anche se intanto gli schermi rallentano)')
    a.add_argument('--chi', default=os.environ.get('COMPUTERNAME') or (os.uname().nodename if hasattr(os, 'uname') else 'pc'), help='nome di questo apparecchio (nei segni)')
    o = a.parse_args()
    global ACCESSO, DEPOSITO
    try: ACCESSO = json.load(open(FILE_ACCESSO))
    except Exception: ACCESSO = None
    if o.abbina and not (ACCESSO and ACCESSO.get('casa')):
        if not abbina(o.chi): return
    if ACCESSO and not ACCESSO.get('casa'): ACCESSO = None if not o.abbina else ACCESSO
    if ACCESSO and ACCESSO.get('casa'):
        DEPOSITO = 'atmosfera'                                   # la casa privata: il suo deposito
        print('stanza privata:', ACCESSO['casa'], flush=True)
        o.casa = o.casa or 'privata'
    if o.casa:
        try: avvia_radar(o.chi)
        except Exception as e: print('radar non avviato:', e, file=sys.stderr, flush=True)
    if o.casa and not o.una and not ACCESSO:                   # la spinta: solo sul canale del link (la stanza privata resta al giro leggero al minuto)
        threading.Thread(target=ascolta_spinte, args=(o.casa,), daemon=True).start()
    if o.casa and o.pieno:
        while True:
            if not o.una: aggiornati()
            fatti = 0
            try: fatti = giro_casa(o.casa, o.larghezza, veloce=o.veloce, forza=o.forza, chi=o.chi)
            except Exception as e: print('giro non riuscito:', e, file=sys.stderr, flush=True)
            if o.una: break
            _aspetta(fatti, o.casa, o.forza, o.chi)
        return
    if o.casa:
        # sul Raspberry che intanto disegna le finestre: priorità bassa e pochi processori, le finestre prima di tutto
        try: os.nice(19)
        except Exception:
            try:                                              # Windows: priorità «inferiore al normale»
                import ctypes; ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)
            except Exception: pass
        cv2.setNumThreads(2); global FF_THREADS; FF_THREADS = '2'
        while True:
            if not o.una: aggiornati()
            fatti = 0
            try: fatti = giro_casa(o.casa, o.larghezza, veloce=o.veloce, forza=o.forza, chi=o.chi)
            except Exception as e: print('giro non riuscito:', e, file=sys.stderr, flush=True)
            if o.una: break
            _aspetta(fatti, o.casa, o.forza, o.chi)
        return
    if not (o.entrata and o.uscita): a.error('servono entrata e uscita (oppure --casa)')
    print(json.dumps(cuci(o.entrata, o.uscita, o.profondita, o.immagine, o.fuoco, o.larghezza, o.veloce, o.fermo, o.maschera), indent=1))


if __name__ == '__main__':
    main()
