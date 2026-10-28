/* La mappa di profondità di un paesaggio, calcolata sul telefono (gratis, niente chiave):
   Depth Anything V2 (piccolo) con transformers.js. Bianco = vicino, nero = lontano (il cielo).
   Il modello (~25 MB) si scarica la prima volta e poi resta nella cache del browser.
   Serve alla finestra per la nebbia in lontananza, per trovare il cielo (le nuvole che scorrono)
   e per la prospettiva diversa fra le due finestre. */
let _stimatore = null, _soloWasm = false;
/* su iPhone/Safari la via WebGPU di transformers.js non parte («no available backend»): lì si usa sempre WASM */
const SAFARI = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Android/.test(navigator.userAgent));
async function stimatore(avanzamento){
  if (_stimatore) return _stimatore;
  const tr = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
  const gpu = !SAFARI && !_soloWasm && !!(navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null));
  const opz = {dtype: gpu ? 'fp16' : 'q8', device: gpu ? 'webgpu' : 'wasm',
    progress_callback: p => { if (avanzamento && p.status === 'progress' && p.total) avanzamento(Math.round(p.loaded / p.total * 100)); }};
  _stimatore = await tr.pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', opz);
  _stimatore.gpu = gpu;
  return _stimatore;
}
async function stimaConRiserva(url, avanzamento){
  try { const s = await stimatore(avanzamento); return await s(url); }
  catch(e){
    if (_soloWasm) throw e;
    _soloWasm = true; _stimatore = null;                       /* seconda prova, solo WASM */
    const s = await stimatore(avanzamento); return await s(url);
  }
}

/* blob immagine → blob PNG della profondità, della stessa forma (al massimo 1024 di lato lungo) */
async function calcolaProfondita(blob, avanzamento){
  const url = URL.createObjectURL(blob);
  try {
    const out = await stimaConRiserva(url, avanzamento);
    const d = out.depth;                                     /* RawImage in scala di grigi */
    const bmp = await createImageBitmap(blob);
    const lato = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * lato), H = Math.round(bmp.height * lato);
    const sorg = document.createElement('canvas'); sorg.width = d.width; sorg.height = d.height;
    const id = sorg.getContext('2d').createImageData(d.width, d.height), ch = d.channels || 1;
    /* normalizza: il punto più lontano a 0, il più vicino a 255 */
    let mn = 255, mx = 0; for (let i = 0; i < d.width * d.height; i++){ const v = d.data[i * ch]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const k = 255 / Math.max(1, mx - mn);
    for (let i = 0; i < d.width * d.height; i++){ const v = (d.data[i * ch] - mn) * k; id.data[i*4] = id.data[i*4+1] = id.data[i*4+2] = v; id.data[i*4+3] = 255; }
    sorg.getContext('2d').putImageData(id, 0, 0);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(sorg, 0, 0, W, H);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
