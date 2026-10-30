/* ═══════════════════════════════════════════════════════════════════════════
   fermo.js — appena l'AI ha girato l'animazione, sul telefono: che cosa resta fermo e che cosa si muove.

   Il video dell'AI ridisegna ogni fotogramma da capo, anche case e campi: così tremano. Qui, in pochi
   secondi, se ne ricavano due file piccoli:
     · FERMO   (…_fermo-<ora>.jpg)    il paesaggio fermo: la mediana dei primi due secondi, gli stessi colori del video
     · MASCHERA (…_maschera-<ora>.png) dove il video si muove davvero (nebbia nelle valli, fumo, acqua), in grigio
   La finestra compone dal vivo: fermo dappertutto, video solo dentro la maschera, cielo dal panorama.
   Poi il Raspberry rifà il video a piena qualità (pi/cuci-animazione.py: stabilizzato, 30 immagini al
   secondo, strappi ricuciti) e toglie questi due file, che non servono più.
   Le regole sono le stesse di cuci-animazione.py, a risoluzione più bassa.
   ═══════════════════════════════════════════════════════════════════════════ */
const Fermo = {
  async analizza(blob, avanza = () => {}){
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    try {
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('il video non si legge')); setTimeout(() => no(new Error('il video non si apre')), 30000); });
      try { await v.play(); v.pause(); } catch(e) {}                  /* su iPhone prepara i fotogrammi */
      const D = v.duration, W = v.videoWidth, H = v.videoHeight;
      const vai = t => new Promise(ok => { const fine = () => { v.removeEventListener('seeked', fine); ok(); }; v.addEventListener('seeked', fine); v.currentTime = Math.max(0, Math.min(D - .05, t)); });
      const tela = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', {willReadFrequently:true})]; };

      /* 1. il fermo: mediana di 9 fotogrammi dei primi due secondi, a piena risoluzione */
      const [cf, xf] = tela(W, H), K = 9, quadri = [];
      for (let j = 0; j < K; j++){ await vai(j * Math.min(2, D * .25) / (K - 1)); xf.drawImage(v, 0, 0); quadri.push(xf.getImageData(0, 0, W, H).data); avanza(5 + j * 4); }
      const fermo = xf.createImageData(W, H), fd = fermo.data, val = new Uint8Array(K);
      for (let i = 0; i < fd.length; i += 4){
        for (let ch = 0; ch < 3; ch++){ for (let j = 0; j < K; j++) val[j] = quadri[j][i + ch]; val.sort(); fd[i + ch] = val[K >> 1]; }
        fd[i + 3] = 255;
      }
      quadri.length = 0;
      xf.putImageData(fermo, 0, 0);
      const fermoJpg = await new Promise(r => cf.toBlob(r, 'image/jpeg', .93));
      avanza(45);

      /* 2. che cosa si muove: 48 fotogrammi piccoli lungo tutto il video */
      const w = 135, h = Math.round(w * H / W), n = w * h, N = 48;
      const [cp, xp] = tela(w, h), L = new Float32Array(N * n);
      for (let k = 0; k < N; k++){
        await vai(k * D / N); xp.drawImage(v, 0, 0, w, h);
        const d = xp.getImageData(0, 0, w, h).data;
        for (let i = 0; i < n; i++) L[k * n + i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
        avanza(45 + k);
      }
      xp.drawImage(cf, 0, 0, w, h); const rif = xp.getImageData(0, 0, w, h).data;
      const vivo = new Float32Array(n), tend = new Float32Array(n), q = Math.max(4, Math.round(N / 5));
      for (let i = 0; i < n; i++){
        let s = 0, s2 = 0, a = 0, b = 0;
        for (let k = 0; k < N; k++){ const x = L[k * n + i]; s += x; s2 += x * x; if (k < q) a += x; if (k >= N - q) b += x; }
        const m = s / N; vivo[i] = Math.sqrt(Math.max(0, s2 / N - m * m)); tend[i] = Math.abs(b / q - a / q);
      }
      const ord = Float32Array.from(vivo).sort(), soglia = Math.max(6, ord[Math.floor(n * .7)] * 1.8);
      /* nebbia o fumo già nel paesaggio: chiaro e poco colorato (si allarga un po': si muove) */
      let nebb = new Uint8Array(n);
      for (let i = 0; i < n; i++){
        const r = rif[i * 4], g = rif[i * 4 + 1], bl = rif[i * 4 + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
        nebb[i] = mx > 120 && (mx - mn) * 255 / Math.max(1, mx) < 70 ? 1 : 0;
      }
      nebb = Fermo.dilata(nebb, w, h, 2);
      let z = new Uint8Array(n);
      for (let i = 0; i < n; i++) z[i] = (vivo[i] > soglia && tend[i] < vivo[i] * .6) || (vivo[i] > soglia * .45 && nebb[i]) ? 1 : 0;
      z = Fermo.erodi(z, w, h, 1); z = Fermo.dilata(z, w, h, 1);          /* niente puntini */
      z = Fermo.dilata(z, w, h, 2); z = Fermo.erodi(z, w, h, 2);          /* i banchi interi */
      z = Fermo.dilata(z, w, h, 1);
      const zf = Fermo.sfuma(z, w, h, 2);
      const masch = xp.createImageData(w, h);
      for (let i = 0; i < n; i++){ const g = Math.round(zf[i] * 255); masch.data[i * 4] = masch.data[i * 4 + 1] = masch.data[i * 4 + 2] = g; masch.data[i * 4 + 3] = 255; }
      xp.putImageData(masch, 0, 0);
      const mascheraPng = await new Promise(r => cp.toBlob(r, 'image/png'));
      avanza(100);
      let viva = 0; for (let i = 0; i < n; i++) viva += zf[i];
      return {fermo: fermoJpg, maschera: mascheraPng, parteViva: viva / n};
    } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
  },
  dilata(a, w, h, r){ const o = new Uint8Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let m = 0;
      for (let dy = -r; dy <= r && !m; dy++) for (let dx = -r; dx <= r; dx++){ const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && a[yy * w + xx]){ m = 1; break; } }
      o[y * w + x] = m; } return o; },
  erodi(a, w, h, r){ const o = new Uint8Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let m = 1;
      for (let dy = -r; dy <= r && m; dy++) for (let dx = -r; dx <= r; dx++){ const yy = Math.max(0, Math.min(h - 1, y + dy)), xx = Math.max(0, Math.min(w - 1, x + dx)); if (!a[yy * w + xx]){ m = 0; break; } }
      o[y * w + x] = m; } return o; },
  sfuma(a, w, h, r){ let s = Float32Array.from(a);
    for (let giro = 0; giro < 2; giro++){ const o = new Float32Array(s.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let t = 0, c = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w){ t += s[yy * w + xx]; c++; } }
        o[y * w + x] = t / c; }
      s = o; } return s; },
};
if (typeof module !== 'undefined') module.exports = {Fermo};
