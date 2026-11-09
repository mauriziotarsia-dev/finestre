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
     Un punto è una finestra accesa se è caldo (rosso > verde > blu) e più chiaro di quello che ha intorno.
     Provato sulle notti di abbazia (TV e finestrelle) e valle: trova le finestre del monastero, del casale e del
     castello, non la luna né il fiume. */
  function trovaLuci(img){
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const W = Math.min(1200, iw), H = Math.max(8, Math.round(W * ih / iw));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, N = W * H;
    const L = new Float32Array(N), I = new Float64Array((W + 1) * (H + 1));
    for (let i = 0; i < N; i++) L[i] = (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) / 255;
    for (let y = 0; y < H; y++){ let s = 0; for (let xx = 0; xx < W; xx++){ s += L[y * W + xx]; I[(y + 1) * (W + 1) + xx + 1] = I[y * (W + 1) + xx + 1] + s; } }
    const media = (x0, y0, r) => { const a = Math.max(0, x0 - r), b = Math.max(0, y0 - r), c2 = Math.min(W, x0 + r + 1), e = Math.min(H, y0 + r + 1);
      return (I[e * (W + 1) + c2] - I[b * (W + 1) + c2] - I[e * (W + 1) + a] + I[b * (W + 1) + a]) / ((c2 - a) * (e - b)); };
    const caldo = new Uint8Array(N), cand = [];
    for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++){
      const i = y * W + xx, r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, l = L[i];
      if (l > .09 && r > g * 1.06 && g > b * 1.02 && l > media(xx, y, 6) * 1.35 + .02){ caldo[i] = 1; cand.push(i); }
    }
    cand.sort((a, b) => L[b] - L[a]);
    const presi = [];
    for (const i of cand){
      const px = i % W, py = (i / W) | 0;
      if (presi.some(p => Math.abs(p.px - px) < 6 && Math.abs(p.py - py) < 6)) continue;
      let n = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++){ const yy = py + dy, x2 = px + dx; if (yy >= 0 && yy < H && x2 >= 0 && x2 < W && caldo[yy * W + x2]) n++; }
      presi.push({px, py, l: L[i], r: Math.max(1, Math.sqrt(n / Math.PI)) * 1.2, c: [d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255]});
      if (presi.length >= 40) break;
    }
    /* r: raggio della finestra, in frazioni dell'altezza dell'immagine */
    return presi.map((p, k) => ({x: (p.px + .5) / W, y: (p.py + .5) / H, r: p.r / H, l: p.l, seme: h1(p.px * .37 + k, p.py * .53), inImg: true}));
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
  function profonditaDi(dimg){
    if (!dimg) return () => .5;
    const W = 128, H = Math.max(8, Math.round(W * dimg.naturalHeight / dimg.naturalWidth));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(dimg, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    return (px, py) => d[(cl(Math.round(py * H), 0, H - 1) * W + cl(Math.round(px * W), 0, W - 1)) * 4] / 255;
  }

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
      this.fuochi = (f && f.fuochi || []).map((F, j) => {
        const sj = h1(F.x * 91, F.y * 37 + j), slot = Math.floor((ora + sj * 700) / 900);
        const acceso = brutto < .06 && (this.prova === 'fuochi' || h1(j + 40, slot) < prob) ? 1 : 0;   /* prova: vista.vita.prova = 'fuochi' li accende tutti */
        return {F, k: segui('f' + j + (f.url || ''), acceso, 25), seme: sj};
      });
      /* lucciole */
      const quante = (o === 'notte' ? 1 : o === 'tramonto' ? liscio((k - .45) / .4) * .7 : 0) * cl(1 - brutto * 8) * cl(1 - (met.nebbia || 0) * .7);
      const pr = f && f.prati || [];
      if (pr.length && f.url !== this.urlLucciole){ this.urlLucciole = f.url; this.lucciole = []; }
      const voglio = pr.length ? Math.round(24 * quante) : 0;
      while (this.lucciole.length < voglio){
        const p = pr[Math.floor(Math.random() * pr.length)], s = Math.random();
        this.lucciole.push({x: p.x + (Math.random() - .5) * .015, y: p.y + (Math.random() - .5) * .015, n: p.n, s, a: 0, per: 1.6 + 3.4 * s, fase: Math.random() * 5, nasce: this.t});
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
      for (const {F, k, seme} of this.fuochi || []){
        if (k < .02 || !(this.o === 'notte' || this.o === 'tramonto')) continue;
        const n = F.n ?? .3, fl = .55 + .7 * tremola(t, seme * 13, 9) * (.75 + .25 * Math.sin(t * 1.3 + seme * 20)), s = F.w * 1000;
        out.push({x: F.x, y: F.y, n, core: Math.max(1.4, s * .11), alone: Math.max(8, s * 1.1), col: FIAMMA, forza: (this.o === 'notte' ? 1.2 : 1) * k * fl * vela(n), modo: 'piu'});
      }
      for (const l of this.lucciole){
        const tt = t + l.fase, ph = (tt % l.per) / l.per, lampo = Math.exp(-Math.pow((ph - .5) / .07, 2)) + .25 * Math.exp(-Math.pow((ph - .72) / .05, 2));
        if (lampo < .01) continue;
        const R = .006 + .01 * l.n;
        const x = l.x + Math.sin(tt * (.21 + .2 * l.s) + l.s * 9) * R + Math.sin(tt * (.53 + .3 * l.s) + l.s * 4) * R * .4;
        const y = l.y + Math.sin(tt * (.17 + .15 * l.s) + l.s * 5) * R * .5 - .004;
        const sc = .5 + 1.2 * l.n;
        out.push({x, y, n: l.n, core: 1.1 * sc, alone: 7 * sc, col: LUCCIOLA, forza: lampo * l.a * vela(l.n) * .95, modo: 'piu'});
      }
      return out;
    }

    /* il fumo dei fuochi (va col fumo dei comignoli): {x, y, w, n, forza, bianco} */
    fumi(){
      const out = [];
      for (const {F, k} of this.fuochi || []){
        if (k < .02) continue;
        const giorno = this.o === 'giorno' || this.o === 'alba';
        out.push({x: F.x, y: F.y, w: F.w * (giorno ? 1.6 : 1), n: F.n ?? .3, forza: k * (giorno ? 1 : .55)});
      }
      return out;
    }
  }

  radice.Vita = Vita; radice.trovaLuci = trovaLuci; radice.pratiVita = prati; radice.profonditaDi = profonditaDi;
})(typeof window !== 'undefined' ? window : globalThis);
