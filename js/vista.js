/* ═══════════════════════════════════════════════════════════════════════════
   vista.js — il motore della finestra (WebGL)

   Disegna il paesaggio dentro uno o due fori, con il tempo atmosferico sopra.
   Tutto in un solo programma grafico, per pixel:
     · il paesaggio (foto/dipinto, o un breve video in loop) con la sua mappa di
       profondità, se c'è: serve per la prospettiva diversa fra le due finestre,
       per la nebbia che sta in lontananza e per capire dov'è il cielo;
     · il movimento, anche su un'immagine ferma: le nuvole scorrono (flusso a due
       fasi, che si ripete senza salti), gli alberi ondeggiano col vento;
     · il tempo: cielo coperto che ingrigisce e scurisce, nebbia volumetrica,
       pioggia in quattro strati di profondità con le raffiche, neve con i fiocchi
       vicini sfocati, il lampo che illumina il paesaggio dalle nuvole;
     · la luce dello schermo (bassa, più bassa di notte) e un velo di rumore
       finissimo contro le fasce di colore, che su un VA al buio si vedono.
   Con un video di YouTube sotto (che non si può leggere), disegna solo il tempo,
   su fondo trasparente.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;            /* 0..1 dentro il foro, y verso il basso */
void main(){ vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg0, uImg1, uDep0, uDep1, uImg0b;
uniform float uVmix;         /* video in loop: l'ultimo tratto sfuma nel primo */
uniform vec4 uMap;           /* dal foro all'immagine «vista»: uv = uMap.xy + vUv * uMap.zw */
uniform vec4 uCrop0, uCrop1; /* dalla vista alla texture (copertura): t = crop.xy + uv * crop.zw */
uniform float uMix;          /* 0 = immagine 0, 1 = immagine 1 (dissolvenza) */
uniform float uHaImg, uHaDep0, uHaDep1, uMovimento0, uMovimento1;
uniform float uLato, uT, uAspetto;   /* aspetto = larghezza/altezza della vista */
uniform vec2 uPix;           /* dimensione del foro in pixel */
uniform float uCoperto, uNebbia, uPioggia, uNeve, uTempesta, uVento;
uniform float uLampo, uLampoX;
uniform float uNotteFinta, uLuce, uBuio, uQualita;
uniform vec3 uColNebbia;

float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * rumore(p); p = p * 2.03 + 17.1; a *= .5; } return v; }

vec3 foto(sampler2D t, vec4 crop, vec2 uv){ return texture2D(t, clamp(crop.xy + uv * crop.zw, .0005, .9995)).rgb; }
float prof(sampler2D d, vec4 crop, vec2 uv, float ha){
  if (ha > .5) return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).r;
  /* senza mappa: il cielo è lontano in alto, il terreno si avvicina scendendo */
  return pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
}
float cielo(vec3 c, float n, float y, float ha){
  float l = dot(c, vec3(.299, .587, .114));
  if (ha > .5) return smoothstep(.04, .008, n) * smoothstep(.85, .45, y);   /* il cielo della mappa è quasi nero: i monti lontani no */
  /* senza mappa: in alto, chiaro e poco saturo o azzurro */
  float az = clamp((c.b - c.r) * 2.5 + .3, 0., 1.);
  return smoothstep(.55, .2, y) * smoothstep(.25, .55, l) * max(az, smoothstep(.6, .85, l));
}

/* un'immagine del paesaggio, già col suo movimento */
vec3 paesaggio(sampler2D img, sampler2D dep, vec4 crop, float haDep, float mov, vec2 uv, out float n, out float sky){
  n = prof(dep, crop, uv, haDep);
  /* prospettiva: le cose vicine si spostano di più fra una finestra e l'altra */
  vec2 p = uv; p.x += uLato * .012 * (n - .35);
  vec3 c = foto(img, crop, p);
  sky = cielo(c, n, p.y, haDep);
  if (mov > .5){
    /* nuvole: flusso a due fasi, ogni fase dura 26 s, nessun salto */
    float ph = uT / 26.;
    float f1 = fract(ph), f2 = fract(ph + .5);
    vec2 dir = vec2(.018 + .03 * uVento, .002);
    vec3 a = foto(img, crop, p - dir * (f1 - .5));
    vec3 b = foto(img, crop, p - dir * (f2 - .5));
    vec3 cs = mix(a, b, abs(f1 - .5) * 2.);
    c = mix(c, cs, sky);
    /* alberi e prati: ondeggiano poco, a raffiche */
    float verde = clamp((c.g - max(c.r, c.b)) * 6. + .15, 0., 1.) * smoothstep(.12, .45, n) * (1. - sky);
    if (verde > .01){
      float raffica = .55 + .45 * sin(uT * .37 + uv.y * 2.);
      float d = sin(uT * 1.9 + rumore(uv * vec2(26., 52.)) * 6.283) * .0011 * (.35 + uVento) * raffica * verde;
      c = mix(c, foto(img, crop, p + vec2(d, d * .3)), verde);
    }
  }
  return c;
}

/* pioggia: righe sottili che cadono, inclinate dal vento. Misure in pixel della vista,
   così su ogni schermo le gocce hanno la stessa grana. */
float strato(vec2 uv, float passo, float lungh, float largh, float vel, float dens, float seme){
  vec2 px = uv * uPix;                                   /* pixel della vista */
  px.x += px.y * (.1 + .25 * uVento);
  float col = floor(px.x / passo);
  float y = px.y / lungh - uT * vel * uPix.y / lungh - h1(vec2(col, seme)) * 31.;
  vec2 id = vec2(col, floor(y));
  float fy = fract(y), fx = px.x / passo - col;
  float r = h1(id + seme);
  float x0 = .5 + (h1(id + seme + 3.1) - .5) * (1. - 2. * largh / passo);
  float d = abs(fx - x0) * passo;                         /* distanza in pixel dal filo */
  float s = smoothstep(largh, largh * .2, d) * smoothstep(0., .3, fy) * smoothstep(1., .7, fy);
  return s * step(r, dens);
}
/* neve: fiocchi tondi che scendono ondeggiando; i vicini grandi e sfocati */
float fiocchi(vec2 uv, float passo, float raggio, float morbido, float vel, float seme){
  vec2 px = uv * uPix;
  px.y -= uT * vel * uPix.y;
  px.x += uT * uVento * passo * .6;
  vec2 g = px / passo, id = floor(g), f = fract(g);
  float r = h1(id + seme);
  vec2 c = vec2(.5 + (h1(id + seme + 1.7) - .5) * .5, .5 + (h1(id + seme + 5.3) - .5) * .5);
  c.x += sin(uT * (.7 + r * .8) + r * 6.283) * .18;
  float d = length(f - c) * passo;
  return smoothstep(raggio, raggio * morbido, d) * step(r, .7) * (.6 + .4 * h1(id + seme + 9.));
}

void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec3 col = vec3(0.); float n = .5, sky = 0., alfa = 1.;
  float l0 = 0.;
  if (uHaImg > .5){
    float n0, s0; vec3 c0 = paesaggio(uImg0, uDep0, uCrop0, uHaDep0, uMovimento0, uv, n0, s0);
    if (uVmix > .001){ float nb, sb; c0 = mix(c0, paesaggio(uImg0b, uDep0, uCrop0, uHaDep0, 0., uv, nb, sb), uVmix); }
    if (uMix > .001){
      float n1, s1; vec3 c1 = paesaggio(uImg1, uDep1, uCrop1, uHaDep1, uMovimento1, uv, n1, s1);
      col = mix(c0, c1, uMix); n = mix(n0, n1, uMix); sky = mix(s0, s1, uMix);
    } else { col = c0; n = n0; sky = s0; }
    float l = dot(col, vec3(.299, .587, .114)); l0 = l;
    /* notte finta (quando manca l'immagine della notte): luna, blu, poco colore */
    col = mix(col, vec3(l) * vec3(.55, .68, 1.) * .23, uNotteFinta);
    /* cielo coperto: meno colore e meno contrasto, più scuro e più freddo; il cielo diventa grigio */
    float cop = uCoperto;
    l = dot(col, vec3(.299, .587, .114));
    col = mix(col, vec3(l), cop * .5);
    col = mix(col, vec3(l) + (col - vec3(l)) * .8, cop * .4);
    col *= 1. - cop * .26 - uTempesta * .3;
    col *= mix(vec3(1.), vec3(.93, .97, 1.04), cop);
    vec3 grigio = vec3(.52, .55, .6) * (.6 + .5 * l) * (1. - uTempesta * .55) * (1. - uNotteFinta * .8);
    float nub = .75 + .5 * fbm(uv * vec2(3., 6.) + vec2(uT * .01 * (1. + uVento), 0.));
    col = mix(col, grigio * nub, sky * cop * .82);
  } else {
    alfa = 0.;                                   /* sotto c'è un video: solo il tempo, su trasparente */
    n = pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
    sky = smoothstep(.45, .15, uv.y);
    col = vec3(0.);
    float vela = uCoperto * .22 + uTempesta * .25;          /* il brutto tempo scurisce anche il video */
    alfa = vela;
  }

  /* nebbia: più fitta lontano, a banchi che si muovono piano */
  float lontano = 1. - n;
  float banchi = fbm(uv * vec2(2.2, 4.5) + vec2(uT * .013 * (1. + uVento), uT * .002));
  float banchi2 = fbm(uv * vec2(5., 9.) - vec2(uT * .021 * (1. + uVento), 0.));
  float nebbia = uNebbia * clamp(pow(lontano, 1.15) * 1.15 + .12, 0., 1.) * (.55 + .7 * banchi) * (.8 + .4 * banchi2);
  nebbia += (uPioggia * .32 + uNeve * .3) * pow(lontano, 1.6);         /* la pioggia lontana fa velo */
  nebbia = clamp(nebbia, 0., .96);
  col = mix(col, uColNebbia, nebbia);
  alfa = max(alfa, nebbia);

  /* lampo: le nuvole si accendono da dentro (si vede la loro forma), poi il paesaggio ne prende il riflesso */
  if (uLampo > .001){
    float vicino = exp(-pow((uv.x - uLampoX) * 2.4, 2.)) * smoothstep(.75, .0, uv.y);
    float nub = .55 + .9 * fbm(uv * vec2(4., 8.) + 3.7);
    float luce = uLampo * (.22 + .55 * sky * nub + .45 * vicino * sky * nub);
    col = col * (1. + luce * 1.6) + vec3(.70, .76, .95) * luce * .16;
    alfa = max(alfa, clamp(luce * .8, 0., 1.));
  }

  /* pioggia, dal lontano al vicino: le gocce lontane fitte e sottili, le vicine rade, lunghe e sfocate */
  if (uPioggia > .01){
    float dens = uPioggia * (.6 + .4 * fbm(vec2(uv.x * 1.3 - uT * .22 * (1. + uVento), uT * .05)));
    vec3 goccia = mix(vec3(.66, .7, .76), uColNebbia * 1.1 + .08, .45) * (1. - uNotteFinta * .65) * (.75 + .45 * l0);
    float a = 0.;
    a += strato(uv, 4.,  22., 1.,  .95, dens,        1.) * .11;
    a += strato(uv, 8.,  40., 1.3, 1.45, dens * .85, 2.) * .15;
    if (uQualita > .5) a += strato(uv, 16., 80., 2.,  2.2, dens * .6,  3.) * .18;
    a += strato(uv, 38., 170., 3.5, 3.3, dens * .35, 4.) * .12;
    col = mix(col, goccia, clamp(a, 0., 1.));
    alfa = max(alfa, a);
  }
  /* neve: dai fiocchi lontani, piccoli e fitti, a quelli vicinissimi, grandi e fuori fuoco */
  if (uNeve > .01){
    float a = 0.;
    a += fiocchi(uv, 9.,   1.1, .1,  .05, 1.) * .75;
    a += fiocchi(uv, 19.,  2.,  .25, .08, 2.) * .85;
    if (uQualita > .5) a += fiocchi(uv, 46.,  4.5, .35, .13, 3.) * .7;
    if (uQualita > .5) a += fiocchi(uv, 120., 13., .05, .2, 4.) * .28;
    a *= uNeve;
    col = mix(col, vec3(.94, .96, 1.) * (1. - uNotteFinta * .6), clamp(a, 0., 1.));
    alfa = max(alfa, a);
  }

  /* luce dello schermo, buio dei cambi, rumore finissimo contro le fasce */
  col *= uLuce * (1. - uBuio);
  col += (h1(gl_FragCoord.xy + fract(uT) * 97.) - .5) / 255.;
  if (uHaImg > .5) gl_FragColor = vec4(max(col, 0.), 1.);
  else { float a = clamp(alfa, 0., 1.) * (1. - uBuio) + uBuio; gl_FragColor = vec4(max(col, 0.) * (1. - uBuio), a); }
}`;

/* ─────────────────────────────────────────────────────────────────────────── */

class Vista {
  constructor(canvas){
    this.c = canvas;
    const gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:false, antialias:false, preserveDrawingBuffer:false})
            || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL non disponibile');
    this.gl = gl;
    const sh = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.p = p;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const nome of ['uImg0b','uVmix','uImg0','uImg1','uDep0','uDep1','uMap','uCrop0','uCrop1','uMix','uHaImg','uHaDep0','uHaDep1','uMovimento0','uMovimento1',
      'uLato','uT','uAspetto','uPix','uCoperto','uNebbia','uPioggia','uNeve','uTempesta','uVento','uLampo','uLampoX',
      'uNotteFinta','uLuce','uBuio','uQualita','uColNebbia']) this.u[nome] = gl.getUniformLocation(p, nome);
    gl.uniform1i(this.u.uImg0, 0); gl.uniform1i(this.u.uImg1, 1); gl.uniform1i(this.u.uDep0, 2); gl.uniform1i(this.u.uDep1, 3); gl.uniform1i(this.u.uImg0b, 4);
    this.vuota = this.texture(); this.carica(this.vuota, new Uint8Array([0,0,0,255]), 1, 1);
    /* le due «fonti» (quella che si vede e quella da cui si sfuma): immagine, profondità, eventuale video */
    this.fonti = [this.fonteVuota(), this.fonteVuota()];
    this.mix = 0; this.mixDa = 0; this.mixDur = 0;
  }
  texture(){ const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  carica(t, sorgente, w, h){ const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sorgente);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sorgente); }
  fonteVuota(){ return {img:null, tex:null, dep:null, depTex:null, video:null, iw:1, ih:1, url:null, ok:false}; }

  /* nuova immagine (o video in loop), con la sua profondità; sfuma da quella di prima in `dur` secondi */
  async mostra({url, profondita = null, video = null, fuoco = null}, dur = 0){
    if (this.fonti[0].ok && this.fonti[0].url === url + '|' + (video || '')){ this.fonti[0].fuoco = fuoco; return; }
    const chiave = url + '|' + (video || '');
    if (this.inArrivo === chiave) return;
    this.inArrivo = chiave;
    try { await this._mostra(chiave, url, profondita, video, dur, fuoco); } finally { if (this.inArrivo === chiave) this.inArrivo = null; }
  }
  async _mostra(chiave, url, profondita, video, dur, fuoco){
    const f = this.fonteVuota(); f.url = chiave; f.fuoco = fuoco;
    const im = await caricaImg(url);
    f.img = im; f.iw = im.naturalWidth; f.ih = im.naturalHeight; f.tex = this.texture(); this.carica(f.tex, im);
    if (profondita){ try { const d = await caricaImg(profondita); f.depTex = this.texture(); this.carica(f.depTex, d); } catch(e) {} }
    if (video){ try { f.video = await apriVideo(video); f.vtex = this.texture(); } catch(e) { f.video = null; } }
    f.ok = true;
    const vecchia = this.fonti[0];
    this.fonti = [f, vecchia];
    this.mix = dur > 0 && vecchia.ok ? 1 : 0;   /* 1 = si vede ancora la vecchia; scende a 0 */
    this.mixDa = performance.now(); this.mixDur = dur * 1000;
    if (!(dur > 0)) this.libera(vecchia);
    this.vecchiaDaLiberare = dur > 0 ? vecchia : null;
  }
  togli(){ for (const f of this.fonti) this.libera(f); this.fonti = [this.fonteVuota(), this.fonteVuota()]; this.mix = 0; }
  libera(f){ const gl = this.gl; if (!f) return;
    for (const t of [f.tex, f.depTex, f.vtex, f.vtexB]) if (t) gl.deleteTexture(t);
    if (f.video) f.video.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    f.tex = f.depTex = f.vtex = f.vtexB = null; f.ok = false; }
  get urlInVista(){ return this.fonti[0].ok ? this.fonti[0].url : null; }

  /* il fotogramma del video in loop: due lettori; nell'ultimo tratto parte il secondo dall'inizio
     e i due si sfumano, così il giro non si vede. Ritorna il peso del secondo (0 se non c'è). */
  aggiornaVideo(f){
    f.vk = 0;
    if (!f.video || !f.vtex) return false;
    const [a, b] = f.video, D = a.duration || 0, coda = Math.min(1.5, D * .2);
    if (D > 2 && a.currentTime > D - coda && b.paused){ b.currentTime = 0; b.play().catch(() => {}); }
    if (!b.paused){
      const k = Math.min(1, Math.max(0, (a.currentTime - (D - coda)) / coda));
      if (a.ended || k >= 1){ a.pause(); f.video = [b, a]; return this.aggiornaVideo(f); }
      if (b.readyState >= 2){ if (!f.vtexB) f.vtexB = this.texture(); this.carica(f.vtexB, b); f.vk = k; }
    }
    if (a.readyState >= 2){ this.carica(f.vtex, a); return true; }
    return false;
  }

  crop(f, aspettoVista, margine = 1.04, fuoco = null){
    /* copertura: l'immagine riempie la vista con un filo di margine per la prospettiva;
       dove l'immagine avanza, l'inquadratura scelta (fuoco 0..1, 0.5 = al centro) decide che parte si vede */
    const ai = f.iw / f.ih;
    let sw = 1, sh = 1;
    if (ai > aspettoVista) sw = aspettoVista / ai; else sh = ai / aspettoVista;
    sw /= margine; sh /= margine;
    const fx = fuoco && fuoco.x != null ? fuoco.x : .5, fy = fuoco && fuoco.y != null ? fuoco.y : .5;
    return [(1 - sw) * fx, (1 - sh) * fy, sw, sh];
  }

  /* disegna: fori = [{x,y,w,h, map:[x,y,w,h], aspetto, lato}] in pixel del canvas */
  disegna(fori, s){
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.c.width, this.c.height);
    gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, s.trasparente ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.mix > 0){
      this.mix = Math.max(0, 1 - (performance.now() - this.mixDa) / Math.max(1, this.mixDur));
      if (this.mix === 0 && this.vecchiaDaLiberare){ this.libera(this.vecchiaDaLiberare); this.vecchiaDaLiberare = null; }
    }
    const [f0, f1] = this.fonti;
    const v0 = this.aggiornaVideo(f0), v1 = this.mix > 0 && this.aggiornaVideo(f1);
    const haImg = f0.ok && !s.trasparente;
    const lega = (unita, t) => { gl.activeTexture(gl.TEXTURE0 + unita); gl.bindTexture(gl.TEXTURE_2D, t || this.vuota); };
    lega(0, haImg ? (v0 ? f0.vtex : f0.tex) : null);
    lega(1, haImg && this.mix > 0 ? (v1 ? f1.vtex : f1.tex) : null);
    lega(2, f0.depTex); lega(3, f1.depTex); lega(4, haImg && f0.vk > 0 ? f0.vtexB : null);
    gl.uniform1f(u.uVmix, haImg && v0 ? f0.vk : 0);
    gl.uniform1f(u.uHaImg, haImg ? 1 : 0);
    const k = this.mix * this.mix * (3 - 2 * this.mix);
    gl.uniform1f(u.uMix, haImg && f1.ok ? k : 0);
    gl.uniform1f(u.uHaDep0, f0.depTex ? 1 : 0); gl.uniform1f(u.uHaDep1, f1.depTex ? 1 : 0);
    /* il movimento «finto» delle nuvole serve solo sulle immagini ferme: un video si muove già da sé */
    gl.uniform1f(u.uMovimento0, s.movimento && !v0 ? 1 : 0); gl.uniform1f(u.uMovimento1, s.movimento && !v1 ? 1 : 0);
    gl.uniform1f(u.uT, s.t);
    for (const k2 of ['Coperto','Nebbia','Pioggia','Neve','Tempesta','Vento','Lampo','LampoX','NotteFinta','Luce','Buio','Qualita'])
      gl.uniform1f(u['u' + k2], s[k2.charAt(0).toLowerCase() + k2.slice(1)] || 0);
    gl.uniform3fv(u.uColNebbia, s.colNebbia);
    gl.enable(gl.SCISSOR_TEST);
    for (const foro of fori){
      const y = this.c.height - foro.y - foro.h;              /* WebGL conta dal basso */
      gl.viewport(foro.x, y, foro.w, foro.h); gl.scissor(foro.x, y, foro.w, foro.h);
      gl.uniform4fv(u.uMap, foro.map);
      gl.uniform1f(u.uAspetto, foro.aspetto);
      gl.uniform2f(u.uPix, foro.w / foro.map[2], foro.h / foro.map[3]);   /* pixel della vista intera */
      gl.uniform1f(u.uLato, s.prospettiva ? foro.lato : 0);
      gl.uniform4fv(u.uCrop0, f0.ok ? this.crop(v0 ? {iw:f0.video[0].videoWidth || f0.iw, ih:f0.video[0].videoHeight || f0.ih} : f0, foro.aspetto, 1.04, f0.fuoco) : [0,0,1,1]);
      gl.uniform4fv(u.uCrop1, f1.ok ? this.crop(v1 ? {iw:f1.video[0].videoWidth || f1.iw, ih:f1.video[0].videoHeight || f1.ih} : f1, foro.aspetto, 1.04, f1.fuoco) : [0,0,1,1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}

function caricaImg(url){
  return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => ok(im); im.onerror = () => no(new Error('immagine non caricata: ' + url)); im.src = url; });
}
function apriVideo(url){
  const fai = () => { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true;
    v.preload = 'auto'; v.src = url; return v; };
  const a = fai(), b = fai();
  return new Promise((ok, no) => {
    a.oncanplay = () => { a.oncanplay = null; a.play().then(() => ok([a, b])).catch(no); };
    a.onerror = () => no(new Error('video non caricato'));
    setTimeout(() => no(new Error('video lento')), 20000);
  });
}
