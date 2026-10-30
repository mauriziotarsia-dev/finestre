/* ═══════════════════════════════════════════════════════════════════════════
   vista.js — il motore della finestra (WebGL)

   Disegna il paesaggio dentro uno o due fori, con il tempo atmosferico sopra.
   Tre programmi grafici, pensati per girare fluidi anche su un Raspberry 4:
     · nebbia e nuvole a un quarto di risoluzione (sono forme morbide);
     · il programma principale, per pixel, descritto qui sotto;
     · pioggia e neve goccia per goccia, come piccoli rettangoli (costano solo dove cadono).
   Il programma principale:
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
uniform vec4 uCropD0, uCropD1; /* lo stesso per la mappa di profondità: con un video è diverso (la mappa è dell'immagine intera, il video ne è un taglio) */
uniform float uUccelli;      /* 0..1: quanti uccelli (di giorno, col bel tempo) */
uniform sampler2D uCielo0, uCielo1;   /* il cielo panoramico che scorre (si ripete ai lati) */
uniform vec4 uCieloM0, uCieloM1;      /* x: dove finisce il cielo nell'immagine (0..1 dall'alto), y: larghezza/altezza del panorama, z: larghezza/altezza dell'immagine; x = 0: nessun cielo */
uniform float uCieloX;                /* quanto è scorso (in larghezze del panorama) */
uniform sampler2D uFermo0, uFermo1;   /* video non ancora cucito: rgb il paesaggio fermo, a dove si muove davvero */
uniform float uHaFermo0, uHaFermo1;
uniform float uMix;          /* 0 = immagine 0, 1 = immagine 1 (dissolvenza) */
uniform float uHaImg, uHaDep0, uHaDep1, uMovimento0, uMovimento1;
uniform float uLato, uT, uAspetto;
uniform vec3 uOcchio;         /* dov'è chi guarda: x a destra-sinistra (-1..1), z vicinanza (-1 lontano .. 1 vicino) */   /* aspetto = larghezza/altezza della vista */
uniform vec2 uPix;           /* dimensione del foro in pixel */
uniform float uCoperto, uNebbia, uPioggia, uNeve, uTempesta, uVento;
uniform float uLampo, uLampoX;
uniform float uNotteFinta, uLuce, uBuio, uQualita;
uniform vec3 uColNebbia;
uniform sampler2D uMeteo;     /* nebbia e nuvole, calcolate a bassa risoluzione (r: banchi di nebbia, g: nuvole, b: velo) */

/* hash senza seno: sulle schede dei Raspberry il seno costa caro */
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * rumore(p); p = p * 2.03 + 17.1; a *= .5; } return v / .9375; }

vec3 foto(sampler2D t, vec4 crop, vec2 uv){ return texture2D(t, clamp(crop.xy + uv * crop.zw, .0005, .9995)).rgb; }
float prof(sampler2D d, vec4 crop, vec2 uv, float ha){
  if (ha > .5) return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).r;
  /* senza mappa: il cielo è lontano in alto, il terreno si avvicina scendendo */
  return pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
}
float cielo(vec3 c, float n, float y, float ha){
  float l = dot(c, vec3(.299, .587, .114));
  if (ha > .5) return smoothstep(.022, .004, n) * smoothstep(.85, .45, y);   /* il cielo della mappa è quasi nero: i monti lontani (appena più chiari) no */
  /* senza mappa: in alto, chiaro e poco saturo o azzurro */
  float az = clamp((c.b - c.r) * 2.5 + .3, 0., 1.);
  return smoothstep(.55, .2, y) * smoothstep(.25, .55, l) * max(az, smoothstep(.6, .85, l));
}

/* letture con il livello di dettaglio deciso fuori dai rami: dentro un «if» che vale per alcuni
   pixel sì e per altri no, la scheda non saprebbe che livello della mipmap usare */
vec3 fotoG(sampler2D t, vec4 crop, vec2 uv, vec2 gx, vec2 gy){
#if __VERSION__ >= 300
  return textureGrad(t, clamp(crop.xy + uv * crop.zw, .0005, .9995), gx, gy).rgb;
#else
  return texture2D(t, clamp(crop.xy + uv * crop.zw, .0005, .9995)).rgb;
#endif
}
float profG(sampler2D d, vec4 crop, vec2 uv, float ha, vec2 gx, vec2 gy){
  if (ha < .5) return pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
#if __VERSION__ >= 300
  return textureGrad(d, clamp(crop.xy + uv * crop.zw, .0005, .9995), gx, gy).r;
#else
  return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).r;
#endif
}

/* un'immagine del paesaggio, già col suo movimento */
vec3 paesaggio(sampler2D img, sampler2D dep, vec4 crop, vec4 cropD, float haDep, float mov, sampler2D cie, vec4 cm, sampler2D fer, float haF, vec2 uv, out float n, out float sky){
  n = prof(dep, cropD, uv, haDep);
  /* prospettiva: le cose vicine si spostano di più fra una finestra e l'altra */
  vec2 p = uv; p.x += uLato * .012 * (n - .35);
  /* prospettiva viva: chi si sposta a destra vede più paesaggio a sinistra (il lontano scorre con lui, il vicino meno);
     chi si avvicina alla finestra vede un po' più di paesaggio */
  p.x += uOcchio.x * .065 * (1. - .7 * n);
  p = .5 + (p - .5) * (1. + uOcchio.z * .07);
  vec3 c = foto(img, crop, p);
  sky = cielo(c, n, p.y, haDep);
  /* video non ancora cucito: fermo dappertutto, video solo dove si muove davvero e solo dove è chiaro e poco
     colorato (nebbia, fumo, acqua che luccica: i cipressi scuri dentro un banco di nebbia restano fermi);
     il cielo dal video, se non c'è il panorama */
  if (haF > .5){
    vec4 fb = texture2D(fer, clamp(crop.xy + p * crop.zw, .0005, .9995));
    float mx = max(fb.r, max(fb.g, fb.b)), mn = min(fb.r, min(fb.g, fb.b));
    float chiaro = smoothstep(.38, .6, mx) * (1. - smoothstep(.2, .42, (mx - mn) / max(mx, .01)));
    float vivo = max(fb.a * chiaro, cm.x > 0. ? 0. : sky);
    c = mix(fb.rgb, c, vivo);
  }
  /* cielo che scorre: al posto del cielo dipinto, il panorama alla stessa scala dell'immagine, che si ripete
     ai lati e scorre all'infinito; verso l'orizzonte torna piano il cielo vero (la foschia sopra le colline) */
  if (cm.x > 0.){
    vec2 ti = cropD.xy + p * cropD.zw;   /* coordinate dell'immagine intera (col video, il taglio della profondità) */
    vec2 pp = vec2(ti.x * cm.z / (cm.y * cm.x) + uCieloX, ti.y / cm.x);
#if __VERSION__ >= 300
    vec2 cgx = dFdx(pp), cgy = dFdy(pp);
#endif
    if (sky > .002){
#if __VERSION__ >= 300
      vec3 cs = textureGrad(cie, vec2(fract(pp.x), clamp(pp.y, .002, .998)), cgx, cgy).rgb;
#else
      vec3 cs = texture2D(cie, vec2(fract(pp.x), clamp(pp.y, .002, .998))).rgb;
#endif
      c = mix(c, cs, sky * (1. - smoothstep(.8, 1., pp.y)));
    }
  }
  if (mov > .25){   /* 1 = nuvole e alberi (immagine ferma), .5 = solo alberi (video: le nuvole le ha già) */
#if __VERSION__ >= 300
    vec2 gx = dFdx(p) * crop.zw, gy = dFdy(p) * crop.zw;
#else
    vec2 gx = vec2(0.), gy = vec2(0.);
#endif
    /* nuvole: flusso a due fasi, ogni fase dura 26 s, nessun salto; solo dove c'è cielo */
    if (sky > .002 && mov > .75){
      float ph = uT / 26.;
      float f1 = fract(ph), f2 = fract(ph + .5);
      vec2 dir = vec2(.012 + .02 * uVento, .0015);
      vec2 pa = p - dir * (f1 - .5), pb = p - dir * (f2 - .5);
      vec3 a = fotoG(img, crop, pa, gx, gy), b = fotoG(img, crop, pb, gx, gy);
      /* si prende solo cielo: un pezzo di monte o di castello spostato dentro il cielo darebbe il contorno doppio */
      float sa = cielo(a, profG(dep, cropD, pa, haDep, gx, gy), pa.y, haDep), sb = cielo(b, profG(dep, cropD, pb, haDep, gx, gy), pb.y, haDep);
      float w = abs(f1 - .5) * 2., wa = (1. - w) * sa, wb = w * sb, tot = wa + wb;
      vec3 cs = tot > .001 ? (a * wa + b * wb) / tot : c;
      c = mix(c, cs, sky * clamp(tot * 1.5, 0., 1.));
    }
    /* ⚠ 30/10 · ALBERI (Maurizio: «alberi li vedo sempre fermi»): prima si spostavano di mezzo pixel, ognuno per
       conto suo. Ora il vento passa a raffiche che attraversano il paesaggio come onde, le chiome si piegano
       insieme a gruppi (rami) e le foglie tremano fini; i vicini si muovono di più dei lontani: da 1-2 pixel
       da 2-4 pixel col sereno a 8-9 col temporale (su un foro alto 1000). Solo dove c'è verde, mai nel cielo. */
    float mxc = max(c.r, max(c.g, c.b)), satc = (mxc - min(c.r, min(c.g, c.b))) / max(mxc, .01);
    float verde = clamp((c.g - max(c.r, c.b)) * 7. + .25, 0., 1.) * smoothstep(.05, .14, satc) * smoothstep(.1, .4, n) * (1. - sky);   /* anche gli ulivi grigio-verdi; non la nebbia */
    if (verde > .01){
      float onda = .5 + .5 * sin(uT * .85 - uv.x * 6.5 + rumore(uv * 2.5 + vec2(uT * .04, 0.)) * 3.);
      float raffica = mix(.3, 1., smoothstep(.35, .95, onda));
      vec2 q = uv * vec2(13., 20.);
      float fx = rumore(q + vec2(uT * .75, 0.)) - .5, fy = rumore(q * 1.3 + vec2(3.7, uT * .6)) - .5;
      float foglie = sin(uT * 3.3 + rumore(uv * vec2(70., 110.)) * 6.283) * .3;
      float px = (1.5 + 4. * n) * (.5 + uVento * 1.4) * raffica;
      vec2 d = vec2(fx * 2. + foglie, fy * .7) * px * (uPix.y / 1000.) / uPix;
      vec3 mosso = haF > .5 ? texture2D(fer, clamp(crop.xy + (p + d) * crop.zw, .0005, .9995)).rgb : fotoG(img, crop, p + d, gx, gy);
      c = mix(c, mosso, verde);
    }
  }
  return c;
}

float segmento(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
/* ⚠ 30/10 · UCCELLI (Maurizio: «migliora gli uccelli in volo»). Due stormi e, ogni tanto, un rapace.
   Gli stormi entrano da un bordo ed escono dall'altro su una traiettoria che ondeggia, a V larga e scomposta;
   ognuno ha il suo ritmo: qualche battito, poi plana. Il rapace invece gira in tondo sopra la valle, ad ali
   tese, e se ne va. Le ali sono curve (spalla, gomito, punta) e si assottigliano verso la punta; più lontano
   (più in alto nel cielo) vuol dire più piccolo e più chiaro. La vista è una sola fra le due finestre: chi esce
   dalla prima entra nella seconda. */
float ala(vec2 q, float s, float su, float giu){
  /* un'ala destra (x > 0): spalla in 0, gomito alzato di «su», punta alzata di «giu» (negativo = sotto) */
  vec2 g = vec2(s * .45, -s * su), p = vec2(s, -s * giu);
  float d1 = segmento(q, vec2(0.), g), d2 = segmento(q, g, p);
  float t = clamp(q.x / s, 0., 1.);
  return min(d1, d2) - (1. - t) * .35;             /* più spessa alla spalla */
}
float uccello(vec2 q, float s, float fase, float plana, float sc){
  float b = sin(fase) * (1. - plana);              /* battito: -1 ali giù, 1 ali su */
  float su = .32 + .22 * b, giu = .12 + .55 * b - .1 * plana;
  q.x = abs(q.x);                                  /* le due ali sono una lo specchio dell'altra */
  float d = ala(q, s, su, giu);
  d = min(d, length(q * vec2(1., 1.6)) - .45 * sc);   /* il corpo */
  return 1. - smoothstep(.35 * sc, .35 * sc + .9, d);
}
float uccelli(vec2 uv){
  float a = 0., sc = uPix.y / 1000.;
  for (int k = 0; k < 2; k++){
    float fk = float(k), P = 53. + fk * 31., T = 30. + fk * 8., tt = uT + fk * 19.;
    float ciclo = floor(tt / P), tc = tt - ciclo * P;
    if (tc > T) continue;
    float r1 = h1(vec2(ciclo + 3.1, fk * 7.1)), r2 = h1(vec2(fk * 3.3, ciclo + 1.7)), r3 = h1(vec2(ciclo, fk + 11.));
    float dir = r1 < .5 ? 1. : -1., pr = tc / T;
    float quota = .07 + .2 * r2;
    vec2 c = vec2(dir > 0. ? mix(-.2, 1.2, pr) : mix(1.2, -.2, pr),
                  quota + .035 * sin(pr * 5.2 + r3 * 6.) + .012 * sin(uT * .5 + fk));
    float lont = mix(1.25, .7, clamp((quota - .07) / .2, 0., 1.));   /* più in basso nel cielo = più vicino */
    vec2 d = (uv - c) * uPix;
    if (abs(d.x) > 90. * sc || abs(d.y) > 50. * sc) continue;
    for (int j = 0; j < 5; j++){
      float fj = float(j);
      float lato = mod(fj, 2.) * 2. - 1., fila = floor((fj + 1.) * .5);   /* a V: il capo, poi a coppie dietro */
      vec2 o = vec2(-dir * (fila * 13. + 4. * h1(vec2(fj, ciclo))), lato * fila * 6.5 + 3. * sin(uT * (.4 + .1 * fj) + fj * 2.1)) * sc * lont;
      o += vec2(2.5 * sin(uT * .23 + fj * 4.), 0.) * sc;
      vec2 q = d - o;
      q.x *= dir;                                 /* guardano dove vanno (la forma è simmetrica, ma il ritmo no) */
      float s = (3.4 + 1.1 * h1(vec2(fj + 9., fk))) * sc * lont;
      float plana = smoothstep(-.2, .5, sin(uT * (.55 + .07 * fj) + fj * 1.7 + fk * 3.));
      a = max(a, uccello(q, s, uT * (8.5 + fj * .6) + fj, plana, sc) * (.75 + .25 * lont));
    }
  }
  /* il rapace: ogni tanto, gira in tondo ad ali tese sopra la valle mentre il vento lo sposta */
  {
    float P = 97., T = 42., tt = uT + 37.;
    float ciclo = floor(tt / P), tc = tt - ciclo * P;
    if (tc < T){
      float r1 = h1(vec2(ciclo + 5.3, 2.7)), r2 = h1(vec2(1.9, ciclo + 8.1));
      float dir = r1 < .5 ? 1. : -1., pr = tc / T;
      float th = uT * .45 * dir;
      vec2 c = vec2(dir > 0. ? mix(-.15, 1.15, pr) : mix(1.15, -.15, pr), .12 + .14 * r2) + vec2(cos(th) * .09, sin(th) * .025);
      vec2 d = (uv - c) * uPix;
      if (abs(d.x) < 40. * sc && abs(d.y) < 30. * sc){
        float inclina = sin(th) * .35;            /* in virata un'ala si abbassa */
        vec2 q = vec2(d.x * cos(inclina) - d.y * sin(inclina), d.x * sin(inclina) + d.y * cos(inclina));
        float plana = smoothstep(-.6, .2, sin(uT * .3 + r2 * 6.));
        a = max(a, uccello(q, 7.5 * sc, uT * 4.5, plana, sc));
      }
    }
  }
  return a;
}

void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec3 col = vec3(0.); float n = .5, sky = 0., alfa = 1.;
  float l0 = 0.;
  if (uHaImg > .5){
    float n0, s0; vec3 c0 = paesaggio(uImg0, uDep0, uCrop0, uCropD0, uHaDep0, uMovimento0, uCielo0, uCieloM0, uFermo0, uHaFermo0, uv, n0, s0);
    if (uVmix > .001){ float nb, sb; c0 = mix(c0, paesaggio(uImg0b, uDep0, uCrop0, uCropD0, uHaDep0, 0., uCielo0, uCieloM0, uFermo0, uHaFermo0, uv, nb, sb), uVmix); }
    if (uMix > .001){
      float n1, s1; vec3 c1 = paesaggio(uImg1, uDep1, uCrop1, uCropD1, uHaDep1, uMovimento1, uCielo1, uCieloM1, uFermo1, uHaFermo1, uv, n1, s1);
      col = mix(c0, c1, uMix); n = mix(n0, n1, uMix); sky = mix(s0, s1, uMix);
    } else { col = c0; n = n0; sky = s0; }
    /* uccelli: entrano da un bordo ed escono dall'altro, mai dal nulla; solo nel cielo, quindi dietro torri e monti */
    if (uUccelli > .01 && sky > .2){ float b = uccelli(uv) * uUccelli * smoothstep(.2, .7, sky); col = mix(col, col * .3 + vec3(.035, .035, .045), b * .8); }
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
    if (cop > .01 && sky > .01){                  /* il cielo grigio si calcola solo dove serve */
      vec3 grigio = vec3(.52, .55, .6) * (.6 + .5 * l) * (1. - uTempesta * .55) * (1. - uNotteFinta * .8);
      float nub = .75 + .5 * texture2D(uMeteo, vUv).g;
      col = mix(col, grigio * nub, sky * cop * .82);
    }
  } else {
    alfa = 0.;                                   /* sotto c'è un video: solo il tempo, su trasparente */
    n = pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
    sky = smoothstep(.45, .15, uv.y);
    col = vec3(0.);
    float vela = uCoperto * .22 + uTempesta * .25;          /* il brutto tempo scurisce anche il video */
    alfa = vela;
  }

  /* nebbia: più fitta lontano, a banchi che scorrono col vento e cambiano forma (il disegno dei banchi
     arriva già pronto dal passaggio a bassa risoluzione) */
  float lontano = 1. - n;
  if (uNebbia + uPioggia + uNeve > .005){
    vec4 fm = texture2D(uMeteo, vUv);
    float nebbia = uNebbia * clamp(pow(lontano, 1.15) * 1.15 + .12, 0., 1.) * fm.r * 1.35;
    nebbia += (uPioggia * .32 + uNeve * .3) * pow(lontano, 1.6) * (.8 + .4 * fm.b);   /* la pioggia lontana fa velo, a scrosci */
    nebbia = clamp(nebbia, 0., .96);
    col = mix(col, uColNebbia, nebbia);
    alfa = max(alfa, nebbia);
  }

  /* lampo: le nuvole si accendono da dentro (si vede la loro forma), poi il paesaggio ne prende il riflesso */
  if (uLampo > .001){
    float vicino = exp(-pow((uv.x - uLampoX) * 2.4, 2.)) * smoothstep(.75, .0, uv.y);
    float nub = .55 + .9 * texture2D(uMeteo, vUv).g;
    float luce = uLampo * (.22 + .55 * sky * nub + .45 * vicino * sky * nub);
    col = col * (1. + luce * 1.6) + vec3(.70, .76, .95) * luce * .16;
    alfa = max(alfa, clamp(luce * .8, 0., 1.));
  }

  /* (pioggia e neve sono disegnate dopo, goccia per goccia e fiocco per fiocco: vedi PART_VERT) */

  /* luce dello schermo, buio dei cambi, rumore finissimo contro le fasce */
  col *= uLuce * (1. - uBuio);
  col += (h1(gl_FragCoord.xy + fract(uT) * 97.) - .5) / 255.;
  if (uHaImg > .5) gl_FragColor = vec4(max(col, 0.), 1.);
  else { float a = clamp(alfa, 0., 1.) * (1. - uBuio) + uBuio; gl_FragColor = vec4(max(col, 0.) * (1. - uBuio), a); }
}`;

/* ── nebbia e nuvole a bassa risoluzione ──────────────────────────────────────
   Sono forme morbide: calcolarle su un pixel ogni sedici e poi sfumarle non si vede, e costa
   sedici volte meno. Esce una piccola immagine che il programma principale legge. */
const METEO_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec4 uMap;
uniform float uT, uVento;
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * rumore(p); p = p * 2.03 + 17.1; a *= .5; } return v / .96875; }
void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  float vv = 1. + 1.5 * uVento;
  vec2 q = uv * vec2(2., 3.6);
  /* i banchi sono disegnati da un campo che a sua volta è deformato da un altro campo, che si muove
     in un'altra direzione: così non scorrono rigidi ma cambiano forma mentre passano */
  vec2 w = vec2(fbm(q * .7 + vec2(uT * .018, 1.7)), fbm(q * .7 + vec2(4.3, -uT * .014))) - .5;
  float banchi = fbm(q + w * 1.8 + vec2(uT * .035 * vv, uT * .006));
  float banchi2 = fbm(uv * vec2(5., 8.) + w - vec2(uT * .06 * vv, -uT * .01));     /* sfilacci più vicini, più veloci */
  float neb = smoothstep(.15, .85, banchi * .9 + banchi2 * .35);
  float nub = fbm(uv * vec2(3., 6.) + vec2(uT * .012 * (1. + uVento), 0.));
  gl_FragColor = vec4(neb, nub, banchi, 1.);
}`;

/* ── pioggia e neve: ogni goccia e ogni fiocco è un piccolo rettangolo ─────────
   Il costo dipende solo da quanti pixel coprono le gocce, non dalla grandezza della finestra.
   La posizione di ognuno si calcola dal tempo e da quattro numeri a caso fissi: niente stato da
   aggiornare, e il movimento è continuo. Le misure valgono per un foro alto 1000 pixel e si
   scalano con l'altezza vera del foro (uScala): la grana è la stessa su telefono, finestrella e TV. */
const PART_VERT = `
precision highp float;
attribute vec2 aAngolo;       /* angolo del rettangolo: -1..1 */
attribute vec4 aSeme;         /* quattro numeri a caso, fissi per ogni goccia */
uniform vec2 uFori;           /* misura del foro in pixel */
uniform float uT, uVento, uScala, uTipo, uDens, uSale;
uniform vec4 uStrato;         /* pioggia: lunghezza, larghezza, velocità, -  ·  neve: raggio, -, velocità, - */
varying vec2 vQ; varying float vA, vW;
void main(){
  vec4 r = fract(aSeme + uSale * vec4(.1234, .5678, .9012, .3456));
  vec2 c, pos;
  float vis;
  if (uTipo < .5){
    /* pioggia: cade inclinata dal vento; le raffiche (uDens che ondeggia lungo la finestra) la fanno
       più fitta e più rada a ondate */
    float incl = .1 + .25 * uVento;
    float L = uStrato.x * uScala * (.7 + .6 * r.w), W = max(uStrato.y * uScala, .7);
    float est = L / uFori.y;
    float y = fract(r.y + uT * uStrato.z * (.85 + .3 * r.z)) * (1. + 2. * est) - est;
    float x = r.x * (uFori.x + incl * uFori.y) - incl * uFori.y + y * uFori.y * incl;
    c = vec2(x, y * uFori.y);
    float xr = c.x / uFori.y;
    float raffica = .62 + .38 * (.5 + .5 * sin(xr * 4.1 - uT * .9 * (1. + uVento))) * (.5 + .5 * sin(xr * 1.7 + uT * .31 + 1.3));
    vis = step(fract(r.w * 7.31 + r.z), uDens * raffica);
    vec2 dir = normalize(vec2(incl, 1.)), nrm = vec2(dir.y, -dir.x);
    float hw = W * .5 + 1.;
    pos = c + dir * (aAngolo.y * L * .5) + nrm * (aAngolo.x * hw);
    vQ = vec2(aAngolo.x * hw, aAngolo.y * .5 + .5); vW = W;
    vA = vis * min(1., W);
  } else {
    /* neve: ogni fiocco ha la sua grandezza, la sua velocità e il suo dondolio; il vento li porta di lato */
    float R = uStrato.x * uScala * (.5 + .9 * r.w);
    float est = R / uFori.y;
    float y = fract(r.y + uT * uStrato.z * (.7 + .6 * r.z)) * (1. + 2. * est) - est;
    float fr = .6 + 1.1 * fract(r.x * 13.7);
    float x = fract(r.x + uT * uVento * uStrato.z * .25);
    float amp = (2. + 3. * fract(r.y * 9.1)) * R + 4. * uScala;
    c = vec2(x * uFori.x + sin(uT * fr + r.z * 6.283) * amp, y * uFori.y + sin(uT * fr * 1.7 + r.x * 6.283) * R * .5);
    vis = step(fract(r.w * 7.31 + r.z), uDens);
    float hw = R + 1.5;
    pos = c + aAngolo * hw;
    vQ = aAngolo * hw; vW = R;
    vA = vis * (.55 + .45 * fract(r.z * 5.3));
  }
  gl_Position = vis > .5 ? vec4(pos.x / uFori.x * 2. - 1., 1. - pos.y / uFori.y * 2., 0., 1.) : vec4(2., 2., 2., 1.);
}`;
const PART_FRAG = `
precision highp float;
uniform vec3 uColore;
uniform float uTipo, uMorb, uAlfa;
varying vec2 vQ; varying float vA, vW;
void main(){
  float a;
  if (uTipo < .5){
    a = clamp(vW * .5 + .5 - abs(vQ.x), 0., 1.) * smoothstep(0., .3, vQ.y) * smoothstep(1., .75, vQ.y);
  } else {
    a = smoothstep(vW, vW * uMorb, length(vQ));
  }
  gl_FragColor = vec4(uColore, a * vA * uAlfa);
}`;
/* gli strati: dal lontano (fitto, sottile, lento) al vicino (rado, grande, veloce).
   n = quanti al massimo per un foro alto 1000 pixel e largo 400 */
const PIOGGIA = [
  {n:3000, lungh:14,  largh:1,   vel:.95, dens:1,   alfa:.17, fine:true},
  {n:800,  lungh:26,  largh:1.3, vel:1.45, dens:.85, alfa:.24, fine:true},
  {n:220,  lungh:52,  largh:2,   vel:2.2, dens:.6,  alfa:.28},
  {n:45,   lungh:110, largh:3.5, vel:3.3, dens:.35, alfa:.19}
];
const NEVE = [
  {n:3000, raggio:1.1, morb:.1,  vel:.05, alfa:.7,  fine:true},
  {n:700,  raggio:2,   morb:.25, vel:.08, alfa:.85, fine:true},
  {n:120,  raggio:4.5, morb:.35, vel:.13, alfa:.75},
  {n:20,   raggio:13,  morb:.05, vel:.2,  alfa:.3}
];
const SEMI = 40000;

/* ─────────────────────────────────────────────────────────────────────────── */

class Vista {
  constructor(canvas){
    this.c = canvas;
    /* desynchronized: Chromium disegna senza aspettare il compositore (un fotogramma di ritardo in meno, utile alla prospettiva viva) */
    const opz = {alpha:true, premultipliedAlpha:false, antialias:false, preserveDrawingBuffer:false, desynchronized:true};
    /* WebGL2 dove c'è (Raspberry compresi): mipmap anche sulle immagini non quadrate, e gocce «in serie» */
    let gl = canvas.getContext('webgl2', opz);
    this.gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opz) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL non disponibile');
    this.gl = gl;
    /* con WebGL2 i programmi passano alla lingua GLSL 3: servono le letture col livello di dettaglio esplicito */
    const in3 = (src, vert) => '#version 300 es\n' + (vert ? src.replace(/\battribute /g, 'in ').replace(/\bvarying /g, 'out ')
      : src.replace(/\bvarying /g, 'in ').replace(/gl_FragColor/g, 'fragColor').replace(/(precision \w+ float;)/, '$1\nout vec4 fragColor;')).replace(/texture2D\(/g, 'texture(');
    const sh = (tipo, src) => { if (this.gl2) src = in3(src.trim(), tipo === gl.VERTEX_SHADER);
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const programma = (v, f, attr) => { const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
      attr.forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const posizioni = (p, nomi) => { const u = {}; for (const n of nomi) u[n] = gl.getUniformLocation(p, n); return u; };
    /* il programma principale: paesaggio, cielo, nebbia, lampo, luce */
    this.p = programma(VERT, FRAG, ['aPos']);
    this.u = posizioni(this.p, ['uOcchio','uImg0b','uVmix','uImg0','uImg1','uDep0','uDep1','uMap','uCrop0','uCrop1','uCropD0','uCropD1','uUccelli','uCielo0','uCielo1','uCieloM0','uCieloM1','uCieloX','uFermo0','uFermo1','uHaFermo0','uHaFermo1','uMix','uHaImg','uHaDep0','uHaDep1','uMovimento0','uMovimento1',
      'uLato','uT','uAspetto','uPix','uCoperto','uNebbia','uPioggia','uNeve','uTempesta','uVento','uLampo','uLampoX',
      'uNotteFinta','uLuce','uBuio','uQualita','uColNebbia','uMeteo']);
    gl.useProgram(this.p);
    gl.uniform1i(this.u.uImg0, 0); gl.uniform1i(this.u.uImg1, 1); gl.uniform1i(this.u.uDep0, 2); gl.uniform1i(this.u.uDep1, 3); gl.uniform1i(this.u.uImg0b, 4); gl.uniform1i(this.u.uMeteo, 5); gl.uniform1i(this.u.uCielo0, 6); gl.uniform1i(this.u.uCielo1, 7); gl.uniform1i(this.u.uFermo0, 8); gl.uniform1i(this.u.uFermo1, 9);
    this.unita = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) || 8;   /* il fermo vuole 10 unità (il Raspberry 4 ne ha 16) */
    /* nebbia e nuvole a bassa risoluzione */
    this.pm = programma(VERT, METEO_FRAG, ['aPos']);
    this.um = posizioni(this.pm, ['uMap','uT','uVento']);
    /* gocce e fiocchi */
    this.pp = programma(PART_VERT, PART_FRAG, ['aAngolo', 'aSeme']);
    this.up = posizioni(this.pp, ['uFori','uT','uVento','uScala','uTipo','uDens','uSale','uStrato','uColore','uMorb','uAlfa']);
    this.ist = this.gl2 ? {div:(i, d) => gl.vertexAttribDivisor(i, d), disegna:(n) => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)}
      : (() => { const e = gl.getExtension('ANGLE_instanced_arrays'); return e ? {div:(i, d) => e.vertexAttribDivisorANGLE(i, d), disegna:(n) => e.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, n)} : null; })();
    /* i rettangoli: uno per tutto il foro, uno per goccia; e i numeri a caso delle gocce */
    this.bQuad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const semi = new Float32Array(SEMI * 4); for (let i = 0; i < semi.length; i++) semi[i] = Math.random();
    this.bSemi = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bSemi); gl.bufferData(gl.ARRAY_BUFFER, semi, gl.STATIC_DRAW);
    this.vuota = this.texture(); this.carica(this.vuota, new Uint8Array([0,0,0,255]), 1, 1);
    this.meteo = [];   /* per ogni foro: la sua piccola immagine di nebbia e nuvole */
    /* le due «fonti» (quella che si vede e quella da cui si sfuma): immagine, profondità, eventuale video */
    this.fonti = [this.fonteVuota(), this.fonteVuota()];
    this.mix = 0; this.mixDa = 0; this.mixDur = 0;
  }
  quad(){ const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (this.ist){ this.ist.div(1, 0); gl.disableVertexAttribArray(1); } }
  /* la piccola immagine della nebbia per il foro i, grande un quarto per lato */
  bufferMeteo(i, w, h){
    const gl = this.gl, W = Math.max(8, Math.ceil(w / 4)), H = Math.max(8, Math.ceil(h / 4));
    let m = this.meteo[i];
    if (m && m.w === W && m.h === H) return m;
    if (m){ gl.deleteTexture(m.tex); gl.deleteFramebuffer(m.fb); }
    const tex = this.texture(); this.carica(tex, null, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.meteo[i] = {tex, fb, w:W, h:H};
  }
  texture(){ const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  carica(t, sorgente, w, h){ const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sorgente);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sorgente); }
  /* mipmap: l'immagine ridotta già pronta; più nitida senza sfarfallio quando si sposta, e molto
     più veloce da leggere sulle schede deboli (l'immagine è più grande del foro) */
  mip(t){ const gl = this.gl; if (!(window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext)) return;
    gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  fonteVuota(){ return {img:null, tex:null, dep:null, depTex:null, video:null, cTex:null, cm:[0,0,0,0], fTex:null, iw:1, ih:1, url:null, ok:false}; }

  /* nuova immagine (o video in loop), con la sua profondità; sfuma da quella di prima in `dur` secondi */
  async mostra({url, profondita = null, video = null, fuoco = null, cielo = null, fermo = null, maschera = null}, dur = 0){
    if (this.fonti[0].ok && this.fonti[0].url === url + '|' + (video || '')){ this.fonti[0].fuoco = fuoco; return; }
    const chiave = url + '|' + (video || '');
    if (this.inArrivo === chiave) return;
    this.inArrivo = chiave;
    try { await this._mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera); } finally { if (this.inArrivo === chiave) this.inArrivo = null; }
  }
  async _mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera){
    const f = this.fonteVuota(); f.url = chiave; f.fuoco = fuoco;
    const im = await caricaImg(url);
    f.img = im; f.iw = im.naturalWidth; f.ih = im.naturalHeight; f.tex = this.texture(); this.carica(f.tex, im); this.mip(f.tex);
    let dimg = null;
    if (profondita){ try { dimg = await caricaImg(profondita); f.depTex = this.texture(); this.carica(f.depTex, dimg); this.mip(f.depTex); } catch(e) { dimg = null; } }
    /* il cielo che scorre (serve la profondità, per sapere dov'è il cielo). Il video resta per quello che
       si muove sotto il cielo (nebbia nelle valli, fumo dei camini): il suo cielo non si usa più */
    if (cielo && dimg){
      try {
        const ci = await caricaImg(cielo), oriz = orizzonte(dimg);
        if (oriz > .05){ f.cTex = this.texture(); this.carica(f.cTex, ci); this.mip(f.cTex); f.cm = [oriz, ci.naturalWidth / ci.naturalHeight, f.iw / f.ih, 0]; }
      } catch(e) { /* nessun cielo panoramico per questo paesaggio */ }
    }
    if (video){ try { f.video = await apriVideo(video); f.vtex = this.texture(); } catch(e) { f.video = null; } }
    /* fermo + maschera in una texture sola (rgb + a); se non ci sono, il video è già cucito */
    if (f.video && fermo && maschera && this.unita >= 10){
      try {
        const [fi, mi] = await Promise.all([caricaImg(fermo), caricaImg(maschera)]);
        const W = fi.naturalWidth, H = fi.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', {willReadFrequently:true});
        x.drawImage(mi, 0, 0, W, H); const m = x.getImageData(0, 0, W, H);
        x.drawImage(fi, 0, 0, W, H); const d = x.getImageData(0, 0, W, H);
        for (let i = 3; i < d.data.length; i += 4) d.data[i] = m.data[i - 3];
        f.fTex = this.texture(); const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, f.fTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d);
      } catch(e) { f.fTex = null; /* niente fermo: il video è già cucito (o il file non c'è più) */ }
    }
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
    for (const t of [f.tex, f.depTex, f.vtex, f.vtexB, f.cTex, f.fTex]) if (t) gl.deleteTexture(t);
    if (f.video) f.video.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    f.tex = f.depTex = f.vtex = f.vtexB = f.cTex = f.fTex = null; f.ok = false; }
  get urlInVista(){ return this.fonti[0].ok ? this.fonti[0].url : null; }

  /* (il video è già tagliato sull'inquadratura scelta quando è stato creato: lì il fuoco non serve)
     il fotogramma del video in loop: due lettori; nell'ultimo tratto parte il secondo dall'inizio
     e i due si sfumano, così il giro non si vede. Ritorna il peso del secondo (0 se non c'è). */
  aggiornaVideo(f){
    f.vk = 0;
    if (!f.video || !f.vtex) return false;
    /* ⚠ 30/10: le animazioni sono «cucite» (pi/cuci-animazione.py): la fine sfuma già nell'inizio dentro il
       file. Qui basta un passaggio cortissimo da un lettore all'altro, solo perché il giro non inciampi
       (prima: un secondo e mezzo di dissolvenza, con due video da decodificare insieme sul Raspberry,
       e uccelli e nebbia che comparivano e sparivano). */
    /* video non ancora cucito: il giro sfuma più a lungo (solo nella nebbia e nel fumo, il resto è fermo) */
    const [a, b] = f.video, D = a.duration || 0, coda = f.fTex ? Math.min(2.5, D * .3) : Math.min(.25, D * .05);
    if (D > 2 && a.currentTime > D - coda && b.paused){ b.currentTime = 0; b.play().catch(() => {}); }
    if (!b.paused){
      const k = Math.min(1, Math.max(0, (a.currentTime - (D - coda)) / coda));
      if (a.ended || k >= 1){ a.pause(); f.video = [b, a]; f.vNuovo = true; return this.aggiornaVideo(f); }
      if (b.readyState >= 2 && nuovoFotogramma(b)){ if (!f.vtexB) f.vtexB = this.texture(); this.carica(f.vtexB, b); }
      f.vk = f.vtexB ? k : 0;
    }
    /* il fotogramma si carica sulla scheda solo quando è nuovo: il video ne ha 30 al secondo, lo schermo
       60 giri (prima lo si ricaricava a ogni giro: il doppio del lavoro, e sul Raspberry si perdevano immagini) */
    if (a.readyState >= 2){ if (nuovoFotogramma(a) || f.vNuovo){ this.carica(f.vtex, a); f.vNuovo = false; } return true; }
    return false;
  }

  /* ⚠ 30/10: la mappa di profondità è dell'immagine intera, il video invece ne è un taglio 9:16 (fatto quando
     è stato creato: copertura, orizzontale dall'inquadratura scelta, verticale al centro). Prima si leggeva
     la mappa col taglio del video: profondità sfasate, e le case si spostavano come fossero cielo. */
  cropProfondita(f, c){
    const vw = f.video[0].videoWidth || 9, vh = f.video[0].videoHeight || 16;
    const s = Math.max(vw / f.iw, vh / f.ih), rw = vw / s / f.iw, rh = vh / s / f.ih;
    const fx = f.fuoco && f.fuoco.x != null ? f.fuoco.x : .5, rx = (1 - rw) * fx, ry = (1 - rh) / 2;
    return [rx + c[0] * rw, ry + c[1] * rh, c[2] * rw, c[3] * rh];
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.c.width, this.c.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, s.trasparente ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT);
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
    lega(2, f0.depTex); lega(3, f1.depTex); lega(4, haImg && f0.vk > 0 ? f0.vtexB : null); lega(5, null); lega(6, f0.cTex); lega(7, f1.cTex); if (this.unita >= 10){ lega(8, f0.fTex); lega(9, f1.fTex); }
    /* uniformi del programma principale (restano al programma anche quando si passa agli altri) */
    gl.useProgram(this.p);
    gl.uniform1f(u.uVmix, haImg && v0 ? f0.vk : 0);
    gl.uniform1f(u.uHaImg, haImg ? 1 : 0);
    const k = this.mix * this.mix * (3 - 2 * this.mix);
    gl.uniform1f(u.uMix, haImg && f1.ok ? k : 0);
    gl.uniform1f(u.uHaDep0, f0.depTex ? 1 : 0); gl.uniform1f(u.uHaDep1, f1.depTex ? 1 : 0);
    /* il movimento «finto» delle nuvole serve solo sulle immagini ferme: un video si muove già da sé */
    /* con un video le nuvole si muovono già da sé: restano solo gli alberi (nel video cucito sono fermi come le case) */
    gl.uniform1f(u.uMovimento0, s.movimento ? (v0 || f0.cTex ? .5 : 1) : 0); gl.uniform1f(u.uMovimento1, s.movimento ? (v1 || f1.cTex ? .5 : 1) : 0);
    gl.uniform4fv(u.uCieloM0, haImg && f0.cTex && s.movimento ? f0.cm : [0,0,0,0]); gl.uniform4fv(u.uCieloM1, haImg && f1.cTex && s.movimento ? f1.cm : [0,0,0,0]);
    gl.uniform1f(u.uCieloX, s.cieloX || 0);
    gl.uniform1f(u.uHaFermo0, haImg && v0 && f0.fTex ? 1 : 0); gl.uniform1f(u.uHaFermo1, haImg && v1 && f1.fTex ? 1 : 0);
    gl.uniform1f(u.uT, s.t);
    for (const k2 of ['Coperto','Nebbia','Pioggia','Neve','Tempesta','Vento','Lampo','LampoX','NotteFinta','Luce','Buio','Qualita'])
      gl.uniform1f(u['u' + k2], s[k2.charAt(0).toLowerCase() + k2.slice(1)] || 0);
    gl.uniform3fv(u.uColNebbia, s.colNebbia);
    gl.uniform1f(u.uUccelli, haImg ? (s.uccelli || 0) : 0);
    const oc = s.occhio || {x:0, z:0}; gl.uniform3f(u.uOcchio, oc.x || 0, 0, oc.z || 0);
    const marg = s.margine || 1.04;
    const tempo = (s.nebbia || 0) + (s.pioggia || 0) + (s.neve || 0) > .005 || (s.coperto || 0) > .01 || (s.lampo || 0) > .001;
    const gocce = this.ist && ((s.pioggia || 0) > .01 || (s.neve || 0) > .01);
    this.quad();
    fori.forEach((foro, i) => {
      const y = this.c.height - foro.y - foro.h;              /* WebGL conta dal basso */
      /* 1. nebbia e nuvole, a un quarto di risoluzione */
      let tm = null;
      if (tempo){
        const m = this.bufferMeteo(i, foro.w, foro.h); tm = m.tex;
        lega(5, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, m.w, m.h);
        gl.useProgram(this.pm);
        gl.uniform4fv(this.um.uMap, foro.map); gl.uniform1f(this.um.uT, s.t); gl.uniform1f(this.um.uVento, s.vento || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      /* 2. il paesaggio col suo tempo */
      gl.useProgram(this.p);
      lega(5, tm);
      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(foro.x, y, foro.w, foro.h); gl.scissor(foro.x, y, foro.w, foro.h);
      gl.uniform4fv(u.uMap, foro.map);
      gl.uniform1f(u.uAspetto, foro.aspetto);
      gl.uniform2f(u.uPix, foro.w / foro.map[2], foro.h / foro.map[3]);   /* pixel della vista intera */
      gl.uniform1f(u.uLato, s.prospettiva ? foro.lato : 0);
      const c0 = f0.ok ? this.crop(v0 ? {iw:f0.video[0].videoWidth || f0.iw, ih:f0.video[0].videoHeight || f0.ih} : f0, foro.aspetto, marg, v0 ? null : f0.fuoco) : [0,0,1,1];
      const c1 = f1.ok ? this.crop(v1 ? {iw:f1.video[0].videoWidth || f1.iw, ih:f1.video[0].videoHeight || f1.ih} : f1, foro.aspetto, marg, v1 ? null : f1.fuoco) : [0,0,1,1];
      gl.uniform4fv(u.uCrop0, c0); gl.uniform4fv(u.uCrop1, c1);
      gl.uniform4fv(u.uCropD0, v0 ? this.cropProfondita(f0, c0) : c0); gl.uniform4fv(u.uCropD1, v1 ? this.cropProfondita(f1, c1) : c1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      /* 3. pioggia e neve, goccia per goccia, sopra */
      if (gocce) this.disegnaGocce(foro, s);
    });
  }
  disegnaGocce(foro, s){
    const gl = this.gl, up = this.up;
    gl.useProgram(this.pp);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); this.ist.div(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bSemi); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); this.ist.div(1, 1);
    gl.uniform2f(up.uFori, foro.w, foro.h); gl.uniform1f(up.uT, s.t); gl.uniform1f(up.uVento, s.vento || 0);
    gl.uniform1f(up.uScala, Math.max(foro.h / 1000, .3));
    const quanti = (foro.w / foro.h) / .4, luce = (s.luce || 0) * (1 - (s.buio || 0)), nf = s.notteFinta || 0, cn = s.colNebbia || [.7, .7, .7];
    const strati = (lista, tipo, dens, colore, alfa) => lista.forEach((L, i) => {
      let n = Math.min(SEMI, Math.round(L.n * quanti * (s.qualita || !L.fine ? 1 : .5)));
      if (n < 1) return;
      gl.uniform1f(up.uTipo, tipo); gl.uniform1f(up.uSale, i + 1 + tipo * 7);
      gl.uniform1f(up.uDens, dens * (L.dens || 1));
      gl.uniform4f(up.uStrato, L.lungh || L.raggio, L.largh || 0, L.vel, 0);
      gl.uniform1f(up.uMorb, L.morb || 0); gl.uniform1f(up.uAlfa, L.alfa * alfa);
      gl.uniform3fv(up.uColore, colore);
      this.ist.disegna(n);
    });
    if ((s.pioggia || 0) > .01){
      const g = [0, 1, 2].map(j => ([.66, .7, .76][j] * .55 + (cn[j] * 1.1 + .08) * .45) * (1 - nf * .65) * .97 * luce);
      strati(PIOGGIA, 0, s.pioggia, g, 1);
    }
    if ((s.neve || 0) > .01){
      const g = [.94, .96, 1].map(v => v * (1 - nf * .6) * luce);
      strati(NEVE, 1, Math.min(1, s.neve * 1.1), g, .4 + .6 * s.neve);
    }
    this.ist.div(1, 0); gl.disableVertexAttribArray(1);
    gl.disable(gl.BLEND);
  }
}

/* dove finisce il cielo, dall'alto (0..1), letto dalla mappa di profondità: per ogni colonna fin dove scende
   il cielo (quasi nero nella mappa), poi un valore alto fra le colonne (il cielo arriva lì quasi ovunque) */
function orizzonte(dimg){
  const W = 48, H = Math.max(8, Math.round(W * dimg.naturalHeight / dimg.naturalWidth));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(dimg, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, fondo = [];
  for (let i = 0; i < W; i++){ let y = 0; while (y < H && d[(y * W + i) * 4] < 10) y++; fondo.push(y / H); }
  fondo.sort((a, b) => a - b);
  return fondo[Math.floor(W * .85)] || 0;
}
function caricaImg(url){
  return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => ok(im); im.onerror = () => no(new Error('immagine non caricata: ' + url)); im.src = url; });
}
/* è arrivato un fotogramma nuovo da quando l'ho chiesto l'ultima volta? (con requestVideoFrameCallback
   lo dice il lettore; senza, si guarda se il tempo del video è cambiato) */
function nuovoFotogramma(v){
  if ('requestVideoFrameCallback' in v){
    if (!v._ascolto){ v._ascolto = performance.now(); v._nuovo = true;
      const giro = () => { v._nuovo = true; v._ascolto = performance.now(); v.requestVideoFrameCallback(giro); }; v.requestVideoFrameCallback(giro); }
    /* se il lettore non avvisa (video fuori pagina su qualche browser), si carica sempre come prima */
    if (!v.paused && performance.now() - v._ascolto > 300) return true;
    const n = v._nuovo; v._nuovo = false; return n;
  }
  const t = v.currentTime; if (t === v._ultimo) return false; v._ultimo = t; return true;
}
/* ⚠ 30/10: le animazioni cucite hanno sostituito i video dell'AI con lo stesso nome, e i browser tenevano
   il vecchio in memoria (fino a un'ora). Il segno qui sotto lo fa riscaricare; la libreria aggiunge anche la data del file. */
const VERSIONE_VIDEO = 'c2';
function apriVideo(url){
  url += (url.includes('?') ? '&' : '?') + VERSIONE_VIDEO;
  const fai = () => { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true;
    v.preload = 'auto'; v.src = url; return v; };
  const a = fai(), b = fai();
  return new Promise((ok, no) => {
    a.oncanplay = () => { a.oncanplay = null; a.play().then(() => ok([a, b])).catch(no); };
    a.onerror = () => no(new Error('video non caricato'));
    setTimeout(() => no(new Error('video lento')), 20000);
  });
}
