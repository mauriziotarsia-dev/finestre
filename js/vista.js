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
uniform sampler2D uRap0;      /* 8/11 · «risparmio»: video del giorno ricolorato per un'altra luce (rapporto luce/giorno, /4) */
uniform float uHaRap0;
uniform float uMix;          /* 0 = immagine 0, 1 = immagine 1 (dissolvenza) */
uniform float uHaImg, uHaDep0, uHaDep1, uMovimento0, uMovimento1;
uniform float uLato, uT, uAspetto;
uniform vec3 uOcchio;         /* dov'è chi guarda: x a destra-sinistra (-1..1), z vicinanza (-1 lontano .. 1 vicino) */   /* aspetto = larghezza/altezza della vista */
uniform vec2 uPix;           /* dimensione del foro in pixel */
uniform float uCoperto, uNebbia, uPioggia, uNeve, uTempesta, uVento;
uniform float uTV;            /* 9/11: la strada fatta col vento (somma di vento × tempo), al posto di uT × uVento */
uniform float uLampo, uLampoX, uLampoS, uLampoB;   /* S: seme della forma del fulmine, B: 1 se il fulmine si vede */
uniform float uNotteFinta, uLuce, uBuio, uQualita;
uniform vec3 uColNebbia;
uniform vec2 uSale;           /* 9/11 · nebbia che sale: x = fin dove è arrivata (0 in basso, 1 in alto), y = quanta */
uniform sampler2D uMeteo;     /* nebbia e nuvole, calcolate a bassa risoluzione (r: banchi di nebbia, g: nuvole, b: velo) */
uniform sampler2D uVentoT;    /* il vento sugli alberi, calcolato a un quarto di risoluzione (r, g: spostamento, b: raffica sugli alberi, a: ombra delle nuvole) */
uniform vec4 uU[24];          /* gli uccelli (js/uccelli.js): per ognuno (x, y, grandezza, ali) (inclinazione, chiarezza, tipo, -) */
uniform float uNU;            /* quanti uccelli */
uniform vec4 uUBox;           /* dove sono, tutti insieme (x0, y0, x1, y1 nella vista): fuori da lì non si calcola niente */
uniform float uNotte;         /* 0 giorno … 1 notte (stelle, fuochi che tremolano) */
uniform float uOmbre;         /* quanto si vedono le ombre delle nuvole (giorno sereno) */
uniform vec4 uMeteora;        /* stella cadente: da (x, y) a (z, w), nella vista */
uniform float uMeteoraK;      /* a che punto è (0 = nessuna) */
uniform float uHaVento;   /* (il passaggio a bassa risoluzione scrive dal basso: si legge capovolto) */
uniform vec4 uFumo[6];        /* fumo dai comignoli: (x, y nella vista, larghezza del tetto in larghezze della vista, profondità) */
uniform float uNFumo, uFumoA; /* quanti, e quanto si vedono (sfumano col paesaggio) */
uniform float uNebV;          /* la nebbiolina viva (0 spenta) */

/* hash senza seno: sulle schede dei Raspberry il seno costa caro */
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * rumore(p); p = p * 2.03 + 17.1; a *= .5; } return v / .9375; }

/* ⚠ 5/11 · rumore periodico (ogni 256): l'hash perde qualità con numeri grandi e, con la nebbiolina che scorre da
   un'ora, sul primo piano comparivano venature a strisce. Qui l'hash vede sempre numeri piccoli e lo scorrere del
   tempo si avvolge ogni 256 senza salti (le ottave raddoppiano esatte) */
float rumoreP(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); vec2 a = mod(i, 256.), b = mod(i + 1., 256.);
  return mix(mix(h1(a), h1(vec2(b.x, a.y)), f.x), mix(h1(vec2(a.x, b.y)), h1(b), f.x), f.y); }
float fbmP(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * rumoreP(p); p = p * 2. + 17.; a *= .5; } return v / .9375; }
float fbmP2(vec2 p){ return (rumoreP(p) * .667 + rumoreP(p * 2. + 17.) * .333); }   /* morbido: per i filamenti (con 4 ottave facevano fiocchi) */
float tP(float x){ return mod(x, 256.); }
/* ⚠ 9/11 · LA RAFFICA (Maurizio: «la raffica non funziona così … sembra solo che stai velocizzando il tempo»).
   Prima era il vento di tutto il paesaggio alzato di colpo per 11 s: nebbia, nuvole e alberi andavano più svelti
   tutti insieme, come un video accelerato (e il suono dura 4 s). Una raffica vera è un fronte d'aria che arriva da
   sopravvento e attraversa il paesaggio: dove passa le chiome si piegano di colpo sottovento, le foglie degli ulivi
   si girano e luccicano, la nebbia viene spinta e strappata, il fumo si sdraia; poi le piante tornano su
   oscillando. Le nuvole, in alto, non se ne accorgono. Qui: il fronte (frastagliato, a celle più o meno forti)
   entra dal lato sopravvento a 0,55 s dal suono e attraversa la finestra in circa 2 s, mentre il suono è al massimo;
   in ogni punto sale in 0,45 s, tiene 0,75 s e cala in ~1,5 s. uRaf: x = secondi dalla raffica (<0: nessuna),
   y = seme, z = forza */
uniform vec3 uRaf;
float rafTau(vec2 q){
  float frast = (rumore(vec2(q.y * 3.1 + uRaf.y, uRaf.y * 1.7)) - .5) * .22;
  return uRaf.x - .55 - (1.25 - q.x + frast) / .72;          /* secondi da quando il fronte è arrivato qui: entra da destra (sopravvento) */
}
float rafCella(vec2 q){ return .5 + .5 * rumore(vec2(q.x * 2.6 + uRaf.y * 3.3, q.y * 1.8 - uRaf.y)); }
float rafEnv(float t){ return t <= 0. ? 0. : smoothstep(0., .45, t) * (t < 1.2 ? 1. : exp(-(t - 1.2) / .7)); }
/* quanta strada ha fatto l'aria qui (integrale dell'inviluppo): sposta la nebbia sottovento senza farla tornare indietro */
float rafStrada(float t){
  if (t <= 0.) return 0.;
  float u = min(t, .45) / .45, a = .45 * (u * u * u - .5 * u * u * u * u);
  if (t > .45) a += min(t, 1.2) - .45;
  if (t > 1.2) a += .7 * (1. - exp(-(t - 1.2) / .7));
  return a;
}


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
/* ⚠ 5/11 · lettura a un livello fisso della mipmap (sfocata): dentro gli «if» la scheda non sa che livello usare e,
   sul G10, sceglieva a caso per gruppi di 4 pixel: puntini scuri ai bordi della foschia (Maurizio: «strani puntini») */
/* (5/11: con textureLod il processo grafico del Raspberry si chiudeva all'avvio: si usa la lettura con «bias», sempre
   fuori dagli «if» che cambiano da pixel a pixel) */
vec3 fotoL(sampler2D t, vec4 crop, vec2 uv, float lod){ return texture2D(t, clamp(crop.xy + uv * crop.zw, .0005, .9995), lod).rgb; }
float profG(sampler2D d, vec4 crop, vec2 uv, float ha, vec2 gx, vec2 gy){
  if (ha < .5) return pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
#if __VERSION__ >= 300
  return textureGrad(d, clamp(crop.xy + uv * crop.zw, .0005, .9995), gx, gy).r;
#else
  return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).r;
#endif
}

/* fogliame: verde o verde-grigio (ulivi), anche scuro (cipressi); non la pietra (rossiccia), non la nebbia (azzurrina, chiara) */
float fogliame(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, .01), l = dot(c, vec3(.299, .587, .114));
  return smoothstep(.88, .97, c.g / max(c.r, .01)) * smoothstep(.95, 1.05, c.g / max(c.b, .01)) * smoothstep(.06, .12, sat) * smoothstep(.8, .6, l);
}

/* un'immagine del paesaggio, già col suo movimento */
vec3 paesaggio(sampler2D img, sampler2D imgB, float vk, sampler2D dep, vec4 crop, vec4 cropD, float haDep, float mov, sampler2D cie, vec4 cm, sampler2D fer, float haF, sampler2D rap, float haR, vec2 uv, out float n, out float sky){
  n = prof(dep, cropD, uv, haDep);
  /* prospettiva: le cose vicine si spostano di più fra una finestra e l'altra */
  vec2 p = uv; p.x += uLato * .012 * (n - .35);
  /* prospettiva viva: chi si sposta a destra vede più paesaggio a sinistra (il lontano scorre con lui, il vicino meno);
     chi si avvicina alla finestra vede un po' più di paesaggio */
  p.x += uOcchio.x * .065 * (1. - .7 * n);
  p = .5 + (p - .5) * (1. + uOcchio.z * .07);
  vec3 c = foto(img, crop, p);
  /* ⚠ 5/11 · il passaggio al giro del video sfuma SOLO il video (prima si sfumava verso un secondo paesaggio disegnato
     senza vento e senza nebbiolina: a ogni giro i cipressi tornavano dritti e i veli sparivano, «si vede il loop») */
  if (vk > .001) c = mix(c, foto(imgB, crop, p), vk);
  sky = cielo(c, haDep > .5 ? fotoL(dep, cropD, p, 2.).r : n, p.y, haDep);   /* ⚠ 5/11: profondità un po' sfocata: quella nitida è granulosa vicino all'orizzonte e il cielo che scorre ci lasciava puntini (G10) */
  /* video non ancora cucito: fermo dappertutto, video solo dove si muove davvero e solo dove è chiaro e poco
     colorato (nebbia, fumo, acqua che luccica: i cipressi scuri dentro un banco di nebbia restano fermi);
     il cielo dal video, se non c'è il panorama */
  float vivoV = 0.;   /* quanto di questo punto viene dal video (con il fermo): serve alla nebbiolina */
  if (haF > .5){
    vec4 fb = texture2D(fer, clamp(crop.xy + p * crop.zw, .0005, .9995));
    float mx = max(fb.r, max(fb.g, fb.b)), mn = min(fb.r, min(fb.g, fb.b));
    float chiaro = smoothstep(.38, .6, mx) * (1. - smoothstep(.2, .42, (mx - mn) / max(mx, .01)));
    /* ⚠ 5/11 (Maurizio: «si vede ancora il giro sullo sfondo, nella zona con la foschia»): la foschia lontana del video
       va da una parte per 7 secondi e poi torna indietro, e nessun passaggio lo nasconde. Lontano (profondità sotto
       ~0,2) si tiene il dipinto fermo: la foschia la muove la nebbiolina viva, che non ha giro. Il video resta per
       l'acqua e la nebbia vicine. */
    float vivo = max(fb.a * chiaro * smoothstep(.3, .45, n), cm.x > 0. || haR > .5 ? 0. : sky);   /* 5/11: misurato, i salti del giro stanno fra 0,04 e 0,23 di profondità */
    /* ⚠ 8/11 · «RISPARMIO»: alba, tramonto e notte senza un video loro usano quello del giorno. Il fermo porta già i colori
       di quella luce; il video (giorno) si ricolora col rapporto luce/giorno, sfocato, punto per punto. Il cielo resta il dipinto */
    if (haR > .5) c *= texture2D(rap, clamp(crop.xy + p * crop.zw, .0005, .9995)).rgb * 4.;
    c = mix(fb.rgb, c, vivo);
    vivoV = vivo;
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
      vec2 dir = vec2(-.012 - .02 * uVento, .0015);   /* 9/11: verso sinistra, come tutto il resto */
      vec2 pa = p - dir * (f1 - .5), pb = p - dir * (f2 - .5);
      vec3 a = haR > .5 ? fotoG(fer, crop, pa, gx, gy) : fotoG(img, crop, pa, gx, gy), b = haR > .5 ? fotoG(fer, crop, pb, gx, gy) : fotoG(img, crop, pb, gx, gy);   /* ricolorato: le nuvole sono quelle dipinte di questa luce (nel fermo), non quelle del video */
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
    /* 4/11 (Maurizio: «non vedo il movimento degli alberi nel paesaggio TV»): sul TV gli alberi sono quasi tutti a
       media distanza; prima si muovevano solo i vicinissimi. Ora anche quelli a metà strada, un po' di più */
    float vicino = smoothstep(.05, .32, n);
    vec4 vt = uHaVento > .5 ? texture2D(uVentoT, vec2(vUv.x, 1. - vUv.y)) : vec4(.5, .5, 0., 0.);
    if (vicino > .01 && vt.b > .01){
      /* ⚠ 8/11 (Maurizio: «di notte gli alberi sono immobili»): di notte il verde non c'è più, è tutto blu scuro e
         fogliame() non trovava niente. Dove sono le chiome lo sa già il vento (vt.b, dalla maschera fatta sull'immagine
         del giorno): di notte lì si muove quello che è scuro */
      float notteA = smoothstep(.5, 1., uNotte);
      float verde = mix(fogliame(c), smoothstep(.4, .12, dot(c, vec3(.299, .587, .114))), notteA) * vicino;   /* anche gli ulivi grigio-verdi e i cipressi scuri; non la pietra, non la nebbia */
      /* ⚠ 30/10: il vento (raffiche e rami) arriva già calcolato a un quarto di risoluzione: sul Raspberry
         calcolarlo per ogni pixel costava un terzo delle immagini al secondo */
      /* quanto si muovono (pixel su un foro alto 1000). Due parti, alla stessa velocità con ogni vento:
         · l'ondeggiare intorno alla posizione: 2-5 px nella calma, fino a 4-11 col vento forte;
         · la spinta sottovento (verso dove vanno le nuvole): niente nella calma, fino a 10-24 px col vento forte,
           più forte quando passa una raffica e meno fra una e l'altra: le chiome si piegano e tornano */
      float amp = (7.5 + 12.5 * n) * vt.b;   /* 5/11: un po' di più, due volte (Maurizio: «di poco in più», «leggermente più visibile ancora») */
      vec2 osc = vec2((vt.r - .5) * 2.2, (vt.g - .5) * .8) * amp * (.45 + uVento * .55);
      float spinta = amp * uVento * uVento * 2.;
      float luccica = 0.;
      if (uRaf.x >= 0.){
        float rt = rafTau(uv), rc = rafCella(uv) * uRaf.z, rg = rafEnv(rt) * rc;
        /* il fronte piega le chiome sottovento, più forte dell'ondeggiare; quando passa tornano su oscillando */
        float torna = rt > 1.2 ? sin((rt - 1.2) * 6.5) * exp(-(rt - 1.2) * 1.4) * .32 * rc : 0.;
        spinta += amp * .75 * (rg - torna);   /* di più strappava le sagome (cipressi bucati, contorni doppi) */
        osc *= 1. + rg * .6;
        luccica = rg;
      }
      vec2 d = (osc + vec2(spinta, spinta * .12)) * (uPix.y / 1000.) / uPix;
      vec3 mosso = haF > .5 ? fotoG(fer, crop, p + d, gx, gy) : fotoG(img, crop, p + d, gx, gy);
      /* la chioma si sposta davvero, anche oltre il suo contorno: dove adesso c'è un ramo spostato lo si disegna
         (anche contro il cielo); dove la chioma se n'è andata si vede quello che c'era accanto, ma mai il cielo
         dipinto al posto del cielo che scorre */
      float verdeS = mix(fogliame(mosso), smoothstep(.4, .12, dot(mosso, vec3(.299, .587, .114))), notteA);
      float nS = profG(dep, cropD, p + d, haDep, gx, gy), cieloS = haDep > .5 ? smoothstep(.022, .004, nS) * smoothstep(.85, .45, p.y + d.y) : sky;
      float w = max(verdeS * smoothstep(.1, .4, nS), verde * (1. - cieloS));
      c = mix(c, mosso, w);
      /* le foglie (ulivi) si rovesciano e mostrano il rovescio chiaro: un luccichio fitto che passa col fronte */
      if (luccica > .02){ float fl = rumore(uv * uPix / (4.5 * max(1., uPix.y / 1000.)) + vec2(uT * 9., uT * 2.)); c = mix(c, c * 1.18 + vec3(.04, .045, .035), luccica * w * smoothstep(.5, .8, fl) * .7); }
    }
    /* ⚠ 5/11 · NEBBIOLINA VIVA (Maurizio: «nell'abbazia c'è poco movimento della nebbiolina, quasi non si muove più»).
       I video cuciti prendono dal video solo quello che si muove davvero, e nel video dell'AI la nebbia lontana si
       muove appena: restava ferma. Ora la muove la pagina, mai in loop: la nebbia dipinta (chiara, grigia, poco
       colorata, sotto l'orizzonte, da metà distanza in là) scivola piano e cambia forma, e veli più chiari la
       attraversano. Con la calma respira appena; col vento scorre di più verso dove vanno le nuvole (più strada,
       non più agitata). Vale per tutte le luci e per tutti i paesaggi, anche senza video. */
    /* ⚠ 5/11: si decide dov'è la nebbia guardando l'immagine sfocata (livello ridotto della mipmap): sui prati e sui
       cespugli grigi l'immagine nitida dava una maschera a puntini, e i veli diventavano granelli che sfarfallavano */
    vec3 cbm = haF > .5 ? fotoL(fer, crop, p, 2.) : fotoL(img, crop, p, 2.);
    float nB = haDep > .5 ? fotoL(dep, cropD, p, 1.).r : n;   /* anche la profondità sfocata: quella nitida è granulosa e la soglia saltava da un pixel all'altro */
    float lm = dot(cbm, vec3(.299, .587, .114)), mxm = max(cbm.r, max(cbm.g, cbm.b));
    float satm = (mxm - min(cbm.r, min(cbm.g, cbm.b))) / max(mxm, .01), sogliaM = mix(.4, .1, uNotte) - mix(.2, .06, uNotte) * smoothstep(.05, .3, nB);   /* 8/11: di notte la nebbia è grigio-blu scura (~0,1–0,2) */   /* 5/11: la nebbia vicina, in ombra, è più scura (grigio-azzurro ~0,35): prima restava fuori */
    /* la nebbia è azzurrina o grigia (blu almeno quanto il rosso): la pietra chiara del castello, calda, resta ferma */
    float neb = smoothstep(sogliaM - .06, sogliaM + .22, lm) * (1. - smoothstep(.1, .34, satm)) * smoothstep(-.05, .03, cbm.b - cbm.r) * (1. - smoothstep(.75, .95, nB)) * (1. - (haDep > .5 ? smoothstep(.03, .006, nB) * smoothstep(.85, .45, p.y) : sky)) * uNebV;   /* cielo anche lui dalla profondità sfocata: sulle colline lontane quella nitida faceva fiocchi */   /* 5/11: anche la nebbia in primo piano (Maurizio: «sotto l'abbazia sembra immobile») */
    neb = min(1., neb * 1.5);   /* 5/11 (Maurizio: «le nebbioline mi sembrano ferme davanti e dietro»): più decisa */
    /* ⚠ 5/11: la maschera sfocata «sborda» di qualche pixel sugli oggetti scuri e caldi (cipressi, alberi, pietra) e i
       veli facevano un alone intorno alle sagome: si spegne dove il pixel nitido è scuro o caldo */
    float lS = dot(c, vec3(.299, .587, .114));
    neb *= smoothstep(mix(.1, .035, uNotte), mix(.26, .1, uNotte), lS) * smoothstep(-.09, -.01, c.b - c.r);   /* 8/11: di notte le soglie scendono, se no la nebbia notturna (tutta sotto 0,1) spariva (Maurizio: «di notte non c'è un po' di nebbiolina») */
    if (neb > .01){
      vec2 ti = cropD.xy + p * cropD.zw;   /* coordinate dell'immagine intera: la nebbia non dipende dal taglio */
      /* ⚠ 9/11: tutto quello che il vento muove va dalla stessa parte, verso sinistra come il cielo che scorre, gli
         alberi, il fumo e i banchi di nebbia. Andavano a destra la nebbiolina, gli sfilacci dei banchi, la pioggia,
         la neve e le nuvole dipinte (senza cielo che scorre): due venti opposti nella stessa finestra */
      float rgM = 0., rsM = 0.;
      if (uRaf.x >= 0.){ float rt = rafTau(uv), rc = rafCella(uv) * uRaf.z; rgM = rafEnv(rt) * rc; rsM = rafStrada(rt) * rc; }
      float tva = uT * .05 + uTV * .06 + rsM * .3;   /* 9/11: era uT * (.05 + .06 × vento): vedi uTV */   /* ⚠ 5/11: una velocità sola per tutti i punti: moltiplicare il tempo per un valore diverso punto per punto, dopo qualche minuto, dava righe e puntini (G10) */      /* quanto scorre la trama (sue unità al secondo): un banco attraversa sé stesso in 12-25 s (5/11: più viva) */
      /* 5/11 (Maurizio: «quella sotto è ancora poco viva»): la nebbia vicina scorre più svelta (come dal vero: più è
         vicina, più strada fa sullo schermo) e ha banchi più grandi e più contrastati */
      float vicinaM = smoothstep(.1, .35, nB);
      float f2 = fbmP(vec2(ti.x * mix(2.4, 1.6, vicinaM) * 1.7 + tP(tva * 1.7) + 5.2, ti.y * mix(10., 6., vicinaM) * 1.7 + 1.3 - tP(uT * .055)));
      /* ⚠ 5/11 (Maurizio: «è fake e va intorno alle sagome degli oggetti»): niente più spostamento dell'immagine dentro la
         nebbia: spostava anche i bordi di alberi e cipressi e lasciava sagome doppie ondeggianti. La nebbia si muove
         con i veli e i filamenti che passano sopra */
      /* veli: banchi più chiari, lunghi e bassi, che passano e si disfano */
      float velo = fbmP(vec2(ti.x * mix(3.3, 2.2, vicinaM) + tP(tva * 1.6), ti.y * mix(15., 8., vicinaM) + tP(uT * .08))) * .65 + f2 * .35;
      float wv = smoothstep(.38, .7, velo);
      vec3 bianco = vec3(lm) * vec3(.97, .99, 1.03) * mix(1.3, 1.55, uNotte) + .06 * (1. - uNotte) + vec3(.008, .012, .02) * uNotte;   /* dal colore sfocato di qui (non da quello spostato: faceva venature) */
      c = mix(c, bianco, neb * wv * mix(.85, 1., vicinaM) * (1. - .45 * rgM));   /* raffica: i veli si strappano */
      c *= 1. - neb * (1. - wv) * (.22 + .12 * vicinaM);   /* fra un velo e l'altro la nebbia si dirada un poco: respira */
      /* filamenti: veli sottili e più svelti che attraversano i banchi (si vede che la nebbia scorre) */
      float fil = fbmP2(vec2(ti.x * mix(5.5, 3.5, vicinaM) + tP(tva * 2.6), ti.y * mix(24., 13., vicinaM) - tP(uT * .03)));
      c = mix(c, bianco, neb * smoothstep(.5, .85, fil) * (.4 + .35 * rgM));   /* raffica: i filamenti frustano */
    }
  }
  return c;
}

float segmento(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
/* ⚠ 30/10 · UCCELLI (Maurizio: «migliora il movimento ed il volo degli uccelli, troppo fake»). Il volo lo
   simula js/uccelli.js (stormo vero, battiti e planate, virate, il rapace nella corrente calda); qui si disegnano
   e basta, solo vicino a ciascuno. Ali curve (spalla, gomito, punta) che si assottigliano; il rapace ha ali lunghe
   e piatte. Solo nel cielo: passano dietro torri e monti. */
float ala(vec2 q, float s, float su, float giu){
  vec2 g = vec2(s * .45, -s * su), p = vec2(s, -s * giu);
  float d1 = segmento(q, vec2(0.), g), d2 = segmento(q, g, p);
  float t = clamp(q.x / s, 0., 1.);
  return min(d1, d2) - (1. - t) * .35;
}
float uccello(vec2 q, float s, float ali, float rapace, float sc){
  q.x = abs(q.x);
  float su = rapace > .5 ? .1 + .12 * ali : .3 + .24 * ali, giu = rapace > .5 ? .04 + .3 * ali : .1 + .6 * ali;
  float d = ala(q, s, su, giu);
  d = min(d, length(q * vec2(1., rapace > .5 ? 1.2 : 1.6)) - (rapace > .5 ? .7 : .45) * sc);
  return 1. - smoothstep(.35 * sc, .35 * sc + .9, d);
}
float uccelli(vec2 uv){
  float a = 0., sc = uPix.y / 1000.;
  for (int i = 0; i < 12; i++){
    if (float(i) >= uNU) break;
    vec4 b = uU[i * 2], c = uU[i * 2 + 1];
    vec2 d = (uv - b.xy) * uPix;
    float s = (c.z > .5 ? 3.4 : 2.9) * b.z * sc;
    if (abs(d.x) > s * 2.6 || abs(d.y) > s * 2.2) continue;
    float cb = cos(c.x), sb = sin(c.x);
    vec2 q = vec2(d.x * cb - d.y * sb, d.x * sb + d.y * cb);
    a = max(a, uccello(q, s, b.w, c.z, sc) * c.y);
  }
  return a;
}

/* ⚠ 4/11 · FUMO DAI COMIGNOLI (Maurizio: «va messo quando possibile, dà un senso di movimento e non di staticità»).
   Dove salirebbe il fumo lo dice l'AI una volta sola (…_comignoli.json); qui si disegna dal vivo, mai in loop: un
   pennacchio sottile che sale, si allarga e svanisce, mosso da vortici che salgono con lui. Con la calma sale quasi
   dritto, col vento si piega sottovento (verso dove vanno le nuvole) già poco sopra il comignolo: si piega di più,
   non va più veloce. Si calcola solo vicino a ciascun comignolo. */
float fumo(vec2 uv){
  float tot = 0.;
  float k = 1. + uOcchio.z * .07;
  for (int i = 0; i < 6; i++){
    if (float(i) >= uNFumo) break;
    vec4 F = uFumo[i];
    /* dove appare il comignolo con la prospettiva (lo stesso spostamento del paesaggio a quella profondità) */
    vec2 s = F.xy; float sh = uLato * .012 * (F.w - .35) + uOcchio.x * .065 * (1. - .7 * F.w);
    s = (s - .5) / k + .5; s.x -= sh;
    float u = max(1.3 * max(1., uPix.y / 1000.), F.z * uPix.x * .09);   /* una «canna»: circa un decimo del tetto, in pixel */
    vec2 dq = (uv - s) * uPix / u;
    float h = -dq.y, L = 34.;
    if (h < -1.5 || h > L || abs(dq.x) > L * 1.3) continue;
    float semi = h1(vec2(float(i) * 7.3, F.x * 91.));
    float rgF = uRaf.x >= 0. ? rafEnv(rafTau(s)) * rafCella(s) * uRaf.z : 0.;
    float b = .18 + uVento * 1.25;                                    /* quanto si piega */
    float cx = -b * h * h / L - (rumore(vec2(h * .07 - uT * .3, semi * 40.)) - .5) * h * .35 - rgF * h * 1.1;   /* raffica: il pennacchio si sdraia di traverso (piegato a parabola faceva archi) */
    float wd = .6 + h * .21 * (1. + uVento * .6 + rgF * .7);
    float x = (dq.x - cx) / wd;
    float pr = exp(-x * x * 1.8);
    if (pr < .01) continue;
    vec2 q = vec2(x * .9, h * .2 - uT * .85) + semi * 17.;
    float nn = rumore(q) * .55 + rumore(q * 2.1 + 3.7) * .3 + rumore(q * 4.3 + 9.1) * .15;
    float d = pr * smoothstep(.3, .72, nn + pr * .25) * smoothstep(-1.5, 1.2, h) * (1. - smoothstep(L * .35, L, h)) * (1. - h / L * .45) * (1. - rgF * smoothstep(3., 15., h) * .85);   /* e si strappa: resta solo vicino al comignolo */
    tot = max(tot, d);
  }
  return tot * uFumoA;
}

void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec3 col = vec3(0.); float n = .5, sky = 0., alfa = 1.;
  float l0 = 0.; vec3 stelle = vec3(0.);
  if (uHaImg > .5){
    float n0, s0; vec3 c0 = paesaggio(uImg0, uImg0b, uVmix, uDep0, uCrop0, uCropD0, uHaDep0, uMovimento0, uCielo0, uCieloM0, uFermo0, uHaFermo0, uRap0, uHaRap0, uv, n0, s0);
    if (uMix > .001){
      float n1, s1; vec3 c1 = paesaggio(uImg1, uImg1, 0., uDep1, uCrop1, uCropD1, uHaDep1, uMovimento1, uCielo1, uCieloM1, uFermo1, uHaFermo1, uRap0, 0., uv, n1, s1);
      col = mix(c0, c1, uMix); n = mix(n0, n1, uMix); sky = mix(s0, s1, uMix);
    } else { col = c0; n = n0; sky = s0; }
    float scP = max(1., uPix.y / 1000.);
    stelle = vec3(0.);
    /* ombre delle nuvole: di giorno scorrono sul paesaggio insieme al cielo panoramico (calcolate col vento) */
    if (uOmbre > .01 && uHaVento > .5){ float om = texture2D(uVentoT, vec2(vUv.x, 1. - vUv.y)).a; col *= 1. - om * .17 * uOmbre * (1. - sky); }
    /* fuochi, lanterne e finestre accese tremolano come fiamme, di notte e un po' al tramonto */
    if (uNotte > .5){
      float caldo = smoothstep(.33, .6, col.r) * smoothstep(1.12, 1.4, col.r / max(col.g, .01)) * smoothstep(1.15, 1.6, col.g / max(col.b, .01)) * (1. - sky);
      if (caldo > .01){
        vec2 cel = floor(uv * uPix / (14. * scP));
        float hz = 5. + 5. * h1(cel), fl = rumore(vec2(uT * hz, h1(cel) * 97.)) * .65 + rumore(vec2(uT * hz * 2.3, h1(cel + 1.) * 53.)) * .35;
        col *= mix(1., .7 + .55 * fl, caldo * smoothstep(.5, 1., uNotte));   /* solo di notte: all'alba e al tramonto tutto è caldo */
      }
    }
    /* uccelli (js/uccelli.js) */
    if (uUccelli > .01 && uNU > .5 && sky > .2 && uv.x > uUBox.x && uv.y > uUBox.y && uv.x < uUBox.z && uv.y < uUBox.w){ float b = uccelli(uv) * uUccelli * smoothstep(.2, .7, sky); col = mix(col, col * .3 + vec3(.035, .035, .045), b * .8); }
    if (uNFumo > .5 && uFumoA > .01){
      float fm = fumo(uv) * (1. - uPioggia * .6) * (1. - uTempesta * .3);
      if (fm > .001){
        vec3 cf = mix(vec3(.8, .81, .84), vec3(.24, .26, .32), smoothstep(.2, .9, uNotte)) * (1. - uCoperto * .18);   /* 8/11: di notte un po' più chiaro (luna), se no sul buio non si vedeva (Maurizio: «di notte non c'è fumo») */
        col = mix(col, cf, fm * .5);
      }
    }
    /* stelle che brillano (ognuna col suo ritmo) e, ogni tanto, una stella cadente */
    if (uNotte > .01 && sky > .3){
      vec2 pp = uv * uPix / (7. * scP), cel = floor(pp), f = fract(pp);
      float h = h1(cel);
      if (h > .972){
        vec2 pos = vec2(h1(cel + 3.1), h1(cel + 7.7)) * .7 + .15;
        float r = length(f - pos) * 7.;
        float lum = .3 + .7 * h1(cel + 11.);
        float scint = .55 + .45 * sin(uT * (1.2 + 2.8 * h1(cel + 5.)) + h * 40.) * (.65 + .35 * sin(uT * .31 + h * 13.));
        stelle += vec3(.86, .9, 1.) * exp(-r * r * 1.7) * lum * scint * uNotte * (1. - uCoperto) * smoothstep(.3, .8, sky);
      }
    }
    if (uMeteoraK > 0. && sky > .3){
      vec2 A = uMeteora.xy * uPix, B = uMeteora.zw * uPix, P = uv * uPix;
      vec2 testa = mix(A, B, uMeteoraK), coda = mix(A, B, max(0., uMeteoraK - .3));
      float dd = segmento(P, coda, testa), lungo = clamp(dot(P - coda, testa - coda) / max(1., dot(testa - coda, testa - coda)), 0., 1.);
      stelle += vec3(.95, .97, 1.) * exp(-dd * dd / (.5 * scP * scP + .25)) * lungo * lungo * sin(3.14159 * uMeteoraK) * 1.6 * smoothstep(.3, .8, sky) * uNotte * (1. - uCoperto * .7);   /* 9/11: dietro le nuvole si vede appena */
    }
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
    /* ⚠ 9/11 (prove con Maurizio assente): con la nebbia allo 0,85 di sempre tutto quello che stava oltre metà
       profondità spariva del tutto (l'abbazia, il soggetto, non si vedeva più), mentre la collina più vicina spuntava
       dai buchi fra i banchi a sfilacci scuri che sembravano fumo nero. Ora la nebbia cresce più piano con la
       distanza e i banchi sono meno netti: il soggetto resta una sagoma, i buchi non sono più neri.
       L'intensità del telefono porta uNebbia da ~0,5 (velo) a 1 (muro: i banchi si chiudono e copre anche il vicino) */
    float pieno = smoothstep(.86, 1., uNebbia);
    float nebbia = uNebbia * (pow(lontano, 1.15) * .9 + .15 + pieno * .35) * mix(.45 + .55 * fm.r, .75 + .25 * fm.r, pieno) * 1.25;
    nebbia += (uPioggia * .32 + uNeve * .3) * pow(lontano, 1.6) * (.8 + .4 * fm.b);   /* la pioggia lontana fa velo, a scrosci */
    nebbia = max(nebbia, pieno * (.62 + .25 * fm.r) * smoothstep(.05, .45, lontano));   /* al 100% copre anche a metà distanza */
    if (uRaf.x >= 0.) nebbia *= 1. - .12 * rafEnv(rafTau(uv)) * uRaf.z * (1. - pieno * .6);   /* appena: dove passa si dirada un poco, uniforme */
    nebbia = clamp(nebbia, 0., mix(.9, .97, pieno));
    col = mix(col, uColNebbia, nebbia);
    alfa = max(alfa, nebbia);
  }
  /* ⚠ 9/11 · NEBBIA CHE SALE (Maurizio: «ho provato nebbia che sale ma non ho capito come funziona»). Prima alzava
     piano (40 s) la nebbia di tutto il paesaggio fino a 0,75: con la nebbia già scelta, che è di più, non faceva
     niente, e col sereno sembrava solo il tempo che cambia. Ora è uno strato denso che sale dal fondo delle valli:
     il bordo in alto, sfilacciato e mosso dal vento, si arrampica sulle colline in ~25 s fin quasi all'abbazia (il
     soggetto ne emerge), resta un minuto e poi ridiscende diradandosi. Vale sopra qualunque tempo */
  if (uSale.y > .001){
    float hq = 1. - uv.y;                                             /* quanto è in alto nella finestra */
    vec2 sq = vec2(uv.x * 3.2 + uTV * .07 + uT * .012, hq * 7. - uT * .05);
    float fs = fbm(sq) , bordo = (fbm(vec2(uv.x * 5.5 + uTV * .11 + uT * .02, uT * .07)) - .5) * .16;
    float strato = smoothstep(uSale.x + .07 + bordo, uSale.x - .1 + bordo, hq);   /* sotto il bordo è piena, sopra niente */
    float sale = uSale.y * strato * (.45 + .55 * smoothstep(.0, .35, lontano)) * (.62 + .38 * fs);
    sale = clamp(sale, 0., .93);
    col = mix(col, uColNebbia * (.96 + .1 * fs), sale);
    alfa = max(alfa, sale);
  }

  /* lampo: le nuvole si accendono da dentro (si vede la loro forma), poi il paesaggio ne prende il riflesso */
  /* ⚠ 4/11 (Maurizio: «coi lampi sopra l'orizzonte si vedono dei puntini»): prima la luce del lampo moltiplicava
     tutto, anche il crinale lontano dove cielo e alberi si mescolano, e ne esaltava la grana. Ora il cielo si
     schiarisce per conto suo (bagliore dentro le nuvole, a velo) e la terra prende solo un riflesso moderato */
  if (uLampo > .001){
    /* ⚠ 5/11 (Maurizio: «rivedi gli effetti dei lampi, poco realistici o peggio di prima»). Come dal vero: un lampo
       vicino accende il cielo da dentro le nuvole (si vede la loro forma, i bordi più chiari) e illumina la terra di
       luce fredda per un istante; a volte si vede il fulmine stesso, frastagliato, con un ramo, che scende dietro
       le colline. I lampi lontani schiariscono solo il cielo, piano. */
    float vicino = exp(-pow((uv.x - uLampoX) * 2.4, 2.)) * smoothstep(.75, .0, uv.y);
    float nub = .55 + .9 * texture2D(uMeteo, vUv).g;
    /* il cielo per il lampo dalla profondità sfocata: il bordo segue il crinale con una sfumatura invece di sgranarsi */
    float cieloL = sky;
    if (uHaDep0 > .5){ float nb = texture2D(uDep0, clamp(uCropD0.xy + uv * uCropD0.zw, .0005, .9995), 2.5).r;
      cieloL = smoothstep(.05, .012, nb) * smoothstep(.85, .45, uv.y); }
    float lp = dot(col, vec3(.299, .587, .114));
    float sagoma = smoothstep(.1, .25, lp);   /* torri, alberi e crinali scuri restano sagome contro il cielo acceso */
    float notteK = 1. + uNotte * .7;          /* di notte il lampo conta di più */
    float terra = uLampo * (.22 + .38 * vicino) * (1. - cieloL) * notteK;
    float bagliore = uLampo * cieloL * nub * (.45 + .75 * vicino) * sagoma * notteK;
    /* la terra: luce fredda che schiarisce quello che c'è (le ombre restano ombre) */
    col = col * (1. + terra * 2.) + vec3(.5, .58, .85) * terra * .1;
    /* il cielo: si accendono le nuvole, di più dove sono più chiare (si vede la loro forma, non un velo piatto) */
    col += vec3(.72, .78, 1.) * bagliore * (.3 + .95 * lp) * .85;
    /* il fulmine: solo nei colpi (non nella coda), solo dove c'è cielo */
    if (uLampoB > .5 && uLampo > .25){
      float ss = uLampoS, w = max(1., uPix.y / 650.);
      float xf = uLampoX + (rumore(vec2(uv.y * 4.5, ss)) - .5) * .17 + (rumore(vec2(uv.y * 17., ss + 7.1)) - .5) * .055 + (rumore(vec2(uv.y * 58., ss + 3.3)) - .5) * .014;
      float dx = (uv.x - xf) * uPix.x;
      float tronco = exp(-dx * dx / (w * w)) + exp(-abs(dx) / (w * 12.)) * .3;
      /* un ramo che si stacca a un terzo dell'altezza e si spegne scendendo */
      float yb = .2 + .18 * h1(vec2(ss, 1.7)), dir = h1(vec2(ss, 4.2)) > .5 ? 1. : -1.;
      float xb0 = uLampoX + (rumore(vec2(yb * 4.5, ss)) - .5) * .17 + (rumore(vec2(yb * 17., ss + 7.1)) - .5) * .055;
      float xr = xb0 + dir * (uv.y - yb) * .55 + (rumore(vec2(uv.y * 40., ss + 9.)) - .5) * .02;
      float dr = (uv.x - xr) * uPix.x, lr = smoothstep(yb, yb + .02, uv.y) * smoothstep(yb + .22, yb + .05, uv.y);
      float ramo = (exp(-dr * dr / (w * w * .5)) * .7 + exp(-abs(dr) / (w * 8.)) * .15) * lr;
      float f = (tronco + ramo) * smoothstep(.25, .6, uLampo) * cieloL * smoothstep(-.02, .06, uv.y);
      col += vec3(.86, .89, 1.) * f * 1.5;
      alfa = max(alfa, clamp(f, 0., 1.));
    }
    alfa = max(alfa, clamp((terra + bagliore) * .8, 0., 1.));
  }

  /* (pioggia e neve sono disegnate dopo, goccia per goccia e fiocco per fiocco: vedi PART_VERT) */

  /* luce dello schermo, buio dei cambi, rumore finissimo contro le fasce */
  col *= uLuce * (1. - uBuio);
  /* stelle e stelle cadenti sono luci: dopo il buio della notte e la luce dello schermo (solo un po' attenuate) */
  col += stelle * (.45 + .55 * sqrt(uLuce)) * (1. - uBuio) * (1. - min(1., uNebbia * 1.1));   /* 9/11: nella nebbia fitta non si vedono le stelle (prima sì: col 100% brillavano sopra il muro) */
  col += (h1(gl_FragCoord.xy + fract(uT) * 97.) - .5) / 255.;
  if (uHaImg > .5) gl_FragColor = vec4(max(col, 0.), 1.);
  else { float a = clamp(alfa, 0., 1.) * (1. - uBuio) + uBuio; gl_FragColor = vec4(max(col, 0.) * (1. - uBuio), a); }
}`;

/* ── nebbia e nuvole a bassa risoluzione ──────────────────────────────────────
   Sono forme morbide: calcolarle su un pixel ogni sedici e poi sfumarle non si vede, e costa
   sedici volte meno. Esce una piccola immagine che il programma principale legge. */
/* ── il vento sugli alberi, a un quarto di risoluzione: raffiche che attraversano il paesaggio come onde,
   rami che si piegano a gruppi, un po' di tremolio più fine ── */
const VENTO_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec4 uMap, uCropD, uCieloM;
uniform float uT, uCieloX, uVento;
uniform sampler2D uAlberi, uCielo;
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec2 ti = clamp(uCropD.xy + uv * uCropD.zw, .001, .999);
  float alberi = texture2D(uAlberi, ti).r;                      /* solo dove ci sono alberi (o vicino) */
  float ombra = 0.;
  /* ⚠ 4/11 · OMBRE DELLE NUVOLE (Maurizio, TV: «strisce luminose verticali che si accendono e spengono … e strisce più
     scure»). Prima l'ombra si leggeva dal cielo dipinto quasi solo in funzione della colonna (la riga cambiava poco):
     ogni nuvola chiara diventava una striscia scura dall'orizzonte in giù, che spariva quando la nuvola passava.
     Ora le ombre sono chiazze sul terreno, in prospettiva (strette e fitte verso l'orizzonte, larghe davanti),
     che scivolano col vento alla velocità del cielo */
  if (uCieloM.x > 0.){
    float g = smoothstep(uCieloM.x, 1., ti.y);                 /* 0 all'orizzonte, 1 in basso */
    float z = 1. / (g + .12);
    vec2 s = vec2((ti.x - .5) * z * 1.8 + uCieloX * 8., z * 1.3 + uCieloX * 1.5);
    float nn = rumore(s) * .62 + rumore(s * 2.3 + vec2(5.3, 1.7)) * .38;
    ombra = smoothstep(.56, .78, nn) * smoothstep(.02, .2, g);
  }
  /* ⚠ 4/11 (Maurizio: «sugli alberi che si muovono è troppo evidente il loop, ogni tot secondi si capisce che
     ricomincia»): le raffiche erano un'onda regolare, una ogni 7,4 secondi esatti, quasi quanto il giro del video
     (7 s). Ora sono fronti di vento irregolari: arrivano a distanze diverse, con forza e forma che cambiano, e non si
     ripetono mai uguali */
  float g1 = rumore(vec2(uv.x * 2.2 - uT * .31, uv.y * .9 + uT * .053));
  float g2 = rumore(vec2(uv.x * 4.3 - uT * .47 + 7.3, uv.y * 1.7 + uT * .089 + 3.1));
  float g3 = rumore(vec2(uT * .021, 1.9));                       /* calme e momenti più ventosi, lenti */
  float onda = (g1 * .62 + g2 * .38) * mix(.75, 1.2, g3);
  /* 4/11 (Maurizio: «anche senza vento gli alberi un poco si devono muovere»; poi: «col vento forte devono piegarsi di
     più, non andare più veloci»): la velocità dell'ondeggiare è sempre la stessa; il vento decide quanto si piegano
     (nel disegno: la spinta sottovento più l'ondeggiare). Anche nella calma piatta resta una brezza leggera */
  float raffica = mix(.5, 1., smoothstep(.42, .8, onda));
  vec2 q = uv * vec2(11., 17.);
  float fx = rumore(q + vec2(uT * .8, 0.)) - .5, fy = rumore(q * 1.3 + vec2(3.7, uT * .65)) - .5;
  fx += (rumore(uv * vec2(34., 52.) + vec2(uT * 2.1, 1.3)) - .5) * (.3 + uVento * .15);   /* foglie */
  gl_FragColor = vec4(clamp(fx * .9 + .5, 0., 1.), clamp(fy * .9 + .5, 0., 1.), raffica * alberi, ombra);
}`;

const METEO_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec4 uMap;
uniform float uT, uTV, uVento;
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }

/* (stessa raffica del disegno principale) 9/11 · LA RAFFICA (Maurizio: «la raffica non funziona così … sembra solo che stai velocizzando il tempo»).
   Prima era il vento di tutto il paesaggio alzato di colpo per 11 s: nebbia, nuvole e alberi andavano più svelti
   tutti insieme, come un video accelerato (e il suono dura 4 s). Una raffica vera è un fronte d'aria che arriva da
   sopravvento e attraversa il paesaggio: dove passa le chiome si piegano di colpo sottovento, le foglie degli ulivi
   si girano e luccicano, la nebbia viene spinta e strappata, il fumo si sdraia; poi le piante tornano su
   oscillando. Le nuvole, in alto, non se ne accorgono. Qui: il fronte (frastagliato, a celle più o meno forti)
   entra dal lato sopravvento a 0,55 s dal suono e attraversa la finestra in circa 2 s, mentre il suono è al massimo;
   in ogni punto sale in 0,45 s, tiene 0,75 s e cala in ~1,5 s. uRaf: x = secondi dalla raffica (<0: nessuna),
   y = seme, z = forza */
uniform vec3 uRaf;
float rafTau(vec2 q){
  float frast = (rumore(vec2(q.y * 3.1 + uRaf.y, uRaf.y * 1.7)) - .5) * .22;
  return uRaf.x - .55 - (1.25 - q.x + frast) / .72;          /* secondi da quando il fronte è arrivato qui: entra da destra (sopravvento) */
}
float rafCella(vec2 q){ return .5 + .5 * rumore(vec2(q.x * 2.6 + uRaf.y * 3.3, q.y * 1.8 - uRaf.y)); }
float rafEnv(float t){ return t <= 0. ? 0. : smoothstep(0., .45, t) * (t < 1.2 ? 1. : exp(-(t - 1.2) / .7)); }
/* quanta strada ha fatto l'aria qui (integrale dell'inviluppo): sposta la nebbia sottovento senza farla tornare indietro */
float rafStrada(float t){
  if (t <= 0.) return 0.;
  float u = min(t, .45) / .45, a = .45 * (u * u * u - .5 * u * u * u * u);
  if (t > .45) a += min(t, 1.2) - .45;
  if (t > 1.2) a += .7 * (1. - exp(-(t - 1.2) / .7));
  return a;
}
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * rumore(p); p = p * 2.03 + 17.1; a *= .5; } return v / .96875; }
void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  float tvv = uT + 1.5 * uTV;   /* 9/11: era uT × (1 + 1,5 × vento) */
  vec2 q = uv * vec2(2., 3.6);
  /* i banchi sono disegnati da un campo che a sua volta è deformato da un altro campo, che si muove
     in un'altra direzione: così non scorrono rigidi ma cambiano forma mentre passano */
  vec2 w = vec2(fbm(q * .7 + vec2(uT * .018, 1.7)), fbm(q * .7 + vec2(4.3, -uT * .014))) - .5;
  float rs = 0., rg = 0.;
  if (uRaf.x >= 0.){ float rt = rafTau(uv), rc = rafCella(uv) * uRaf.z; rs = rafStrada(rt) * rc; rg = rafEnv(rt) * rc; }
  float banchi = fbm(q + w * 1.8 + vec2(tvv * .035 + rs * .55, uT * .006));
  float banchi2 = fbm(uv * vec2(5., 8.) + w + vec2(tvv * .06 + rs * 1.1, uT * .01));   /* 9/11: verso sinistra come i banchi (andavano a destra) */     /* sfilacci più vicini, più veloci */
  float neb = smoothstep(.15, .85, banchi * .9 + banchi2 * .35);   /* (la raffica sposta i banchi: diradarli a chiazze scopriva colline scure, sembravano fumo nero) */
  float nub = fbm(uv * vec2(3., 6.) + vec2((uT + uTV) * .012, 0.));
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
uniform float uRafG, uRafS;   /* raffica al centro della finestra: quanto soffia, quanta strada (9/11) */
uniform float uT, uTV, uVento, uScala, uTipo, uDens, uSale;
uniform vec4 uStrato;         /* pioggia: lunghezza, larghezza, velocità, -  ·  neve: raggio, -, velocità, - */
varying vec2 vQ; varying float vA, vW;
void main(){
  vec4 r = fract(aSeme + uSale * vec4(.1234, .5678, .9012, .3456));
  vec2 c, pos;
  float vis;
  if (uTipo < .5){
    /* pioggia: cade inclinata dal vento; le raffiche (uDens che ondeggia lungo la finestra) la fanno
       più fitta e più rada a ondate */
    float incl = .1 + .25 * uVento + .45 * uRafG;   /* la raffica piega la pioggia */
    float L = uStrato.x * uScala * (.7 + .6 * r.w), W = max(uStrato.y * uScala, .7);
    float est = L / uFori.y;
    float y = fract(r.y + uT * uStrato.z * (.85 + .3 * r.z)) * (1. + 2. * est) - est;
    float x = r.x * (uFori.x + incl * uFori.y) - incl * uFori.y + y * uFori.y * incl;
    c = vec2(uFori.x - x, y * uFori.y);   /* 9/11: cade verso sinistra, col vento (pendeva a destra) */
    float xr = c.x / uFori.y;
    float raffica = .62 + .38 * (.5 + .5 * sin(xr * 4.1 + (uT + uTV) * .9)) * (.5 + .5 * sin(xr * 1.7 + uT * .31 + 1.3));
    vis = step(fract(r.w * 7.31 + r.z), uDens * raffica * (1. + .35 * uRafG));
    vec2 dir = normalize(vec2(-incl, 1.)), nrm = vec2(dir.y, -dir.x);
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
    float x = fract(r.x - (uTV + uRafS * 2.5) * uStrato.z * .25);   /* verso sinistra */   /* la raffica porta via i fiocchi */
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
    /* ⚠ 3/11: su Windows (G10, Edge, grafica AMD) la tela «desynchronized» con trasparenza va su un livello della scheda
       video che non compare: il disegno c'è (i pixel si leggono) ma lo schermo resta nero. Lì si disegna nel modo normale.
       ?desinc=1 / ?desinc=0 nell'indirizzo per forzare. */
    const qd = new URLSearchParams(location.search).get('desinc');
    const desinc = qd != null ? qd === '1' : !/Windows/i.test(navigator.userAgent);
    const opz = {alpha:true, premultipliedAlpha:false, antialias:false, preserveDrawingBuffer:false, desynchronized:desinc};
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
    this.fumoDati = new Float32Array(24);
    this.u = posizioni(this.p, ['uOcchio','uImg0b','uVmix','uImg0','uImg1','uDep0','uDep1','uMap','uCrop0','uCrop1','uCropD0','uCropD1','uUccelli','uCielo0','uCielo1','uCieloM0','uCieloM1','uCieloX','uFermo0','uFermo1','uHaFermo0','uHaFermo1','uRap0','uHaRap0','uVentoT','uHaVento','uU','uNU','uUBox','uFumo','uNFumo','uFumoA','uNebV','uNotte','uOmbre','uMeteora','uMeteoraK','uMix','uHaImg','uHaDep0','uHaDep1','uMovimento0','uMovimento1',
      'uLato','uT','uTV','uRaf','uAspetto','uPix','uCoperto','uNebbia','uPioggia','uNeve','uTempesta','uVento','uLampo','uLampoX','uLampoS','uLampoB',
      'uNotteFinta','uLuce','uBuio','uQualita','uColNebbia','uMeteo','uSale']);
    gl.useProgram(this.p);
    gl.uniform1i(this.u.uImg0, 0); gl.uniform1i(this.u.uImg1, 1); gl.uniform1i(this.u.uDep0, 2); gl.uniform1i(this.u.uDep1, 3); gl.uniform1i(this.u.uImg0b, 4); gl.uniform1i(this.u.uMeteo, 5); gl.uniform1i(this.u.uCielo0, 6); gl.uniform1i(this.u.uCielo1, 7); gl.uniform1i(this.u.uFermo0, 8); gl.uniform1i(this.u.uFermo1, 9); gl.uniform1i(this.u.uVentoT, 10); if (this.u.uRap0) gl.uniform1i(this.u.uRap0, 12);
    this.unita = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) || 8;   /* il fermo vuole 10 unità (il Raspberry 4 ne ha 16) */
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;       /* Raspberry 4 e telefoni vecchi: 4096; il G10 16384 */
    /* nebbia e nuvole a bassa risoluzione */
    this.pm = programma(VERT, METEO_FRAG, ['aPos']);
    this.um = posizioni(this.pm, ['uMap','uT','uTV','uRaf','uVento']);
    this.pv = programma(VERT, VENTO_FRAG, ['aPos']);
    this.uv = posizioni(this.pv, ['uMap','uT','uCropD','uCieloM','uCieloX','uAlberi','uCielo','uVento']);
    gl.useProgram(this.pv); gl.uniform1i(this.uv.uAlberi, 11); gl.uniform1i(this.uv.uCielo, 6);
    this.bianca = this.texture(); this.carica(this.bianca, new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.vento = [];
    /* gocce e fiocchi */
    this.pp = programma(PART_VERT, PART_FRAG, ['aAngolo', 'aSeme']);
    this.up = posizioni(this.pp, ['uFori','uT','uTV','uRafG','uRafS','uVento','uScala','uTipo','uDens','uSale','uStrato','uColore','uMorb','uAlfa']);
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
  bufferMeteo(i, w, h, lista = this.meteo){
    const gl = this.gl, W = Math.max(8, Math.ceil(w / 4)), H = Math.max(8, Math.ceil(h / 4));
    let m = lista[i];
    if (m && m.w === W && m.h === H) return m;
    if (m){ gl.deleteTexture(m.tex); gl.deleteFramebuffer(m.fb); }
    const tex = this.texture(); this.carica(tex, null, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return lista[i] = {tex, fb, w:W, h:H};
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
  /* le immagini ingrandite dall'AI (pi/cuci-animazione.py: 2560 di altezza per le finestrelle, 4608 di larghezza
     per il TV 4K) possono superare quello che una scheda accetta: lì si riducono prima di caricarle */
  entro(im){
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, max = this.maxTex || 4096;
    if (Math.max(w, h) <= max) return im;
    const k = max / Math.max(w, h), c = document.createElement('canvas');
    c.width = Math.floor(w * k); c.height = Math.floor(h * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c;
  }
  fonteVuota(){ return {fumi:[], fumiUrl:null, dimg:null, img:null, tex:null, dep:null, depTex:null, video:null, cTex:null, cm:[0,0,0,0], fTex:null, iw:1, ih:1, url:null, ok:false}; }

  /* nuova immagine (o video in loop), con la sua profondità; sfuma da quella di prima in `dur` secondi */
  async mostra({url, profondita = null, video = null, fuoco = null, cielo = null, fermo = null, maschera = null, comignoli = null, alberi = null, ricolora = false}, dur = 0){
    if (this.fonti[0].ok && this.fonti[0].url === url + '|' + (video || '')){
      this.fonti[0].fuoco = fuoco;
      if ((comignoli || null) !== (this.fonti[0].fumiUrl || null)) this.caricaFumi(this.fonti[0], comignoli, this.fonti[0].dimg);   /* spostati dal telefono */
      return;
    }
    if (ricolora && this.unita < 13) video = null;   /* il ricolorato vuole una texture in più */
    const chiave = url + '|' + (video || '');
    if (this.inArrivo === chiave) return;
    this.inArrivo = chiave;
    try { await this._mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera, comignoli, alberi, ricolora && !!video); } finally { if (this.inArrivo === chiave) this.inArrivo = null; }
  }
  /* dove sale il fumo: i punti dell'AI (o messi a mano dal telefono), con la profondità di ciascuno per la prospettiva */
  async caricaFumi(f, url, dimg){
    f.fumiUrl = url || null;
    if (!url){ f.fumi = []; return; }
    try {
      const j = await (await fetch(url, {cache:'no-cache'})).json();
      let dd = null, W = 0, H = 0;
      if (dimg){ W = 128; H = Math.max(8, Math.round(W * dimg.naturalHeight / dimg.naturalWidth));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', {willReadFrequently:true});
        x.drawImage(dimg, 0, 0, W, H); dd = x.getImageData(0, 0, W, H).data; }
      if (f.fumiUrl !== url) return;
      f.fumi = (j.punti || []).slice(0, 6).map(q => ({x:+q.x, y:+q.y, w:+q.w || .04,
        n: dd ? dd[(Math.min(H - 1, Math.max(0, Math.round(q.y * H))) * W + Math.min(W - 1, Math.max(0, Math.round(q.x * W)))) * 4] / 255 : .5}));
    } catch(e) { f.fumi = []; }
  }
  async _mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera, comignoli = null, alberi = null, ricolora = false){
    const f = this.fonteVuota(); f.url = chiave; f.fuoco = fuoco;
    /* 8/11: tutti i file partono insieme (prima uno dopo l'altro: immagine, profondità, cielo, video, fermo…
       e nell'app si restava al nero per molti secondi); poi si montano nello stesso ordine di prima */
    const pDep = profondita ? caricaImg(profondita).catch(() => null) : null;
    const pAlberi = alberi && alberi !== url ? caricaImg(alberi).catch(() => null) : null;
    const pCielo = cielo ? caricaImg(cielo).catch(() => null) : null;
    const pVideo = video ? apriVideo(video).catch(() => null) : null;
    const pCucito = video ? fetch(video.split('?')[0].replace(/\.mp4$/, '-originale.mp4'), {method:'HEAD', cache:'no-store'}).then(r => r.ok).catch(() => false) : null;
    const pFermo = video && fermo && maschera && this.unita >= 10 ? Promise.all([caricaImg(fermo), caricaImg(maschera)]).catch(() => null) : null;
    const im = await caricaImg(url);
    f.img = im; f.iw = im.naturalWidth; f.ih = im.naturalHeight; f.tex = this.texture(); this.carica(f.tex, this.entro(im)); this.mip(f.tex);
    let dimg = null;
    if (pDep){ dimg = await pDep; if (dimg){ f.depTex = this.texture(); this.carica(f.depTex, dimg); this.mip(f.depTex); } }
    const imA = pAlberi ? (await pAlberi) || im : im;   /* 8/11: di notte gli alberi si trovano sull'immagine del giorno */
    try { f.aTex = this.texture(); this.carica(f.aTex, mascheraAlberi(imA, dimg)); } catch(e) { f.aTex = null; }
    f.dimg = dimg; await this.caricaFumi(f, comignoli, dimg);
    /* il cielo che scorre (serve la profondità, per sapere dov'è il cielo). Il video resta per quello che
       si muove sotto il cielo (nebbia nelle valli, fumo dei camini): il suo cielo non si usa più */
    if (pCielo && dimg){
      try {
        const ci = await pCielo, oriz = ci ? orizzonte(dimg) : 0;
        if (ci && oriz > .05){ f.cTex = this.texture(); this.carica(f.cTex, this.entro(ci)); this.mip(f.cTex); f.cm = [oriz, ci.naturalWidth / ci.naturalHeight, f.iw / f.ih, 0]; }
      } catch(e) { /* nessun cielo panoramico per questo paesaggio */ }
    }
    if (pVideo){ f.video = await pVideo; if (f.video) f.vtex = this.texture(); }
    /* cucito? cuci-animazione.py lascia accanto il file dell'AI, «…-originale.mp4» */
    if (f.video) f.cucito = await pCucito;
    /* fermo + maschera in una texture sola (rgb + a); se non ci sono, il video è già cucito */
    const fm = pFermo ? await pFermo : null;
    if (f.video && fm){
      try {
        const [fi, mi] = fm;
        const k = Math.min(1, (this.maxTex || 4096) / Math.max(fi.naturalWidth, fi.naturalHeight));
        const W = Math.floor(fi.naturalWidth * k), H = Math.floor(fi.naturalHeight * k), c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', {willReadFrequently:true});
        x.drawImage(mi, 0, 0, W, H); const m = x.getImageData(0, 0, W, H);
        x.drawImage(fi, 0, 0, W, H); const d = x.getImageData(0, 0, W, H);
        if (ricolora){
          /* il fermo con i colori di questa luce: la parte dell'immagine ferma che il video inquadra (come cropProfondita) */
          const vw = f.video[0].videoWidth || fi.naturalWidth, vh = f.video[0].videoHeight || fi.naturalHeight;
          const sc = Math.max(vw / f.iw, vh / f.ih), rw = vw / sc / f.iw, rh = vh / sc / f.ih, fx = fuoco && fuoco.x != null ? fuoco.x : .5;
          const sx = (1 - rw) * fx * f.iw, sy = (1 - rh) / 2 * f.ih, sw = rw * f.iw, sh = rh * f.ih;
          /* rapporto luce/giorno, molto sfocato (64 punti di larghezza, poi lineare): ricolora il video senza disegnarne i dettagli */
          const RW = 64, RH = Math.max(8, Math.round(RW * H / W)), rc = document.createElement('canvas'); rc.width = RW; rc.height = RH;
          const rx = rc.getContext('2d', {willReadFrequently:true});
          rx.drawImage(fi, 0, 0, RW, RH); const dg = rx.getImageData(0, 0, RW, RH).data;
          rx.drawImage(f.img, sx, sy, sw, sh, 0, 0, RW, RH); const rr = rx.getImageData(0, 0, RW, RH);
          for (let i = 0; i < rr.data.length; i += 4) for (let k = 0; k < 3; k++) rr.data[i + k] = Math.min(255, Math.round((rr.data[i + k] + 5) / (dg[i + k] + 5) / 4 * 255));
          f.rTex = this.texture(); this.carica(f.rTex, rr);
          x.drawImage(f.img, sx, sy, sw, sh, 0, 0, W, H); const dl = x.getImageData(0, 0, W, H);
          for (let i = 0; i < d.data.length; i += 4){ d.data[i] = dl.data[i]; d.data[i + 1] = dl.data[i + 1]; d.data[i + 2] = dl.data[i + 2]; }
        }
        for (let i = 3; i < d.data.length; i += 4) d.data[i] = m.data[i - 3];
        f.fTex = this.texture(); const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, f.fTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d);
        /* anche il fermo con le sue riduzioni già pronte: ora è più grande del foro (ingrandito dall'AI) e,
           senza, quando la prospettiva lo sposta i dettagli fini sfarfallerebbero */
        this.mip(f.fTex);
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
    for (const t of [f.tex, f.depTex, f.vtex, f.vtexB, f.cTex, f.fTex, f.aTex, f.rTex]) if (t) gl.deleteTexture(t);
    if (f.video) f.video.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    f.tex = f.depTex = f.vtex = f.vtexB = f.cTex = f.fTex = f.aTex = f.rTex = null; f.ok = false; }
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
    /* ⚠ 4/11 (Maurizio: «si capisce che c'è un loop per gli alberi, si percepisce lo stacco»): anche i video cuciti
       hanno ora il loro fermo e la loro maschera (li rifà cuci-animazione.py), e qui si prendevano per video non
       cuciti: un secondo di dissolvenza fra la fine e l'inizio, cioè due momenti diversi sovrapposti, e poi lo
       scatto. Un video cucito si chiude già da sé: basta un passaggio di pochi fotogrammi */
    /* ⚠ 5/11 (Maurizio: «nelle finestrelle ogni circa 6 secondi è come se l'animazione ripartisse»): misurato, il video
       cucito NON si chiude da sé: dall'ultimo al primo fotogramma la nebbia salta 10 volte più di un passo normale
       (finestrelle abbazia 0,78 contro 0,08; TV 0,49 contro 0,07). Con 3 fotogrammi di passaggio il salto si vedeva.
       Ora mezzo secondo (15 fotogrammi): il salto diventa più piccolo del movimento normale. Nel video cucito si
       muovono solo nebbia, acqua e fumo (alberi e case sono fermi), quindi la sovrapposizione non si nota. */
    const [a, b] = f.video, D = a.duration || 0, coda = f.cucito ? Math.min(.5, D * .08) : f.fTex ? Math.min(1, D * .15) : Math.min(.25, D * .05);
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

  crop(f, aspettoVista, margine = 1.04, fuoco = null, striscia = null, fuocoStriscia = null){
    /* copertura: l'immagine riempie la vista con un filo di margine per la prospettiva;
       dove l'immagine avanza, l'inquadratura scelta (fuoco 0..1, 0.5 = al centro) decide che parte si vede */
    const ai = f.iw / f.ih;
    let sw = 1, sh = 1;
    if (ai > aspettoVista) sw = aspettoVista / ai; else sh = ai / aspettoVista;
    sw /= margine; sh /= margine;
    const fx = fuoco && fuoco.x != null ? fuoco.x : .5, fy = fuoco && fuoco.y != null ? fuoco.y : .5;
    /* 4/11 · il trucco della prospettiva: con due finestrelle e un paesaggio largo, il centro del foro guarda
       l'elemento cardine (l'inquadratura scelta) spostato di striscia.off cm verso il suo lato. Solo per le immagini
       larghe (16:9): quelle verticali di prima restano come sono */
    if (striscia && ai > 1.2){
      const c = fuocoStriscia && fuocoStriscia.x != null ? fuocoStriscia.x : .5;
      const t = c + striscia.lato * striscia.off * sw / striscia.cmW;    /* panorama largo striscia.cmW / sw cm */
      return [Math.max(0, Math.min(1 - sw, t - striscia.u * sw)), (1 - sh) * fy, sw, sh];
    }
    return [(1 - sw) * fx, (1 - sh) * fy, sw, sh];
  }

  /* disegna: fori = [{x,y,w,h, map:[x,y,w,h], aspetto, lato}] in pixel del canvas */
  disegna(fori, s){
    const gl = this.gl, u = this.u;
    /* ⚠ 9/11 (Maurizio: «la raffica, quando c'è un po' di nebbia, è come se velocizzasse le immagini»): banchi, veli,
       nuvole e neve scorrevano di tempo × velocità del vento. Col tempo che dopo un'ora vale migliaia di secondi, ogni
       cambio di vento (la raffica: +0,6 in un secondo) spostava tutto di colpo, come un video mandato avanti veloce.
       Ora la strada fatta col vento si somma secondo per secondo (tv): il vento cambia la velocità, non la posizione */
    { const dt = this._tUlt == null ? 0 : s.t - this._tUlt; if (dt > 0 && dt < .5) this._tv = (this._tv || 0) + dt * Math.max(0, Math.min(1.6, s.vento || 0)); else if (dt < -60) this._tv = 0; this._tUlt = s.t; }   /* il tempo ricomincia ogni ora (t % 3588): anche tv, nello stesso istante, così non cresce per giorni */
    const tVento = this._tv || 0;
    /* raffica: [secondi da quando è partita (-1 nessuna), seme, forza]; per pioggia e neve basta quella al centro */
    const raf = s.raffica && s.raffica[0] >= 0 && s.raffica[0] < 8 ? s.raffica : [-1, 0, 0];
    { const rt = raf[0] - .55 - .75 / .72, env = t => t <= 0 ? 0 : (t < .45 ? (t / .45) ** 2 * (3 - 2 * t / .45) : 1) * (t < 1.2 ? 1 : Math.exp(-(t - 1.2) / .7));
      this._rafG = raf[0] >= 0 ? env(rt) * raf[2] : 0;
      if (raf[0] < 0) this._rafS = 0; else if (this._rafT != null && s.t > this._rafT) this._rafS = (this._rafS || 0) + (s.t - this._rafT) * this._rafG;
      this._rafT = s.t; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.c.width, this.c.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, s.trasparente ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.mix > 0){
      this.mix = Math.max(0, 1 - (performance.now() - this.mixDa) / Math.max(1, this.mixDur));
      if (this.mix === 0 && this.vecchiaDaLiberare){ this.libera(this.vecchiaDaLiberare); this.vecchiaDaLiberare = null; }
    }
    const [f0, f1] = this.fonti;
    const sp = this.spegni || new Set();
    const v0 = !sp.has('video') && this.aggiornaVideo(f0), v1 = !sp.has('video') && this.mix > 0 && this.aggiornaVideo(f1);
    const haImg = f0.ok && !s.trasparente;
    const lega = (unita, t) => { gl.activeTexture(gl.TEXTURE0 + unita); gl.bindTexture(gl.TEXTURE_2D, t || this.vuota); };
    lega(0, haImg ? (v0 ? f0.vtex : f0.tex) : null);
    lega(1, haImg && this.mix > 0 ? (v1 ? f1.vtex : f1.tex) : null);
    lega(2, f0.depTex); lega(3, f1.depTex); lega(4, haImg && f0.vk > 0 ? f0.vtexB : null); lega(5, null); lega(6, f0.cTex); lega(7, f1.cTex); if (this.unita >= 10){ lega(8, f0.fTex); lega(9, f1.fTex); } if (this.unita >= 13) lega(12, f0.rTex);
    /* uniformi del programma principale (restano al programma anche quando si passa agli altri) */
    gl.useProgram(this.p);
    gl.uniform1f(u.uVmix, haImg && v0 ? f0.vk : 0);
    gl.uniform1f(u.uHaImg, haImg ? 1 : 0);
    const k = this.mix * this.mix * (3 - 2 * this.mix);
    gl.uniform1f(u.uMix, haImg && f1.ok ? k : 0);
    gl.uniform1f(u.uHaDep0, f0.depTex ? 1 : 0); gl.uniform1f(u.uHaDep1, f1.depTex ? 1 : 0);
    /* il movimento «finto» delle nuvole serve solo sulle immagini ferme: un video si muove già da sé */
    /* con un video le nuvole si muovono già da sé: restano solo gli alberi (nel video cucito sono fermi come le case) */
    const mov = s.movimento && !sp.has('alberi');
    gl.uniform1f(u.uMovimento0, mov ? ((v0 && !f0.rTex) || f0.cTex ? .5 : 1) : 0);   /* ricolorato: il cielo è il dipinto, le nuvole le muove la pagina */ gl.uniform1f(u.uMovimento1, mov ? (v1 || f1.cTex ? .5 : 1) : 0);
    gl.uniform4fv(u.uCieloM0, haImg && f0.cTex && s.movimento && !sp.has('cielo') ? f0.cm : [0,0,0,0]); gl.uniform4fv(u.uCieloM1, haImg && f1.cTex && s.movimento ? f1.cm : [0,0,0,0]);
    gl.uniform1f(u.uCieloX, s.cieloX || 0);
    gl.uniform1f(u.uNebV, s.movimento && !sp.has('nebbiolina') ? 1 : 0);
    gl.uniform1f(u.uHaFermo0, haImg && v0 && f0.fTex ? 1 : 0); gl.uniform1f(u.uHaRap0, haImg && v0 && f0.fTex && f0.rTex && this.unita >= 13 ? 1 : 0); gl.uniform1f(u.uHaFermo1, haImg && v1 && f1.fTex ? 1 : 0);
    gl.uniform1f(u.uT, s.t); gl.uniform1f(u.uTV, tVento); gl.uniform3fv(u.uRaf, raf);
    for (const k2 of ['Coperto','Nebbia','Pioggia','Neve','Tempesta','Vento','Lampo','LampoX','LampoS','LampoB','NotteFinta','Luce','Buio','Qualita'])
      gl.uniform1f(u['u' + k2], s[k2.charAt(0).toLowerCase() + k2.slice(1)] || 0);
    gl.uniform3fv(u.uColNebbia, s.colNebbia);
    gl.uniform2fv(u.uSale, s.sale || [0, 0]);
    gl.uniform1f(u.uUccelli, haImg && !sp.has('uccelli') ? (s.uccelli || 0) : 0);
    const uc = s.stormi || {dati: new Float32Array(96), n: 0};
    gl.uniform4fv(u.uU, uc.dati); gl.uniform1f(u.uNU, sp.has('uccelli') ? 0 : uc.n); gl.uniform4fv(u.uUBox, uc.box || [0, 0, 1, 1]);
    gl.uniform1f(u.uNotte, s.notte || 0); gl.uniform1f(u.uOmbre, s.ombre || 0);
    const me = s.meteora || null;
    gl.uniform4fv(u.uMeteora, me ? me.da : [0,0,0,0]); gl.uniform1f(u.uMeteoraK, me ? me.k : 0);
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
        gl.uniform4fv(this.um.uMap, foro.map); gl.uniform1f(this.um.uT, s.t); gl.uniform1f(this.um.uTV, tVento); gl.uniform3fv(this.um.uRaf, raf); gl.uniform1f(this.um.uVento, s.vento || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      /* 1b. il vento sugli alberi (e le ombre delle nuvole), a un quarto di risoluzione */
      const c0v = f0.ok ? this.crop(v0 ? {iw:f0.video[0].videoWidth || f0.iw, ih:f0.video[0].videoHeight || f0.ih} : f0, foro.aspetto, marg, v0 ? null : f0.fuoco, foro.striscia, f0.fuoco) : [0,0,1,1];
      let tv = null;
      if (haImg && mov && this.unita >= 12){
        const m = this.bufferMeteo(i, foro.w, foro.h, this.vento); tv = m.tex;
        lega(5, null); lega(10, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, m.w, m.h);
        lega(11, f0.aTex || this.bianca); lega(6, f0.cTex);
        gl.useProgram(this.pv);
        gl.uniform4fv(this.uv.uMap, foro.map); gl.uniform1f(this.uv.uT, s.t); gl.uniform1f(this.uv.uVento, Math.max(0, Math.min(1, s.vento || 0)));
        gl.uniform4fv(this.uv.uCropD, v0 ? this.cropProfondita(f0, c0v) : c0v);
        gl.uniform4fv(this.uv.uCieloM, f0.cTex && !sp.has('cielo') ? f0.cm : [0,0,0,0]); gl.uniform1f(this.uv.uCieloX, s.cieloX || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      /* 2. il paesaggio col suo tempo */
      gl.useProgram(this.p);
      lega(5, tm); if (this.unita >= 12) lega(10, tv); gl.uniform1f(u.uHaVento, tv ? 1 : 0);
      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(foro.x, y, foro.w, foro.h); gl.scissor(foro.x, y, foro.w, foro.h);
      gl.uniform4fv(u.uMap, foro.map);
      gl.uniform1f(u.uAspetto, foro.aspetto);
      gl.uniform2f(u.uPix, foro.w / foro.map[2], foro.h / foro.map[3]);   /* pixel della vista intera */
      gl.uniform1f(u.uLato, s.prospettiva ? foro.lato : 0);
      const c0 = f0.ok ? this.crop(v0 ? {iw:f0.video[0].videoWidth || f0.iw, ih:f0.video[0].videoHeight || f0.ih} : f0, foro.aspetto, marg, v0 ? null : f0.fuoco, foro.striscia, f0.fuoco) : [0,0,1,1];
      const c1 = f1.ok ? this.crop(v1 ? {iw:f1.video[0].videoWidth || f1.iw, ih:f1.video[0].videoHeight || f1.ih} : f1, foro.aspetto, marg, v1 ? null : f1.fuoco, foro.striscia, f1.fuoco) : [0,0,1,1];
      gl.uniform4fv(u.uCrop0, c0); gl.uniform4fv(u.uCrop1, c1);
      gl.uniform4fv(u.uCropD0, v0 ? this.cropProfondita(f0, c0) : c0); gl.uniform4fv(u.uCropD1, v1 ? this.cropProfondita(f1, c1) : c1);
      /* il fumo dei comignoli di quello che si vede (quello nuovo, mentre sfuma dal vecchio) */
      const fumi = haImg && f0.ok && s.movimento && !sp.has('fumo') ? (f0.fumi || []) : [];
      if (fumi.length){
        const ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco);
        fumi.forEach((q, j) => { this.fumoDati[j * 4] = (q.x - ci[0]) / ci[2]; this.fumoDati[j * 4 + 1] = (q.y - ci[1]) / ci[3]; this.fumoDati[j * 4 + 2] = q.w / ci[2]; this.fumoDati[j * 4 + 3] = q.n; });
        gl.uniform4fv(u.uFumo, this.fumoDati);
      }
      gl.uniform1f(u.uNFumo, fumi.length); gl.uniform1f(u.uFumoA, 1 - (this.mix || 0));
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
    gl.uniform2f(up.uFori, foro.w, foro.h); gl.uniform1f(up.uT, s.t); gl.uniform1f(up.uTV, this._tv || 0); gl.uniform1f(up.uRafG, this._rafG || 0); gl.uniform1f(up.uRafS, this._rafS || 0); gl.uniform1f(up.uVento, s.vento || 0);
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
/* dove ci sono alberi (e un po' intorno, perché le chiome escono dal contorno quando si piegano): verde, non
   cielo, non lontanissimo; piccola e sfumata, per il passaggio del vento */
function mascheraAlberi(img, dimg){
  const W = 96, H = Math.max(8, Math.round(W * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true});
  x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H);
  let p = null; if (dimg){ x.drawImage(dimg, 0, 0, W, H); p = x.getImageData(0, 0, W, H).data; }
  const m = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++){
    const r = d.data[i * 4] / 255, g = d.data[i * 4 + 1] / 255, b = d.data[i * 4 + 2] / 255, mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, .01);
    const ss = (a, b2, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b2 - a))); return t * t * (3 - 2 * t); };
    const verde = ss(.88, .97, g / Math.max(r, .01)) * ss(.95, 1.05, g / Math.max(b, .01)) * ss(.06, .12, sat) * ss(.8, .6, r * .299 + g * .587 + b * .114);   /* come fogliame() nel disegno */
    const n = p ? p[i * 4] / 255 : (i / W / H);
    m[i] = verde * (n > .08 ? 1 : 0);
  }
  const o = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++){
    let v = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const yy = y + dy, x2 = xx + dx; if (yy >= 0 && yy < H && x2 >= 0 && x2 < W) v = Math.max(v, m[yy * W + x2]); }
    const k = (y * W + xx) * 4; o.data[k] = o.data[k + 1] = o.data[k + 2] = Math.round(Math.min(1, v * 1.5) * 255); o.data[k + 3] = 255;
  }
  return o;
}
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
const VERSIONE_VIDEO = 'c3';
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
