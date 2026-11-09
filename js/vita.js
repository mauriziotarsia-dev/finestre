/* ═══════════════════════════════════════════════════════════════════════════
   vita.js — la vita del paesaggio a ogni ora (9/11/2026).

   Maurizio: «metterei su tutti gli orari gli effetti aggiuntivi che suggerivi (luci delle case, lucciole, fuocherelli,
   etc.)», «sempre, da soli», e «valuta tu se aggiungere anche altro». Qui si decide che cosa c'è e dove, ora per ora;
   il disegno lo fa js/vista.js (luci e lucciole come piccoli bagliori sopra il paesaggio, il fumo dei fuochi col fumo
   dei comignoli, il pulviscolo con pioggia e neve, i pipistrelli con gli uccelli in js/uccelli.js).

     · LUCI DELLE CASE: le finestre accese si trovano da sole sull'immagine della notte (punti caldi più chiari di
       quello che hanno intorno). Al tramonto si accendono una a una, di notte brillano un po' di più e ogni tanto
       qualcuna si spegne e si riaccende, all'alba si spengono una a una. Di giorno niente. Senza immagine della notte
       (o se non ce ne sono) una o due finestre sotto ogni comignolo.
     · FUOCHI LONTANI: dove li mette l'AI insieme ai comignoli (…_comignoli.json, «fuochi»). Ognuno si accende e si
       spegne per conto suo, per un quarto d'ora o più: di notte e al tramonto un falò che tremola col suo filo di
       fumo, di giorno il fumo bianco delle sterpaglie, all'alba le braci che fumano. Mai con la pioggia o la neve.
     · LUCCIOLE: nei prati e fra i cespugli vicini (dalla profondità), di notte e verso la fine del tramonto; vagano
       piano e lampeggiano ognuna col suo ritmo. Non con pioggia, neve o nebbia fitta.
   Tutto è in coordinate dell'immagine (0..1), con la profondità di ogni punto per la prospettiva.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (radice) {
  const fr = v => v - Math.floor(v);
  const h1 = (a, b = 0) => fr(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const liscio = v => { v = cl(v); return v * v * (3 - 2 * v); };
  /* un tremolio morbido (somma di seni con frequenze non multiple): niente scatti, mai uguale */
  const tremola = (t, s, hz) => .5 + .27 * Math.sin(t * hz + s * 31) + .15 * Math.sin(t * hz * 2.37 + s * 17) + .08 * Math.sin(t * hz * 5.11 + s * 7);

  /* ── le finestre accese, dall'immagine della notte ─────────────────────────
     ⚠ 9/11 (Maurizio: «spendere più tempo per ottimizzare la ricerca delle finestre da illuminare, per non trovare
     falsi positivi»). Non è una domanda all'AI: la pagina guarda l'immagine della notte, a piena risoluzione (fino a
     2400 punti di larghezza: a 1200 le finestre lontane, 2-4 pixel, si confondevano e se ne trovavano la metà).
       1. candidati: pixel caldi (rosso ≥ verde ≥ blu) e almeno il 45% più chiari della media intorno;
       2. i pixel vicini fanno una macchia sola (una finestra = una macchia, non tre punti sulla stessa finestra);
       3. si scarta una macchia se: è troppo grande per una finestra; è una striscia (riflesso nell'acqua, bagliore
          sull'orizzonte); è rossa (resti del tramonto); è debole (un granello d'erba); sta nel cielo (dalla profondità:
          luna, stelle); di giorno nello stesso punto c'è qualcosa di più chiaro del suo intorno (una macchia di sole
          dipinta, non una finestra: le finestre di giorno sono scure) o c'è fogliame (una finestra sta su un muro).
     Provato sulle tre notti che ci sono (abbazia TV: 41 finestre, abbazia finestrelle: 10, valle: 30), guardando una
     per una le macchie trovate e quelle scartate: nessuna fuori posto; scartati un granello nell'erba e un pezzo di
     muro al sole. */
  function datiImg(img, W, H){
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(img, 0, 0, W, H);
    return x.getImageData(0, 0, W, H).data;
  }
  function trovaLuci(img, giorno = null, prof = null){
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const W = Math.min(2400, iw), H = Math.max(8, Math.round(W * ih / iw)), N = W * H;
    const d = datiImg(img, W, H);
    const L = new Float32Array(N);
    for (let i = 0; i < N; i++) L[i] = (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) / 255;
    /* media intorno a ogni punto (finestra di 2R+1), con l'immagine integrale */
    const R = Math.max(4, Math.round(H * .006)), I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++){ let s = 0; for (let x = 0; x < W; x++){ s += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } }
    const media = (Lx, x0, y0) => { const a = Math.max(0, x0 - R), b = Math.max(0, y0 - R), c2 = Math.min(W, x0 + R + 1), e = Math.min(H, y0 + R + 1);
      return (Lx[e * (W + 1) + c2] - Lx[b * (W + 1) + c2] - Lx[e * (W + 1) + a] + Lx[b * (W + 1) + a]) / ((c2 - a) * (e - b)); };
    const m = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){
      const i = y * W + x, r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], l = L[i];
      if (l > .07 && r > g * 1.05 && g >= b){ const mm = media(I, x, y); if (l > mm * 1.45 && l - mm > .035) m[i] = 1; }
    }
    /* il giorno, per il controllo: luminosità, e la sua media intorno solo dove serve */
    let dg = null, Lg = null;
    if (giorno){ try { dg = datiImg(giorno, W, H); Lg = new Float32Array(N); for (let i = 0; i < N; i++) Lg[i] = (dg[i * 4] * .299 + dg[i * 4 + 1] * .587 + dg[i * 4 + 2] * .114) / 255; } catch(e) { dg = null; } }
    const mediaG = (x0, y0) => { let s = 0, n = 0; for (let y = Math.max(0, y0 - R); y <= Math.min(H - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(W - 1, x0 + R); x++){ s += Lg[y * W + x]; n++; } return s / n; };
    const amax = Math.pow(H * .012, 2), luci = [], pila = [];
    for (let i0 = 0; i0 < N; i0++){
      if (!m[i0]) continue;
      /* la macchia: tutti i pixel candidati attaccati */
      const px = []; m[i0] = 0; pila.push(i0);
      while (pila.length){ const i = pila.pop(); px.push(i); const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H){ const j = yy * W + xx; if (m[j]){ m[j] = 0; pila.push(j); } } } }
      let x0 = W, x1 = 0, y0 = H, y1 = 0, sl = 0, sx = 0, sy = 0, pk = 0, sr = 0, sg = 0;
      for (const i of px){ const x = i % W, y = (i / W) | 0, l = L[i]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sl += l; sx += x * l; sy += y * l; pk = Math.max(pk, l); sr += d[i * 4]; sg += d[i * 4 + 1]; }
      const area = px.length, w = x1 - x0 + 1, h = y1 - y0 + 1, cx = sx / sl, cy = sy / sl;
      if (area > amax) continue;                                  /* troppo grande per una finestra */
      if ((w > 3 * h && w > 3) || (h > 8 * w && h > 8)) continue;  /* striscia */
      if (sg < sr * .5) continue;                                 /* rossa */
      if (pk < .12) continue;                                     /* debole */
      if (prof && prof(cx / W, cy / H) < .03) continue;           /* nel cielo */
      if (Lg){
        let s = 0; for (const i of px) s += Lg[i];
        if (s / area / (mediaG(Math.round(cx), Math.round(cy)) + .01) > 1.6) continue;   /* di giorno è una macchia chiara */
        let v = 0, n = 0;
        for (let y = Math.max(0, y0 - 2); y <= Math.min(H - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(W - 1, x1 + 2); x++){ const j = (y * W + x) * 4; n++; if (dg[j + 1] > dg[j] * 1.08 && dg[j + 1] > dg[j + 2] * 1.08) v++; }
        if (v / n > .7) continue;                                 /* di giorno lì c'è fogliame */
      }
      luci.push({x: (cx + .5) / W, y: (cy + .5) / H, r: Math.max(1, Math.sqrt(area / Math.PI)) * 1.15 / H, l: pk});
    }
    luci.sort((a, b) => b.l - a.l);
    /* una finestra con la colonnina in mezzo fa due macchie vicinissime: diventano una luce sola (se no di notte se ne
       spegneva metà) */
    const unite = [], vicino = Math.max(3, H * .003) / H;
    for (const L2 of luci){
      const u = unite.find(q => Math.abs(q.x - L2.x) * W / H < vicino && Math.abs(q.y - L2.y) < vicino);
      if (u) u.r = Math.max(u.r, Math.hypot((u.x - L2.x) * W / H, u.y - L2.y) + L2.r); else unite.push(L2);
    }
    return unite.slice(0, 60).map((L2, k) => Object.assign(L2, {seme: h1(L2.x * 997 + k, L2.y * 613), inImg: true}));
  }

  /* dove possono stare le lucciole: prati e cespugli vicini (profondità alta, sotto l'orizzonte) */
  function prati(dimg){
    if (!dimg) return [];
    const W = 64, H = Math.max(8, Math.round(W * dimg.naturalHeight / dimg.naturalWidth));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(dimg, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, v = [];
    for (let y = Math.floor(H * .45); y < H; y++) for (let xx = 0; xx < W; xx++){
      const n = d[(y * W + xx) * 4] / 255;
      if (n > .4) v.push({x: (xx + .5) / W, y: (y + .5) / H, n});
    }
    return v;
  }

  /* la profondità di un punto (per la prospettiva), dalla mappa piccola */
  function profonditaDi(dimg, W = 128){
    if (!dimg) return () => .5;
    const H = Math.max(8, Math.round(W * dimg.naturalHeight / dimg.naturalWidth));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(dimg, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    return (px, py) => d[(cl(Math.round(py * H), 0, H - 1) * W + cl(Math.round(px * W), 0, W - 1)) * 4] / 255;
  }

  const FUOCHI = true;   /* 9/11: dei fuochi resta solo il fumo (Maurizio: «il fumo anche di notte può rimanere, se ne vanno solo i fuochi») */
  const LUCE = [1, .6, .26], LUCCIOLA = [.72, 1, .3], FIAMMA = [1, .5, .16];

  class Vita {
    constructor(){ this.lucciole = []; this.stato = new Map(); this.t = 0; }

    /* o: l'ora che si vede; k: a che punto è (0 appena cominciata … 1 finita); met: il tempo */
    aggiorna(dt, f, o, k, met){
      this.t += dt;
      const ora = Date.now() / 1000, brutto = Math.max(met.pioggia || 0, met.neve || 0, (met.tempesta || 0) * .7);
      const segui = (chiave, verso, tau) => { const v = this.stato.get(chiave) ?? verso; const n = v + (verso - v) * Math.min(1, dt / tau); this.stato.set(chiave, n); return n; };
      /* luci delle case */
      this.luci = (f && f.luci || []).map((L, i) => {
        let su = 0;
        if (o === 'tramonto') su = L.seme < cl((k - .05) / .7) * .85 ? 1 : 0;
        else if (o === 'notte'){ const slot = Math.floor((ora + L.seme * 900) / 420); su = h1(i + 1, slot) < .17 ? 0 : 1; }
        else if (o === 'alba') su = L.seme < .65 * (1 - cl(k / .6)) ? 1 : 0;
        return {L, k: segui('l' + i + (f.url || ''), su, .6)};
      });
      /* fuochi lontani: ognuno ha i suoi quarti d'ora */
      const prob = {notte: .6, tramonto: .5, alba: .3, giorno: .35}[o] || 0;
      /* ⚠ 9/11 (Maurizio: «eliminerei i fuochi, lascerei il resto»): spenti. Il codice resta, basta FUOCHI = true */
      this.fuochi = (FUOCHI && f && f.fuochi || []).map((F, j) => {
        const sj = h1(F.x * 91, F.y * 37 + j), slot = Math.floor((ora + sj * 700) / 900);
        const acceso = brutto < .06 && (this.prova === 'fuochi' || h1(j + 40, slot) < prob) ? 1 : 0;   /* prova: vista.vita.prova = 'fuochi' li accende tutti */
        return {F, k: segui('f' + j + (f.url || ''), acceso, 25), seme: sj};
      });
      /* lucciole */
      const quante = (o === 'notte' ? 1 : o === 'tramonto' ? liscio((k - .45) / .4) * .7 : 0) * cl(1 - brutto * 8) * cl(1 - (met.nebbia || 0) * .7);
      const pr = f && f.prati || [];
      if (pr.length && f.url !== this.urlLucciole){ this.urlLucciole = f.url; this.lucciole = []; }
      const voglio = pr.length ? Math.round(7 * quante) : 0;   /* 9/11 (Maurizio: «troppe lucciole»): erano 24 */
      while (this.lucciole.length < voglio){
        const p = pr[Math.floor(Math.random() * pr.length)], s = Math.random();
        this.lucciole.push({x: p.x + (Math.random() - .5) * .015, y: p.y + (Math.random() - .5) * .015, n: p.n, s, a: 0, per: 3 + 4.5 * s, fase: Math.random() * 5, nasce: this.t});
      }
      this.lucciole.forEach((l, i) => { l.via = i >= voglio; });
      this.lucciole = this.lucciole.filter(l => { l.a += ((l.via ? 0 : 1) - l.a) * Math.min(1, dt / 2); return !(l.via && l.a < .02); });
      this.brutto = brutto; this.o = o;
    }

    /* i bagliori da disegnare: {x, y, n, core, alone (pixel su un'altezza di 1000), col, forza, modo: 'piu'|'per'} */
    bagliori(met){
      const out = [], t = this.t, nebbia = met.nebbia || 0;
      const vela = n => cl(1 - nebbia * (.35 + .6 * (1 - n))) * (1 - (met.pioggia || 0) * .35);
      for (const {L, k} of this.luci || []){
        const n = L.n ?? .5, fl = .82 + .3 * tremola(t, L.seme * 9, 6 + 5 * L.seme) - .15, r = Math.max(1.1, L.r * 1000);
        if (this.o === 'notte' && L.inImg){
          /* di notte la finestra è già nell'immagine: brilla un po' di più, oppure si spegne */
          if (k > .02) out.push({x: L.x, y: L.y, n, core: r * .9, alone: r * 5 + 4, col: LUCE, forza: .5 * k * fl * vela(n), modo: 'piu'});
          if (k < .98) out.push({x: L.x, y: L.y, n, core: r * 1.5, alone: r * 1.5, col: [.22, .24, .3], forza: 1 - k, modo: 'per'});
        } else if (k > .02){
          out.push({x: L.x, y: L.y, n, core: r * 1.05, alone: r * 5 + 4, col: LUCE, forza: (this.o === 'notte' ? .9 : 1.25) * k * fl * vela(n), modo: 'piu'});
        }
      }
      /* (dei fuochi lontani non si disegna più la fiamma: resta il fumo, in fumi()) */
      for (const l of this.lucciole){
        const tt = t + l.fase, ph = (tt % l.per) / l.per, lampo = Math.exp(-Math.pow((ph - .5) / .07, 2)) + .25 * Math.exp(-Math.pow((ph - .72) / .05, 2));
        if (lampo < .01) continue;
        const R = .006 + .01 * l.n;
        const x = l.x + Math.sin(tt * (.21 + .2 * l.s) + l.s * 9) * R + Math.sin(tt * (.53 + .3 * l.s) + l.s * 4) * R * .4;
        const y = l.y + Math.sin(tt * (.17 + .15 * l.s) + l.s * 5) * R * .5 - .004;
        const sc = .5 + 1.2 * l.n;
        out.push({x, y, n: l.n, core: .9 * sc, alone: 5 * sc, col: LUCCIOLA, forza: lampo * l.a * vela(l.n) * .7, modo: 'piu'});
      }
      return out;
    }

    /* il fumo dei fuochi (va col fumo dei comignoli): {x, y, w, n, forza, bianco} */
    fumi(){
      const out = [];
      for (const {F, k} of this.fuochi || []){
        if (k < .02) continue;
        const giorno = this.o === 'giorno' || this.o === 'alba';
        out.push({x: F.x, y: F.y, w: F.w * (giorno ? 1.6 : 1.2), n: F.n ?? .3, forza: k * (giorno ? 1 : .7)});
      }
      return out;
    }
  }

  radice.Vita = Vita; radice.trovaLuci = trovaLuci; radice.pratiVita = prati; radice.profonditaDi = profonditaDi;
})(typeof window !== 'undefined' ? window : globalThis);
