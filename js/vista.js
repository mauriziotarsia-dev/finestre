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
uniform sampler2D uRap0;      /* 8/11 · «risparmio»: il fermo del GIORNO, per usare il video del giorno a un'altra luce (10/11: solo il suo movimento) */
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
uniform sampler2D uAlberiM;   /* 11/11 · g: dove sono le chiome (dall'immagine del giorno): solo lì si muove qualcosa · 14/11 · b: dov'è la nebbia di giorno */
uniform float uNebG;          /* 14/11: 1 = il blu di uAlberiM viene davvero dall'immagine del giorno (di notte la nebbiolina va lì) */
uniform sampler2D uVentoT;    /* il vento sugli alberi, calcolato a un quarto di risoluzione (r, g: spostamento, b: raffica sugli alberi, a: ombre delle nuvole e nuvole del cielo, vedi gVentoA) */
#ifndef SENZA_NUVOLE
float gVentoA;                /* 14/11 sera · il quarto canale del vento in questo punto: lo scrive paesaggio() nell'unica lettura di uVentoT, lo usa main().
                                 128/255 = niente; sotto, l'ombra delle nuvole sul terreno (c'è solo sotto l'orizzonte); sopra, quanta nuvola del cielo che scorre
                                 sta qui (c'è solo sopra l'orizzonte; vedi VENTO_FRAG e mascheraNuvole): lì dietro le stelle non si vedono */
vec3 gVentoRG;                /* 16/11 · dentro: rosso, verde e blu del vento in questo punto (la polvere nei fasci di luce, quanto fascio c'è, quanto pavimento), dalla stessa lettura */
uniform float uFuoriK;        /* 20/11 · dentro: quanto più forte la luce che entra dalle finestre («fuoriOre» nel file dei punti) */
uniform float uPolvK;         /* 20/11 sera · dentro: quanto più forte il pulviscolo nella luce («polvereOre»; 1 = come prima) */
uniform vec2 uScuro;          /* 16/11 sera · dentro: quanto più buia la stanza (ombre e mezzi toni; le luci restano) e quanto più scuro il pavimento */
uniform vec4 uFascioD;        /* 16/11 · i fasci di luce delle finestre (mascheraFasci): direzione x, y; z = ci sono; w = larghezza su altezza del foro */
uniform vec3 uFascioC;        /* il colore della luce dei vetri */
#endif
uniform vec4 uU[24];          /* gli uccelli (js/uccelli.js): per ognuno (x, y, grandezza, ali) (inclinazione, chiarezza, tipo, -) */
uniform float uNU;            /* quanti uccelli */
uniform vec4 uUBox;           /* dove sono, tutti insieme (x0, y0, x1, y1 nella vista): fuori da lì non si calcola niente */
uniform float uNotte;         /* 0 giorno … 1 notte (stelle, fuochi che tremolano) */
uniform float uOmbre;         /* quanto si vedono le ombre delle nuvole (giorno sereno) */
uniform float uDentro;        /* 14/11 sera · 1 = un interno (la taverna): niente cielo né ombre di nuvole; il quarto canale del vento porta il respiro della luce dei fuochi */
uniform vec4 uLuciM0, uLuciM1;   /* 21/11 · LE LUCI DELLA TAVERNA DESERTA (luciOre nel file dei punti): x = 1 se il paesaggio ha gli strati
                                    di luce (nella texture del cielo, che dentro non serve: vedi luciAccese), y = dove finiscono le
                                    righe della stanza spenta (0…1 dall'alto) */
uniform vec3 uLuciW;             /* quanto è acceso ogni gruppo: torce a muro, lampadario, camini + torce da terra (0…1) */
uniform vec4 uFuori;          /* 15/11 sera · in un interno, il tempo di fuori visto dalle finestre: coperto, pioggia, tempesta; 21/11: nebbia */
uniform float uFuoriN;        /* 21/11 · in un interno: la neve di fuori */
uniform vec4 uMeteora;        /* stella cadente: da (x, y) a (z, w), nella vista */
uniform float uMeteoraK;      /* a che punto è (0 = nessuna) */
uniform float uHaVento;   /* (il passaggio a bassa risoluzione scrive dal basso: si legge capovolto) */
uniform vec4 uFumo[8];        /* fumo dai comignoli: (x, y nella vista, larghezza del tetto in larghezze della vista, profondità) */
uniform float uFumoI[8];      /* 9/11: quanto fuma ognuno (i comignoli 1, i fuochi lontani quando sono accesi: js/vita.js) */
uniform float uNFumo, uFumoA; /* quanti, e quanto si vedono (sfumano col paesaggio) */
uniform vec4 uFiammaS[12];    /* 19/11 sera · per ogni fiamma, calcolati una volta per immagine (vedi Vista, fiammaRumori): l'ondeggiare a 0, 0,43, 0,87, 1,3 altezze */
uniform vec4 uFiammaL[12];    /* 19/11 sera · per ogni fiamma: x l'allungarsi, y il tremolio della luce */
uniform vec4 uFiamma[12];     /* 15/11 · fiamme di candele e torce negli interni: (x, y della base nella vista, altezza in altezze della vista, seme). 17/11: 12 (lampadario, torce e tre candele della taverna non ci stavano in 8) */
uniform float uNFiamma;
uniform sampler2D uFiamT;     /* 19/11 sera · le fiamme a metà risoluzione (FIAMME_FRAG): rg spostamento, b tremolio della luce, a corpo della fiamma */
uniform float uHaFiamT;
uniform sampler2D uIns0, uIns1;   /* 16/11 sera · i video «inserto» (il gatto, i fuochi): video corti messi in un riquadro dell'immagine */
uniform vec4 uRiqBox[8];      /* fino a otto riquadri (21/11; prima quattro): dove stanno nell'immagine intera (x0, y0, x1, y1) */
uniform vec4 uRiqTile[8];     /* da quale parte del loro video (u0, v0, u1, v1) */
uniform vec4 uRiqW, uRiqW2;   /* 21/11 · quanto è acceso ogni riquadro (taverna deserta: il gruppo di luce del suo fuoco; 1 altrimenti) */
uniform vec4 uRiqSam, uRiqSam2;   /* (i riquadri 5…8 in uRiqSam2; +4 = prende la luce della stanza: la gatta della taverna deserta) */
vec3 gLuciRel;                /* 21/11 · quanto le luci accese cambiano questo punto rispetto al dipinto (taverna deserta; 1 altrimenti) */
//         /* per ognuno: 0 = primo video, 1 = secondo, -1 = spento; +2 = col suo «alfa» nella metà di sotto del video */
float gIns;                   /* 1 mentre si disegna il paesaggio che si vede (non quello da cui si sfuma) */
vec2 gTiR;                    /* 21/11 · il punto nell'immagine intera (x0..1, y0..1 dall'alto), scritto da paesaggio() per quello che si vede */
uniform vec4 uVetri[4];       /* 21/11 · dentro: i vetri delle finestre (fasci.ORA.vetri del file dei punti), nell'immagine intera */
uniform float uNVetri;
uniform vec4 uParte[9];       /* 16/11 sera · parti di animali che si muovono da sole (la testa e la coda del gatto): per ognuna tre: (perno x, y, centro x, y nella vista), (raggi x, y in altezze, rotazione in radianti, spostamento in altezze), (tipo 0 testa 1 coda, seme, periodo in secondi, lunghezza della coda) */
uniform float uNParte;
uniform vec4 uCamino[2];      /* 16/11 · i fuochi dei camini di un interno: (x al centro e y della base nella vista, mezza larghezza in larghezze della vista, altezza in altezze della vista) */
uniform float uNCamino;
float gLuceF;                 /* 21/11 · quanta della luce di questo punto viene dai fuochi accesi (1 senza interruttori) */
float gFiamma;                /* quanto di questo punto è fiamma (per il tremolio della luce, dopo) */
float gFiammaW;               /* 17/11 notte · quanto il punto sta nel corpo di una fiamma dei punti (per lasciarla luminosa, dopo) */
uniform float uNebV;          /* la nebbiolina viva (0 spenta) */
uniform vec2 uChiar;          /* 10/11 · ricolorato: nitidezza fine (x) e «chiarezza», il contrasto locale largo (y) */

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
#ifdef LEGGERO
/* 9/11: sul Raspberry (scheda video V3D) la raffica non si disegna: da quando c'è, il suo processo grafico cade e
   Chromium spegne WebGL. Con queste funzioni costanti il compilatore la toglie del tutto */
float rafTau(vec2 q){ return -1.; }
float rafCella(vec2 q){ return 0.; }
float rafEnv(float t){ return 0.; }
float rafStrada(float t){ return 0.; }
#else
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
#endif


vec3 foto(sampler2D t, vec4 crop, vec2 uv){ return texture2D(t, clamp(crop.xy + uv * crop.zw, .0005, .9995)).rgb; }
float prof(sampler2D d, vec4 crop, vec2 uv, float ha){
  if (ha > .5) return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).r;
  /* senza mappa: il cielo è lontano in alto, il terreno si avvicina scendendo */
  return pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4);
}
/* ⚠ 10/11 · CIELO (Maurizio, foto della TV: «sullo sfondo si vedono tutti questi puntini»). Prima il cielo era «dove la
   profondità è quasi nera» (sotto 0,022), punto per punto: ma i monti più lontani stanno a 0,004-0,016, cioè nero anche
   loro, e a gradini di 1/255. Il cielo che scorre copriva le colline lontane a chiazze e a puntini (scure sulla TV, fra
   le nuvole sopra l'abbazia; bianche a onde sulle finestrelle). Ora la maschera del cielo si fa una volta sola, al
   caricamento (mascheraCielo, sotto): una linea del cielo per colonna, solo cielo attaccato al bordo alto, i crinali neri
   tolti, una sfumatura verso l'orizzonte; sta nel canale verde della texture della profondità. Qui «m» è quella */
float cielo(vec3 c, float m, float y, float ha){
  float l = dot(c, vec3(.299, .587, .114));
  if (ha > .5) return m * smoothstep(.85, .45, y);
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
/* profondità (x) e maschera del cielo (y) insieme */
vec2 profCG(sampler2D d, vec4 crop, vec2 uv, float ha, vec2 gx, vec2 gy){
  if (ha < .5) return vec2(pow(clamp((uv.y - .38) / .62, 0., 1.), 1.4), 0.);
#if __VERSION__ >= 300
  return textureGrad(d, clamp(crop.xy + uv * crop.zw, .0005, .9995), gx, gy).rg;
#else
  return texture2D(d, clamp(crop.xy + uv * crop.zw, .0005, .9995)).rg;
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

/* fogliame: verde o verde-grigio (ulivi), anche scuro (cipressi); non la pietra (rossiccia), non la nebbia (azzurrina, chiara) */
float fogliame(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, .01), l = dot(c, vec3(.299, .587, .114));
  return smoothstep(.88, .97, c.g / max(c.r, .01)) * smoothstep(.95, 1.05, c.g / max(c.b, .01)) * smoothstep(.06, .12, sat) * smoothstep(.8, .6, l);
}

/* un'immagine del paesaggio, già col suo movimento */
/* ⚠ 16/11 sera · RIQUADRI (Maurizio: «per il gatto non possiamo mettere anche qualche altro movimento?», «anche i due fuochi
   più realistici»): video corti fatti dall'AI su un ritaglio ingrandito del dipinto, che partono e tornano sul dipinto. Ognuno
   vive per conto suo (js: Vista.aggiornaInserti): il gatto sta fermo e ogni tanto fa una delle sue cose, a caso; i fuochi
   girano senza fermarsi. Fuori da dove si muove, il video è il dipinto stesso (lo prepara Claude): il bordo non si vede.
   Video senza mipmap: leggerli dentro un «if» va bene */
vec3 riquadro(vec3 c, vec2 ti, vec4 box, vec4 tile, float sam, float w){
  if (sam < -.5 || w < .002) return c;
  float conLuce = step(3.5, sam); sam -= 4. * conLuce;
  vec2 q = (ti - box.xy) / (box.zw - box.xy);
  if (q.x <= 0. || q.y <= 0. || q.x >= 1. || q.y >= 1.) return c;
  vec2 ut = mix(tile.xy, tile.zw, q);
  float s1 = mod(sam, 2.), a = smoothstep(0., .03, min(min(q.x, 1. - q.x), min(q.y, 1. - q.y)));
  vec3 v = s1 < .5 ? texture2D(uIns0, ut).rgb : texture2D(uIns1, ut).rgb;
  /* con l'alfa (la metà di sotto del video, grigia: quanto la clip si muove lì) due riquadri vicini non si coprono */
  if (sam > 1.5) a *= s1 < .5 ? texture2D(uIns0, ut + vec2(0., .5)).g : texture2D(uIns1, ut + vec2(0., .5)).g;
  if (conLuce > .5) v *= gLuciRel;
  return mix(c, v, a * w);
}
/* ⚠ 17/11 · PROSPETTIVA VIVA A TUTTA ALTEZZA (Maurizio: «proviamo a tenere l'immagine a tutta altezza e a fare solo
   spostamenti a destra e sinistra; se mi avvicino o mi allontano non deve cambiare niente»). L'immagine del TV è 16:9 come
   lo schermo: senza ingrandirla, ai lati non c'è altro paesaggio da far entrare. Allora il centro scorre di tutto lo
   spostamento e i bordi solo di quanto c'è di riserva (uOcchio.y, la metà del margine): in mezzo si raccorda con una
   parabola. Il lontano scorre più del vicino, come prima. u = dove si è sullo schermo (0…1) */
float spostaVivo(float u, float n){
  float s = uOcchio.x * .08 * (1. - .7 * n);
  float c = 1. - (2. * u - 1.) * (2. * u - 1.);
  float wE = min(1., uOcchio.y / max(abs(s), 1e-4));
  return s * mix(wE, 1., c);
}
/* ⚠ 21/11 · GLI INTERRUTTORI DELLA TAVERNA DESERTA (Maurizio: «tre interruttori: torce a muro, lampadario, camini + torce da
   terra», «tutte le combinazioni», «con i camini spenti resta la brace bassa»). Il dipinto è la stanza con tutto acceso (A).
   Dalle immagini dell'AI con un gruppo solo acceso e con tutto spento Claude ha ricavato (scratchpad deserta/strati/strati.py)
   una texture sola: in alto la stanza spenta (S), sotto sei riquadri sfumati:
     d    (radice cubica) quanta della luce di A resta a tutto spento (la luce di fuori, la brace)
     q_t, q_l, q_c (radice) la parte della luce dei fuochi che viene da ogni gruppo (sommano a 1)
     m    dove sta la sorgente di ogni gruppo (fiamme, teste delle torce, fuoco del camino): r torce, g lampadario, b camini
     Af   (radice) A sfumata senza le sorgenti
   Luce del punto (lineare): L = d + (1 − d) · Σ w q   →   A · L (tutto acceso: A esatta). Dove un gruppo spento ha la
   sorgente, A avrebbe il fantasma della fiamma: lì la stanza spenta più la luce degli altri gruppi, S + Af · (L − d). */
vec2 luciT(float col, float rig, vec2 ti, float hS){
  vec2 e = vec2(.5 / 1280., .5 / 720.);
  vec2 q = clamp(ti, e, 1. - e);
  return vec2((q.x + col) / 3., hS + (q.y + rig) * .5 * (1. - hS));
}
vec3 luciAccese(vec3 c, sampler2D L, vec4 lm, vec2 ti){
  float hS = lm.y;
  vec3 S = texture2D(L, vec2(ti.x, min(ti.y, 1. - .5 / 2160.) * hS)).rgb;
  vec3 d = pow(texture2D(L, luciT(0., 0., ti, hS)).rgb, vec3(3.));
  vec3 qt = texture2D(L, luciT(1., 0., ti, hS)).rgb, ql = texture2D(L, luciT(2., 0., ti, hS)).rgb, qc = texture2D(L, luciT(0., 1., ti, hS)).rgb;
  vec3 m = texture2D(L, luciT(1., 1., ti, hS)).rgb;
  vec3 af = texture2D(L, luciT(2., 1., ti, hS)).rgb;
  vec3 F = (1. - d) * (uLuciW.x * qt * qt + uLuciW.y * ql * ql + uLuciW.z * qc * qc);
  vec3 Lu = d + F;
  float k = clamp(m.r * (1. - uLuciW.x) + m.g * (1. - uLuciW.y) + m.b * (1. - uLuciW.z), 0., 1.);
  vec3 o = mix(pow(c, vec3(2.2)) * Lu, pow(S, vec3(2.2)) + af * af * F, k);
  if (gIns > .5) gLuciRel = pow(max(Lu, vec3(0.)), vec3(1. / 2.2));
  if (gIns > .5) gLuceF = clamp(dot(F, vec3(.299, .587, .114)) / max(dot(Lu, vec3(.299, .587, .114)), 1e-4), 0., 1.);
  return pow(max(o, vec3(0.)), vec3(1. / 2.2));
}
vec3 paesaggio(sampler2D img, sampler2D imgB, float vk, sampler2D dep, vec4 crop, vec4 cropD, float haDep, float mov, sampler2D cie, vec4 cm, sampler2D fer, float haF, sampler2D rap, float haR, vec2 uv, out float n, out float sky, vec4 lm){
  n = prof(dep, cropD, uv, haDep);
  /* prospettiva: le cose vicine si spostano di più fra una finestra e l'altra */
  vec2 p = uv; p.x += uLato * .012 * (n - .35);
  /* prospettiva viva: chi si sposta a destra vede più paesaggio a sinistra (il lontano scorre con lui, il vicino meno);
     chi si avvicina alla finestra vede un po' più di paesaggio */
  p.x += spostaVivo(uv.x, n);
  /* ⚠ 15/11 sera (Maurizio: «avvicinarsi alla finestra o allontanarsi dovrebbe cambiare cosa si vede, ampliando o restringendo
     la visuale»): c'era già ma si vedeva appena (7%). Ora il doppio: a un metro dal TV si vede il 15% di paesaggio in più, oltre
     i quattro metri il 15% in meno. Una finestra vera farebbe molto di più, ma serve immagine oltre i bordi: con la prospettiva
     viva la riserva è il 33% (finestra/index.html, margine), che basta giusto per questo e per lo spostamento ai lati insieme */
  p = .5 + (p - .5) * (1. + uOcchio.z * .15);
  /* ⚠ 15/11 · FIAMME CHE DANZANO (Maurizio, finestrelle della taverna: «il fuoco delle torce è troppo poco reale»). Nel
     video dell'AI le torce quasi non si muovono, e nelle ore senza video sono dipinte. Dentro, dove l'immagine è una
     fiamma (chiara e molto più rossa che blu, guardata un po' sfocata, così si prende anche il bordo) il punto si legge
     un poco più in là: lingue che salgono e ondeggiano, svelte, ognuna per conto suo. Il bordo caldo del muro attorno
     ondeggia appena (il tremolio dell'aria calda). Solo coordinate: le letture vere vengono dopo, fuori da ogni «if» */
  /* ⚠ 15/11 mattina · SPENTO (Maurizio, dal telefono: «dove c'è il camino l'immagine sfarfalla. Anche vicino ed
     intorno alla mugnaia. Non va bene»). Misurato: la regola delle fiamme prendeva il 9% del quadro (soffitto ocra, muro
     arancio della cucina, cuffia della cuoca) e lo faceva ondeggiare svelto; stretta alle sole fiamme, quasi non le
     prende (le fiamme vere sono quasi bianche, la cera delle candele e il muro della cucina sono più arancio di loro).
     Si riaccende solo con un modo che riconosca davvero le fiamme (#define FIAMME_DANZANTI) */
#ifdef FIAMME_DANZANTI
  if (uDentro > .5 && uDentro < 1.5){
    /* la punta si muove, la base no: conta quanto c'è fiamma SOTTO il punto e non sopra (la cima delle lingue e delle
       torce); dentro la cera delle candele (fiamma sopra e sotto) e alla base, appoggiata alla torcia, poco o niente */
    vec2 dF = vec2(0., .012);
    vec4 bF = haF > .5 ? texture2D(fer, clamp(crop.xy + p * crop.zw, .0005, .9995), 1.5) : vec4(fotoL(img, crop, p, 1.5), 0.);
    vec3 bS = haF > .5 ? fotoL(fer, crop, p + dF, 1.5) : fotoL(img, crop, p + dF, 1.5);
    vec3 bA = haF > .5 ? fotoL(fer, crop, p - dF, 1.5) : fotoL(img, crop, p - dF, 1.5);
    /* ⚠ 15/11 mattina (Maurizio, dal telefono: «dove c'è il camino l'immagine sfarfalla. Anche vicino ed intorno alla
       mugnaia»): la prima regola (chiaro e più rosso che blu) prendeva il 9% del quadro: il soffitto ocra, il muro
       arancio della cucina dietro la cuoca, la sua cuffia e il grembiule al lume del fuoco. Tutto ondeggiava, svelto.
       Ora solo le fiamme vere: molto chiare, molto rosse sul blu e molto sature (1,5% del quadro: fiamme, aloni delle
       torce, riflessi sul pavimento). E niente dove c'è il video intero (persone e fuoco del camino si muovono già) */
    vec3 fF = vec3(max(bF.r, max(bF.g, bF.b)), max(bS.r, max(bS.g, bS.b)), max(bA.r, max(bA.g, bA.b)));
    vec3 nF = vec3(min(bF.r, min(bF.g, bF.b)), min(bS.r, min(bS.g, bS.b)), min(bA.r, min(bA.g, bA.b)));
    vec3 rF = vec3(bF.r - bF.b, bS.r - bS.b, bA.r - bA.b);
    vec3 mm = smoothstep(.72, .9, fF) * smoothstep(.3, .45, rF) * smoothstep(.45, .6, (fF - nF) / max(fF, vec3(.01)));
    float mF = mm.x * clamp((mm.y - mm.z) * 2. + .2, 0., 1.) * (1. - clamp(bF.a * 2. - 1., 0., 1.));
    vec2 qF = p * vec2(uAspetto, 1.) * 70.;
    float sw = rumore(vec2(qF.y * .8 + uT * 2.3, qF.x * .5 - uT * .7)) * .65 + rumore(vec2(qF.y * 2.1 + uT * 5.1, qF.x * 1.7 + 3.3)) * .35 - .5;
    float su = rumore(vec2(qF.x * 1.4 + 1.7, qF.y * 1.2 + uT * 4.2)) * .6 + rumore(vec2(qF.x * 3.1 - 2.2, qF.y * 2.6 + uT * 6.3)) * .4 - .5;
    p += mF * vec2(sw * .006 / uAspetto, su * .007);
  }
#endif
  /* ⚠ 15/11 mattina · FIAMME VIVE, PUNTO PER PUNTO (Maurizio: «la fiamma delle candele deve essere più animata»).
     Riconoscerle dal colore non va (quasi bianche, più chiare della cera ma meno arancio; il muro della cucina è più
     arancio di loro): dove stanno lo dice il file dei punti del paesaggio (…_comignoli.json, chiave «fiamme»: base e
     altezza di ogni fiamma). Attorno a ogni fiamma il punto si legge un po' più in là: la fiamma ondeggia di lato, di
     più verso la punta, e si allunga e si accorcia; la base resta attaccata allo stoppino. Svelta e mai uguale */
  /* ⚠ 16/11 (Maurizio: «l'ondulato che si vede attorno alla luce di candele e torce è troppo fake, ondula troppo anche
     il muro dietro»). Misurato: la zona che si spostava era larga 1,6 altezze di fiamma e alta quasi 2, e sopra la punta
     lo spostamento arrivava a due terzi di altezza (cresceva col quadrato della salita): muro, ferri della torcia e
     soffitto ondeggiavano come acqua. Ora si sposta solo la fiamma: una striscia larga poco più di lei (mezza altezza),
     dalla base a poco sopra la punta; la punta ondeggia di un decimo di altezza al massimo e la fiamma si allunga e si
     accorcia di meno. Il tremolio della luce resta, ma solo sulla fiamma e appena attorno, sfumato in tondo */
  /* ⚠ 19/11 sera · (Maurizio: «Puoi alzare al massimo possibile la risoluzione…»). Misurato col banco sul TV in 4K: le fiamme
     e il fuoco dei camini costavano 8,5 ms su 21 a ogni immagine. Con un giro di lunghezza fissa (12) il compilatore della
     scheda (ANGLE → Direct3D) lo srotola e fa i conti di tutte e 12 le fiamme, rumori compresi, su ogni punto dello schermo,
     anche lontano da ogni fiamma. Con GLSL 3 (WebGL2: TV e finestrelle) il giro ora dura quanto le fiamme che ci sono ed è
     un giro vero: i punti lontani escono subito. Con WebGL1 com'era */
  gFiamma = 0.; gFiammaW = 0.;
  /* ⚠ 19/11 sera · 4K PIENO (Maurizio: «Possiamo dimezzare invece che un quarto?»). Il giro qui sotto, su ogni punto dello
     schermo, costava al TV ~6 ms su 19,5 in 4K (col compilatore della scheda i punti lontani da ogni fiamma non escono
     davvero prima). Ora lo stesso conto si fa in un passaggio a metà risoluzione (FIAMME_FRAG): qui si legge e basta
     (spostamento, tremolio della luce, corpo della fiamma). Il giro resta per chi non ha il passaggio (WebGL1, poche unità) */
  if (uHaFiamT > .5){
    vec2 tf = (p - uMap.xy) / uMap.zw;
    vec4 ft = texture2D(uFiamT, vec2(tf.x, 1. - tf.y));
    p += (ft.xy - 128. / 255.) / 64.;
    gFiamma = (ft.z - 128. / 255.) * 2.; gFiammaW = ft.w;
  } else if (uNFiamma > .5){
    vec2 dpF = vec2(0.);
#if __VERSION__ >= 300
    for (int i = 0; i < int(uNFiamma + .5); i++){   /* 19/11: con GLSL 3 il giro è vero (non srotolato): fuori dalle zone niente conti */
#else
    for (int i = 0; i < 12; i++){
      if (float(i) >= uNFiamma) break;
#endif
      vec4 F = uFiamma[i];
      vec2 q = vec2((p.x - F.x) * uAspetto, p.y - F.y) / F.z;      /* in altezze di fiamma: 0 alla base, -1 alla punta */
      if (abs(q.x) > .9 || q.y > .45 || q.y < -1.7) continue;   /* lontano dalla fiamma: niente conti (in 4K sono milioni di punti) */
      float su = clamp(-q.y, 0., 1.3);
      float t = uT * 1.25 + F.w * 13.7;
      float zona = smoothstep(.42, .2, abs(q.x)) * smoothstep(1.35, 1.05, -q.y);   /* il corpo della fiamma (la base non si muove comunque: lo spostamento cresce salendo) */
      if (zona > 0.){
        /* 19/11 sera: i rumori (prima calcolati qui, su ogni punto di ogni fiamma: col disegno «srotolato» del TV, su ogni punto
           dello schermo) arrivano già fatti per fiamma: l'ondeggiare in quattro punti dell'altezza, interpolato */
        vec4 S4 = uFiammaS[i]; float kS = clamp(su / .4333, 0., 3.);
        float sw = kS < 1. ? mix(S4.x, S4.y, kS) : (kS < 2. ? mix(S4.y, S4.z, kS - 1.) : mix(S4.z, S4.w, kS - 2.));
        float lu = uFiammaL[i].x;
        dpF += zona * vec2(sw * su * .2 * F.z / uAspetto, lu * su * .16 * F.z);
      }
      float tondo = smoothstep(1., .25, length(vec2(q.x, (q.y + .5) * .8)));
      gFiammaW = max(gFiammaW, smoothstep(.5, .25, abs(q.x)) * smoothstep(1.45, 1.05, -q.y) * smoothstep(.3, .0, q.y));
      gFiamma += tondo * smoothstep(.45, -.1, q.y) * uFiammaL[i].y;   /* la luce della fiamma trema (non la candela sotto); 19/11: il rumore già fatto per fiamma */
    }
    p += dpF;
  }
  /* ⚠ 16/11 · IL FUOCO DEI CAMINI (Maurizio: «la fiamma dei camini la renderei più realistica»). Dipinto (finestrelle) è
     fermo; nel video dell'AI (TV) le lingue cambiano forma a scatti invece di salire. Dentro il riquadro del fuoco (dal file
     dei punti, «camini»: base, larghezza e altezza delle fiamme) il punto si legge da onde che salgono svelte: le lingue
     si allungano, si staccano e corrono verso l'alto, più in alto più mosse, la brace in basso ferma. Solo dentro il fuoco
     (fuori dal riquadro, che sfuma in fretta, niente): il fondo del focolare appena sopra le fiamme tremola come nell'aria
     calda vera. La luce del fuoco pulsa un poco (gFiamma) */
  if (uNCamino > .5){
    vec2 dpK = vec2(0.);
#if __VERSION__ >= 300
    for (int i = 0; i < int(uNCamino + .5); i++){   /* 19/11: con GLSL 3 il giro è vero (non srotolato): fuori dalle zone niente conti */
#else
    for (int i = 0; i < 2; i++){
      if (float(i) >= uNCamino) break;
#endif
      vec4 K = uCamino[i];
      vec2 a = vec2((p.x - K.x) / K.z, (K.y - p.y) / K.w);       /* x in mezze larghezze (−1 … 1), y in altezze dalla base (0 … 1 la punta) */
      if (abs(a.x) > 1.05 || a.y < -.1 || a.y > 1.45) continue;
      vec2 b = vec2((p.x - K.x) * uAspetto, K.y - p.y) / K.w;      /* in altezze, uguale nei due versi */
      float t = uT + float(i) * 17.3;
      float zona = smoothstep(1.05, .75, abs(a.x)) * smoothstep(-.1, .12, a.y) * smoothstep(1.45, 1.05, a.y);
      float su = smoothstep(.0, .55, a.y);                       /* la brace non si muove, le punte sì */
      float n1 = rumore(vec2(b.x * 5.5, b.y * 3.2 - t * 4.6));
      float n2 = rumore(vec2(b.x * 11. + 3.1, b.y * 7. - t * 8.3));
      float n3 = rumore(vec2(b.x * 3. + 7.7, b.y * 2.2 - t * 3.1));
      float dy = (n1 - .5) * .6 + (n2 - .5) * .4, dx = (n3 - .5) * .7 + (n2 - .5) * .3;
      dpK += zona * su * vec2(dx * .1 * K.w / uAspetto, -dy * .2 * K.w);
      gFiamma += zona * .5 * (rumore(vec2(t * 5.3, 4.1 + float(i))) * .6 + rumore(vec2(t * 9.7, 2.3 + float(i))) * .4 - .5);
    }
    p += dpK;
  }
  /* ⚠ 16/11 sera · IL GATTO (Maurizio: «fai muovere di più il gatto»): nel video dell'AI il gatto è dipinto e fermo. Le sue
     parti (dal file dei punti, «animaliOre») si muovono rigide, come un pezzo solo, non a onde: la testa tiene una posa
     per qualche secondo, poi in un attimo si gira un poco e si inclina verso un'altra (guarda in giro); la coda ogni tanto
     dà una frustata e torna giù. Solo nel loro ovale, che sfuma sul collo e sul pavimento */
  if (uNParte > .5){
    vec2 dpP = vec2(0.);
#if __VERSION__ >= 300
    for (int i = 0; i < int(uNParte + .5); i++){   /* 19/11: con GLSL 3 il giro è vero (non srotolato): fuori dalle zone niente conti */
#else
    for (int i = 0; i < 3; i++){
      if (float(i) >= uNParte) break;
#endif
      vec4 A = uParte[i * 3], B = uParte[i * 3 + 1], C = uParte[i * 3 + 2];
      vec2 e = vec2((p.x - A.z) * uAspetto, p.y - A.w) / B.xy;
      float r = length(e);
      if (r > 1.5) continue;
      float w = 1. - smoothstep(.8, 1.5, r);
      vec2 d = vec2((p.x - A.x) * uAspetto, p.y - A.y);
      float tt = uT / C.z + C.y * 7.3, k = floor(tt), f = fract(tt);
      float h0 = fract(sin((k + C.y * 13.1) * 78.233) * 43758.5453), h1 = fract(sin((k + 1. + C.y * 13.1) * 78.233) * 43758.5453);
      float ang = 0., sh = 0.;
      if (C.x < .5){
        float m = smoothstep(.7, .95, f);   /* ferma per tre quarti del tempo, poi si gira in fretta */
        sh = B.w * mix(h0 * 2. - 1., h1 * 2. - 1., m);
        ang = B.z * mix(fract(h0 * 7.13) * 2. - 1., fract(h1 * 7.13) * 2. - 1., m);
      } else {
        float on = step(.4, fract(h0 * 3.7 + .5));
        float b = smoothstep(.0, .12, f) * (1. - smoothstep(.2, .55, f)) + .35 * smoothstep(.55, .62, f) * (1. - smoothstep(.62, .8, f));   /* su, giù, e un colpetto */
        ang = B.z * b * on * (h1 > .5 ? 1. : -.6);
        w *= smoothstep(.15, .9, length(d) / max(C.w, 1e-4));   /* la base della coda sta ferma, la punta va */
      }
      float a = -ang * w, ca = cos(a), sa = sin(a);
      vec2 dr = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca) - vec2(sh * w, 0.);
      dpP += vec2((dr.x - d.x) / uAspetto, dr.y - d.y);
    }
    p += dpP;
  }
  vec3 c = foto(img, crop, p);
  if (lm.x > .5) c = luciAccese(c, cie, lm, clamp(crop.xy + p * crop.zw, 0., 1.));   /* 21/11: gli interruttori della taverna deserta */
  /* ⚠ 5/11 · il passaggio al giro del video sfuma SOLO il video (prima si sfumava verso un secondo paesaggio disegnato
     senza vento e senza nebbiolina: a ogni giro i cipressi tornavano dritti e i veli sparivano, «si vede il loop») */
  if (vk > .001) c = mix(c, foto(imgB, crop, p), vk);
  sky = cielo(c, haDep > .5 ? fotoL(dep, cropD, p, 0.).g : 0., p.y, haDep);   /* ⚠ 5/11: profondità un po' sfocata: quella nitida è granulosa vicino all'orizzonte e il cielo che scorre ci lasciava puntini (G10) */
  /* video non ancora cucito: fermo dappertutto, video solo dove si muove davvero e solo dove è chiaro e poco
     colorato (nebbia, fumo, acqua che luccica: i cipressi scuri dentro un banco di nebbia restano fermi);
     il cielo dal video, se non c'è il panorama */
  float vivoV = 0.;   /* quanto di questo punto viene dal video (con il fermo): serve alla nebbiolina */
  if (haF > .5){
    vec4 fb = haR > .5 ? texture2D(fer, clamp(crop.xy + p * crop.zw, .0005, .9995), -.6) : texture2D(fer, clamp(crop.xy + p * crop.zw, .0005, .9995));   /* 10/11: col ricolorato il dipinto si legge dal livello più fine (il video, senza riduzioni, è nitido di suo) */
    /* 10/11: col video ricolorato il fermo è il dipinto, più morbido del video dell'AI (che a 1080p ripassa i dettagli):
       un filo di nitidezza, così da un'ora all'altra non sembra calare la risoluzione */
    if (haR > .5){
      /* ⚠ 10/11 (Maurizio: «la rianimata sembra molto più definita»): il video dell'AI ridisegna il paesaggio con più
         micro-dettaglio del dipinto (misurato: circa il doppio). Al dipinto si dà nitidezza fine e un po' di
         «chiarezza» (contrasto locale largo, sulla luce e non sul colore, tenuto lontano dai neri e dai bianchi) */
      vec2 qf = clamp(crop.xy + p * crop.zw, .0005, .9995);
      vec3 b1 = texture2D(fer, qf, 1.2).rgb, b3 = texture2D(fer, qf, 3.5).rgb;
      float l = dot(fb.rgb, vec3(.299, .587, .114)), l3 = dot(b3, vec3(.299, .587, .114));
      float lc = (l - l3) * uChiar.y * smoothstep(.02, .15, l) * (1. - smoothstep(.85, 1., l));
      fb.rgb = clamp(fb.rgb + (fb.rgb - b1) * uChiar.x + lc, 0., 1.);
    }
    float mx = max(fb.r, max(fb.g, fb.b)), mn = min(fb.r, min(fb.g, fb.b));
    float chiaro = smoothstep(.38, .6, mx) * (1. - smoothstep(.2, .42, (mx - mn) / max(mx, .01)));
    /* ⚠ 5/11 (Maurizio: «si vede ancora il giro sullo sfondo, nella zona con la foschia»): la foschia lontana del video
       va da una parte per 7 secondi e poi torna indietro, e nessun passaggio lo nasconde. Lontano (profondità sotto
       ~0,2) si tiene il dipinto fermo: la foschia la muove la nebbiolina viva, che non ha giro. Il video resta per
       l'acqua e la nebbia vicine. */
    float vivo = max(fb.a * chiaro * smoothstep(.3, .45, n), cm.x > 0. || haR > .5 ? 0. : sky);   /* 5/11: misurato, i salti del giro stanno fra 0,04 e 0,23 di profondità */
    /* ⚠ 14/11 notte · DENTRO, PERSONE E FIAMME (Maurizio, davanti alla taverna: «per un movimento più marcato dei
       personaggi?»). La regola qui sopra (dal video solo il chiaro e poco colorato) è fatta per nebbia e acqua; dentro
       fermava la cuoca (restava un fantasma sfocato, con grembiule e cuffia che si muovevano su un corpo fermo) e
       spegneva le fiamme. La maschera di un interno ha due piani (pi/cuci-animazione.py): fino a metà le zone «a nebbia»,
       da metà in su persone e fiamme, che vengono dal video intero, a colori pieni. Col video del giorno ricolorato
       (alba, tramonto, notte senza un video loro) il video intero no: sarebbero la cuoca e il fuoco del giorno */
    if (uDentro > .5){
      float zG = min(1., fb.a * 2.), zF = haR > .5 ? 0. : clamp(fb.a * 2. - 1., 0., 1.);
      vivo = max(zG * chiaro * smoothstep(.3, .45, n), zF);
    }
    /* ⚠ 8/11 · «RISPARMIO»: alba, tramonto e notte senza un video loro usano quello del giorno. Il fermo porta già i colori
       di quella luce; il video (giorno) si ricolora col rapporto luce/giorno, sfocato, punto per punto. Il cielo resta il dipinto */
    /* ⚠ 10/11 (Maurizio, confronto all'alba: «si può diminuire il gap? la ricolorata la vedo con una risoluzione
       minore»). Prima il video del giorno si colorava col rapporto luce/giorno (sfocato) e PRENDEVA IL POSTO del dipinto
       dove si muove: il fiume e la nebbia diventavano quelli del giorno tinti di rosa, con i dettagli più morbidi del
       video (ricampionato a 30 img/s quando si cuce). Ora resta il dipinto di questa luce, a piena risoluzione, e del
       video si prende solo quanto si scosta dal suo fermo (cioè il movimento), scalato con la luce di qui: i riflessi
       caldi sull'acqua e sotto il ponte restano quelli dell'alba, e la nebbia del giorno ci scorre sopra */
    if (haR > .5){
      /* ⚠ 10/11 (Maurizio: «quella al centro la vedo ancora poco nitida»): il video cucito è più morbido del suo fermo
         (ricampionato a 30 img/s), e «video − fermo» si portava dietro, rovesciato, il dettaglio del fermo del giorno:
         sopra il dipinto dell'alba diventava un velo di poltiglia, larga quanto la nebbia. Ora si confrontano video e
         fermo sfocati allo stesso modo (5 punti): resta solo il movimento, morbido come la nebbia; i dettagli sono
         tutti del dipinto */
      vec2 qr = clamp(crop.xy + p * crop.zw, .0005, .9995), e1 = vec2(.0016, 0.), e2 = vec2(0., .0028);
      vec3 cB = (c + foto(img, crop, p + e1) + foto(img, crop, p - e1) + foto(img, crop, p + e2) + foto(img, crop, p - e2)) * .2;
      vec3 fdL = (texture2D(rap, qr).rgb + texture2D(rap, clamp(qr + e1 * crop.zw, .0005, .9995)).rgb + texture2D(rap, clamp(qr - e1 * crop.zw, .0005, .9995)).rgb
                + texture2D(rap, clamp(qr + e2 * crop.zw, .0005, .9995)).rgb + texture2D(rap, clamp(qr - e2 * crop.zw, .0005, .9995)).rgb) * .2;
      vec3 fdB = texture2D(rap, qr, 4.).rgb, fbB = texture2D(fer, qr, 4.).rgb;
      vec3 g = clamp((fbB + .03) / (fdB + .03), .1, 1.6);
      c = clamp(fb.rgb + (cB - fdL) * g, 0., 1.);
    }
    c = mix(fb.rgb, c, vivo);
    vivoV = vivo;
  }
  if (gIns > .5) gTiR = crop.xy + p * crop.zw;
  if (gIns > .5){   /* 16/11 sera · i riquadri (il gatto, i fuochi): sopra il video e il fermo */
    vec2 tiR = crop.xy + p * crop.zw;
    c = riquadro(c, tiR, uRiqBox[0], uRiqTile[0], uRiqSam.x, uRiqW.x); c = riquadro(c, tiR, uRiqBox[1], uRiqTile[1], uRiqSam.y, uRiqW.y);
    c = riquadro(c, tiR, uRiqBox[2], uRiqTile[2], uRiqSam.z, uRiqW.z); c = riquadro(c, tiR, uRiqBox[3], uRiqTile[3], uRiqSam.w, uRiqW.w);
    c = riquadro(c, tiR, uRiqBox[4], uRiqTile[4], uRiqSam2.x, uRiqW2.x); c = riquadro(c, tiR, uRiqBox[5], uRiqTile[5], uRiqSam2.y, uRiqW2.y);
    c = riquadro(c, tiR, uRiqBox[6], uRiqTile[6], uRiqSam2.z, uRiqW2.z); c = riquadro(c, tiR, uRiqBox[7], uRiqTile[7], uRiqSam2.w, uRiqW2.w);
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
      vec2 dir = vec2(-.01452 - .0242 * uVento, .001815);   /* 9/11: verso sinistra, come tutto il resto; 11/11: +10% (Maurizio); 14/11: ancora +10% */
      vec2 pa = p - dir * (f1 - .5), pb = p - dir * (f2 - .5);
      vec3 a = haR > .5 ? fotoG(fer, crop, pa, gx, gy) : fotoG(img, crop, pa, gx, gy), b = haR > .5 ? fotoG(fer, crop, pb, gx, gy) : fotoG(img, crop, pb, gx, gy);   /* ricolorato: le nuvole sono quelle dipinte di questa luce (nel fermo), non quelle del video */
      /* si prende solo cielo: un pezzo di monte o di castello spostato dentro il cielo darebbe il contorno doppio */
      float sa = cielo(a, profCG(dep, cropD, pa, haDep, gx, gy).y, pa.y, haDep), sb = cielo(b, profCG(dep, cropD, pb, haDep, gx, gy).y, pb.y, haDep);
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
    /* ⚠ 14/11 · ALBERI CON LE IMMAGINI IN 4K (Maurizio: «il movimento degli alberi è troppo fake, ondula troppo anche
       dove non serve, si vede troppo», sulla finestrella dell'abbazia). Con l'immagine nitida lo stesso spostamento si
       vede molto di più, e la maschera delle chiome prendeva anche campi e pendii (vedi mascheraAlberi). Ora: le chiome
       lontane (il colle dell'abbazia) quasi ferme, quelle a metà strada appena, le vicine ondeggiano piano: lo
       spostamento cresce con la vicinanza, come succede davvero, ed è circa un terzo di prima */
    float vicino = smoothstep(.06, .30, n);
    vec2 dSp = vec2(0.);   /* di quanto si è spostato quello che si vede qui (chiome al vento): la nebbiolina lo segue */
    vec4 vt = uHaVento > .5 ? texture2D(uVentoT, vec2(vUv.x, 1. - vUv.y)) : vec4(.5, .5, 0., 128. / 255.);
#ifndef SENZA_NUVOLE
    gVentoA = vt.a; gVentoRG = uHaVento > .5 ? vt.rgb : vec3(.5, 0., 0.);
#endif
    if (vicino > .01 && vt.b > .01 && uDentro < .5){   /* 16/11: dentro il blu del vento è il pavimento (VENTO_FRAG) */
      /* ⚠ 8/11 (Maurizio: «di notte gli alberi sono immobili»): di notte il verde non c'è più, è tutto blu scuro e
         fogliame() non trovava niente. Dove sono le chiome lo sa già il vento (vt.b, dalla maschera fatta sull'immagine
         del giorno): di notte lì si muove quello che è scuro */
      float notteA = smoothstep(.5, 1., uNotte);
      /* ⚠ 10/11 (Maurizio: «su tramonto si muovono poco gli alberi»): al tramonto e all'alba le chiome sono arancio o
         rosate, non verdi, e fogliame() ne trovava poche. Dove sono le chiome lo dice già il vento (vt.b, dal giorno):
         lì si muove anche quello che è scuro, a ogni ora */
      float scuroC = smoothstep(.45, .15, dot(c, vec3(.299, .587, .114)));
      /* 11/11: solo dove ci sono chiome (non il prato, non i tetti e i muri in ombra accanto agli alberi) */
      float chioma = smoothstep(.04, .45, texture2D(uAlberiM, clamp(cropD.xy + p * cropD.zw, .0005, .9995)).g);
      float verde = max(mix(fogliame(c), smoothstep(.4, .12, dot(c, vec3(.299, .587, .114))), notteA), scuroC * .85) * vicino * chioma;   /* anche gli ulivi grigio-verdi e i cipressi scuri; non la pietra, non la nebbia */
      /* ⚠ 30/10: il vento (raffiche e rami) arriva già calcolato a un quarto di risoluzione: sul Raspberry
         calcolarlo per ogni pixel costava un terzo delle immagini al secondo */
      /* quanto si muovono (pixel su un foro alto 1000). Due parti, alla stessa velocità con ogni vento:
         · l'ondeggiare intorno alla posizione: 2-5 px nella calma, fino a 4-11 col vento forte;
         · la spinta sottovento (verso dove vanno le nuvole): niente nella calma, fino a 10-24 px col vento forte,
           più forte quando passa una raffica e meno fra una e l'altra: le chiome si piegano e tornano */
      /* 14/11, mezz'ora dopo (Maurizio: «adesso però le chiome si muovono poco niente, bisogna riaumentare di qualcosina senza
         esagerare»): +50% (era 1,5 + 10 n). Resta poco più di metà di prima; dove si muove (solo le chiome vere) non cambia */
      float amp = (2.475 + 16.5 * n) * vt.b;   /* 14/11: era 10 + 16 n (alzato tre volte quando le immagini erano morbide); nel pomeriggio 2,25 + 15 n, poi +10% (Maurizio: «mi sembrano troppo ferme le chiome, le farei muovere un 10% in più») */
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
      float verdeS = max(mix(fogliame(mosso), smoothstep(.4, .12, dot(mosso, vec3(.299, .587, .114))), notteA), smoothstep(.45, .15, dot(mosso, vec3(.299, .587, .114))) * .85)
                   * smoothstep(.04, .45, texture2D(uAlberiM, clamp(cropD.xy + (p + d) * cropD.zw, .0005, .9995)).g);   /* si disegna spostata solo una chioma */
      vec2 nmS = profCG(dep, cropD, p + d, haDep, gx, gy);
      float nS = nmS.x, cieloS = haDep > .5 ? nmS.y * smoothstep(.85, .45, p.y + d.y) : sky;
      float w = max(verdeS * smoothstep(.1, .4, nS), verde * (1. - cieloS));
      c = mix(c, mosso, w);
      /* ⚠ 9/11 (Maurizio: «con la nebbia c'è ancora la sensazione di alone, intorno a cipresso e campanile»): la chioma
         si spostava ma la profondità restava dov'era. Dove il cipresso se n'era andato si vedeva lo sfondo con la
         nebbia leggera del cipresso (una striscia scura accanto), e dove arrivava prendeva la nebbia fitta dello sfondo.
         Ora anche la profondità (quindi nebbia, foschia, cielo) segue quello che si vede */
      n = mix(n, nS, w);
      dSp = d * w;
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
    /* ⚠ 9/11 (Maurizio: «con la nebbia c'è ancora la sensazione di alone, intorno a cipresso e campanile»): la maschera
       della nebbiolina si leggeva dove il cipresso stava, il pixel nitido che la spegne dove il cipresso è adesso
       (spostato dal vento): accanto alla sagoma restava una riga scura staccata di qualche pixel, che la seguiva.
       Ora anche la maschera si legge dove sta quello che si vede (pS) */
    /* ⚠ 19/11 sera · (Maurizio: «Puoi alzare al massimo possibile la risoluzione in alba, giorno e tramonto?»). Misurato
       sul TV (banco, taverna al tramonto): 25 ms a immagine in 4K, 22 al 90%, 18 all'80%: per 60 immagini al secondo ne
       servono meno di 16,7, e reggeva solo l'80%. La nebbiolina e la foschia lontana qui sotto leggevano nove volte le
       immagini a ogni punto anche quando sono spente (dentro la pagina le spegne: uNebV 0) e non cambiavano niente: ora
       si fanno solo se accese. Fuori, con la nebbiolina accesa, tutto come prima */
    if (uNebV > .001){
    vec2 pS = p + dSp;
    vec3 cbm = haF > .5 ? fotoL(fer, crop, pS, 2.) : fotoL(img, crop, pS, 2.);
    /* e intorno alle sagome ferme (campanile, pietra calda e chiara): nell'immagine sfocata la torre «sbordava» sul cielo
       e sulla nebbia accanto, che lì sembravano calde e la nebbiolina non ci andava: una fascia scura tutto intorno.
       Si guarda anche poco più in là (destra, sinistra, sopra) e vale il punto più «da nebbia» (chiaro e freddo).
       Sull'oggetto stesso i veli restano spenti dal pixel nitido, più sotto */
#ifndef LEGGERO   /* sul Raspberry no: tre letture in più per ogni pixel, e la sua scheda video cade facilmente */
    { vec2 oM = vec2(4.5 / uPix.x, 0.), oV = vec2(0., 4.5 / uPix.y);
      vec3 cL = haF > .5 ? fotoL(fer, crop, pS - oM, 2.) : fotoL(img, crop, pS - oM, 2.);
      vec3 cR = haF > .5 ? fotoL(fer, crop, pS + oM, 2.) : fotoL(img, crop, pS + oM, 2.);
      vec3 cU = haF > .5 ? fotoL(fer, crop, pS - oV, 2.) : fotoL(img, crop, pS - oV, 2.);
      vec3 W3 = vec3(.299, .587, .114);
      float sb = dot(cbm, W3) + 2. * (cbm.b - cbm.r), sL = dot(cL, W3) + 2. * (cL.b - cL.r), sR = dot(cR, W3) + 2. * (cR.b - cR.r), sU = dot(cU, W3) + 2. * (cU.b - cU.r);
      if (sL > sb){ cbm = cL; sb = sL; }
      if (sR > sb){ cbm = cR; sb = sR; }
      if (sU > sb) cbm = cU; }
#endif
    float nB = haDep > .5 ? fotoL(dep, cropD, pS, 1.).r : n;   /* anche la profondità sfocata: quella nitida è granulosa e la soglia saltava da un pixel all'altro */
    float lm = dot(cbm, vec3(.299, .587, .114)), mxm = max(cbm.r, max(cbm.g, cbm.b));
    float satm = (mxm - min(cbm.r, min(cbm.g, cbm.b))) / max(mxm, .01), sogliaM = mix(.4, .1, uNotte) - mix(.2, .06, uNotte) * smoothstep(.05, .3, nB);   /* 8/11: di notte la nebbia è grigio-blu scura (~0,1–0,2) */   /* 5/11: la nebbia vicina, in ombra, è più scura (grigio-azzurro ~0,35): prima restava fuori */
    /* la nebbia è azzurrina o grigia (blu almeno quanto il rosso): la pietra chiara del castello, calda, resta ferma */
    /* ⚠ 14/11 sera · LA NEBBIOLINA DI NOTTE (controllo sugli schermi veri: di notte la nebbia delle valli e del fiume era
       ferma, e i veli passavano invece sui campi chiari di luna). Nei dipinti notturni tutto è blu e molto colorato: la
       nebbia ha saturazione 0,6 e la prova «poco colorata» la scartava, mentre i campi alla luna, i meno colorati,
       passavano loro. E dal solo colore, di notte, la nebbia non si distingue: sono blu e chiari come lei anche la
       roccia sotto il paese, i muri delle cascine, i campi lontani (provato: i veli finivano lì).
       Ma il paesaggio è lo stesso a tutte le ore: di notte la nebbia sta dove sta di giorno. Dov'è di giorno lo dice
       il blu della maschera delle chiome (mascheraAlberi, dall'immagine del giorno, con la stessa prova di qui).
       Nient'altro sul colore della notte (provato anche «e in più blu»: toglie due macchioline e basta, e un dipinto
       notturno con la nebbia grigia resterebbe fermo); che il punto sia abbastanza chiaro e non caldo (una finestra
       accesa) lo guardano le prove di prima e di dopo, con le soglie della notte.
       Senza l'immagine del giorno (uNebG 0) resta la prova del blu (oltre 0,10–0,16 di blu − rosso). Al tramonto e
       all'alba niente cambia, e nemmeno con la notte finta (lì l'immagine è quella del giorno, scurita dopo) */
    float notteV = smoothstep(.3, .9, uNotte) * (1. - uNotteFinta);
    float coloreNeb = (1. - smoothstep(.1, .34, satm)) * smoothstep(-.05, .03, cbm.b - cbm.r);
    if (notteV > .001){
      float diNotte = uNebG > .5 ? texture2D(uAlberiM, clamp(cropD.xy + pS * cropD.zw, .0005, .9995)).b : smoothstep(.10, .16, cbm.b - cbm.r);
      coloreNeb = mix(coloreNeb, diNotte, notteV);
    }
    float neb = smoothstep(sogliaM - .06, sogliaM + .22, lm) * coloreNeb * (1. - smoothstep(.75, .95, nB)) * (haDep > .5 ? smoothstep(.05, .1, fotoL(dep, cropD, pS, 2.5).r) : 1. - sky) * uNebV;   /* cielo anche lui dalla profondità sfocata: sulle colline lontane quella nitida faceva fiocchi */   /* 5/11: anche la nebbia in primo piano (Maurizio: «sotto l'abbazia sembra immobile») */
    /* ⚠ 10/11 (Maurizio, foto della TV: «sullo sfondo si vedono tutti questi puntini»): la nebbiolina arrivava fino alle
       colline più lontane (profondità 0,03-0,07) e alla pietra in ombra dell'abbazia (grigio-azzurra come la nebbia):
       lì il colore passa da «nebbia» a «non nebbia» a chiazze, e i veli facevano cavolfiori bianchi sopra i crinali e
       macchie scure sul fianco dell'abbazia. Ora sotto 0,05 di profondità niente nebbiolina, piena da 0,1 (la soglia
       sulla profondità molto sfocata: niente gradini): la foschia sull'orizzonte resta quella dipinta, ferma e pulita;
       quella nelle valli e sul fiume (più vicina) si muove come prima */
    if (haDep > .5) neb *= 1. - fotoL(dep, cropD, pS, 1.).b;   /* 10/11: niente veli sugli oggetti (abbazia, castello, torri) */
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
      /* 14/11 (Maurizio: «rendiamo più visibile il movimento della foschia»): scorre un decimo più svelta (era .05 e .06; le prime prove, una volta e mezza e poi un quarto, per Maurizio erano troppo veloci),
         e da metà distanza in là i veli sono un po' più chiari e più staccati dal fondo, i filamenti più fitti */
      float tva = uT * .055 + uTV * .066 + rsM * .3;   /* 9/11: era uT * (.05 + .06 × vento): vedi uTV */   /* ⚠ 5/11: una velocità sola per tutti i punti: moltiplicare il tempo per un valore diverso punto per punto, dopo qualche minuto, dava righe e puntini (G10) */      /* quanto scorre la trama (sue unità al secondo): un banco attraversa sé stesso in 12-25 s (5/11: più viva) */
      /* 5/11 (Maurizio: «quella sotto è ancora poco viva»): la nebbia vicina scorre più svelta (come dal vero: più è
         vicina, più strada fa sullo schermo) e ha banchi più grandi e più contrastati */
      float vicinaM = smoothstep(.1, .35, nB);
      float f2 = fbmP(vec2(ti.x * mix(2.4, 1.6, vicinaM) * 1.7 + tP(tva * 1.7) + 5.2, ti.y * mix(10., 6., vicinaM) * 1.7 + 1.3 - tP(uT * .055)));
      /* ⚠ 5/11 (Maurizio: «è fake e va intorno alle sagome degli oggetti»): niente più spostamento dell'immagine dentro la
         nebbia: spostava anche i bordi di alberi e cipressi e lasciava sagome doppie ondeggianti. La nebbia si muove
         con i veli e i filamenti che passano sopra */
      /* veli: banchi più chiari, lunghi e bassi, che passano e si disfano */
      float velo = fbmP(vec2(ti.x * mix(3.3, 2.2, vicinaM) + tP(tva * 1.6), ti.y * mix(15., 8., vicinaM) + tP(uT * .08))) * .65 + f2 * .35;
      float piuV = 1. - vicinaM;   /* 14/11: più decisi da metà distanza in là; in primo piano come prima (lì la maschera prende anche le foglie chiare degli ulivi) */
      float wv = smoothstep(.38 + .04 * piuV, .7 - .05 * piuV, velo);   /* 14/11: da metà distanza in là il bordo dei veli è un po' più netto: si vede che passano */
      vec3 bianco = vec3(lm) * vec3(.97, .99, 1.03) * (mix(1.3, 1.55, uNotte) + .12 * piuV) + .06 * (1. - uNotte) + vec3(.008, .012, .02) * uNotte;   /* dal colore sfocato di qui (non da quello spostato: faceva venature) */
      c = mix(c, bianco, neb * wv * mix(.85, 1., vicinaM) * (1. - .45 * rgM));   /* raffica: i veli si strappano */
      c *= 1. - neb * (1. - wv) * (.22 + .12 * vicinaM + .06 * piuV);   /* fra un velo e l'altro la nebbia si dirada un poco: respira */
      /* filamenti: veli sottili e più svelti che attraversano i banchi (si vede che la nebbia scorre) */
      float fil = fbmP2(vec2(ti.x * mix(5.5, 3.5, vicinaM) + tP(tva * 2.6), ti.y * mix(24., 13., vicinaM) - tP(uT * .03)));
      c = mix(c, bianco, neb * smoothstep(.5 - .04 * piuV, .85 - .05 * piuV, fil) * (.4 + .14 * piuV + .35 * rgM));   /* raffica: i filamenti frustano */
    }
    /* ⚠ 14/11 · FOSCHIA LONTANA VIVA (Maurizio: «rendiamo più visibile il movimento della foschia, così si capisce a prima
       vista che è un'immagine viva e non un quadro»). I banchi bianchi lontani, dietro l'abbazia, erano fermi del tutto:
       dal 10/11 la nebbiolina viva non va oltre 0,05–0,1 di profondità, perché lì i suoi veli facevano puntini e
       cavolfiori (la maschera a colori cambiava a chiazze). La foschia lontana si muove in un altro modo, senza maschere
       a colori: veli larghi e morbidi scorrono piano verso sinistra e portano il colore sfocato del posto (il bianco del
       banco accanto, il rosa al tramonto, il blu di notte), schiarito un poco. Sopra un banco quasi non si vedono; dove
       il banco finisce contro una collina il velo la copre e poi la scopre: i bordi dei banchi si muovono, come la
       foschia vera vista da lontano; fra un velo e l'altro quello che è più chiaro dei dintorni (il banco) si dirada un
       filo. Tutto letto sfocato largo (0,4–0,8% dell'immagine, uguale su ogni schermo): niente puntini. Non tocca il
       cielo (si ferma sotto il crinale) né gli oggetti (abbazia, torri). */
#ifndef LEGGERO
    { float bL = log2(max(2., .004 * uPix.x / max(crop.z, .01)));
      vec3 dW = haDep > .5 ? fotoL(dep, cropD, pS, bL) : vec3(1., 0., 0.);
      vec3 cW = haF > .5 ? fotoL(fer, crop, pS, bL + 1.) : fotoL(img, crop, pS, bL + 1.);
      float lontana = (1. - smoothstep(.03, .075, dW.r)) * (1. - smoothstep(.02, .3, dW.g)) * (1. - dW.b) * step(.5, haDep) * min(1., uNebV);
      if (lontana > .01){
        vec2 ti = cropD.xy + p * cropD.zw;
        /* 14/11 sera (Maurizio: «rallenta ancora leggermente la foschia che si muove»): un ottavo più lenta (era .08 e .13) */
        float v1 = fbmP2(vec2(ti.x * 4. + tP(uT * .07 + uTV * .053), ti.y * 26. - tP(uT * .012) + 3.7));
        float v2 = fbmP2(vec2(ti.x * 7. + tP(uT * .115 + uTV * .088) + 11.3, ti.y * 44. + tP(uT * .02)));
        float vl = smoothstep(.42, .72, v1 * .65 + v2 * .35);
        float lW = dot(cW, vec3(.299, .587, .114)), lC = dot(c, vec3(.299, .587, .114));
        /* ⚠ 14/11 sera (controllo sugli schermi veri, foto a 4 s: le file di cipressi sul fianco del colle cambiavano più
           della foschia dietro). La profondità sfocata non vede le sagome sottili davanti al lontano, e il velo, che
           porta il colore chiaro della foschia, le schiariva. Una sagoma scura davanti alla foschia (meno di metà
           della luce che ha intorno) non si vela: il velo le passa dietro. I crinali lontani, poco più scuri della
           foschia (oltre 0,72), si velano come prima */
        float davanti = smoothstep(.5, .72, lC / max(lW, .02));
        c *= 1. - lontana * (1. - vl) * .09 * smoothstep(1.02, 1.3, lC / max(lW, .02));
        c = mix(c, cW * mix(1.12, 1.3, uNotte) + .03 * (1. - uNotte), lontana * vl * .6 * davanti);
      }
    }
#endif
    }   /* uNebV */
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
/* ⚠ 10/11 · PIPISTRELLO (Maurizio: «la forma sembra più una rondine»). Prima era l'ala dell'uccello un po' più grossa:
   punte aguzze all'indietro, cioè una rondine. Il pipistrello ha ali di membrana tese fra le dita: bordo d'attacco
   dalla spalla al polso e poi alla punta, e dietro il bordo a festoni (archi rientranti fra una punta di dito e
   l'altra) che torna fino ai piedi; corpo tozzo, testa con due orecchie, niente coda. Battendo, in alto l'ala si
   raccoglie un po' (si accorcia) e in basso si apre tutta. Qui la mezza ala è fatta di triangoli di membrana, coi
   festoni scavati da cerchi; tutto in pixel, s = mezza apertura */
float triangolo(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0., 1.);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0., 1.);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0., 1.);
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), sg * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), sg * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), sg * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
/* festone: scava un arco rientrante fra due punte (cerchio fuori dal bordo, che morde la membrana) */
float festone(float d, vec2 q, vec2 a, vec2 b, vec2 fuori){
  float l = length(b - a), r = l * .7;
  vec2 c = (a + b) * .5 + fuori * (r - l * .13);
  return max(d, -(length(q - c) - r));
}
float pipistrello(vec2 q, float s, float ali, float sc){
  q.x = abs(q.x);
  float su = clamp(ali, -1., 1.), ap = 1. - .28 * max(0., su);           /* in alto l'ala si raccoglie */
  su = su > 0. ? su : su * .55;                                          /* in basso scende meno di quanto sale (non un mantello) */
  vec2 S = vec2(.07, -.1) * s, W = vec2(.46 * ap, -.06 - .26 * su) * s, T = vec2(1. * ap, .04 - .5 * su) * s;
  vec2 F1 = vec2(.86 * ap, .16 - .36 * su) * s, F2 = vec2(.6 * ap, .34 - .18 * su) * s, F3 = vec2(.33 * ap, .37 - .06 * su) * s, P = vec2(.08, .3) * s;
  float d = triangolo(q, S, W, P);
  d = min(d, triangolo(q, W, T, F1)); d = min(d, triangolo(q, W, F1, F2));
  d = min(d, triangolo(q, W, F2, F3)); d = min(d, triangolo(q, W, F3, P));
  /* i festoni del bordo di uscita, verso fuori (in giù e un po' in fuori) */
  d = festone(d, q, T, F1, normalize(vec2(F1.y - T.y, T.x - F1.x)));
  d = festone(d, q, F1, F2, normalize(vec2(F2.y - F1.y, F1.x - F2.x)));
  d = festone(d, q, F2, F3, normalize(vec2(F3.y - F2.y, F2.x - F3.x)));
  d = festone(d, q, F3, P, normalize(vec2(P.y - F3.y, F3.x - P.x)));
  /* il braccio (bordo d'attacco più scuro e netto) */
  d = min(d, min(segmento(q, S, W), segmento(q, W, T)) - .03 * s);
  /* corpo tozzo, testa e orecchie */
  d = min(d, (length((q - vec2(0., .06 * s)) / (vec2(.1, .24) * s)) - 1.) * .1 * s);
  d = min(d, length(q - vec2(0., -.2 * s)) - .085 * s);
  d = min(d, triangolo(q, vec2(.02, -.24) * s, vec2(.075, -.24) * s, vec2(.06, -.31) * s));
  return 1. - smoothstep(-.35, .75, d);
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
    a = max(a, (c.z > 1.5 ? pipistrello(q, s, b.w, sc) : uccello(q, s, b.w, c.z, sc)) * c.y);
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
  float k = 1. + uOcchio.z * .15;   /* come il paesaggio (vedi sopra) */
  for (int i = 0; i < 8; i++){
    if (float(i) >= uNFumo) break;
    vec4 F = uFumo[i];
    float forzaF = uFumoI[i];
    /* dove appare il comignolo con la prospettiva (lo stesso spostamento del paesaggio a quella profondità) */
    vec2 s = F.xy; float sh = uLato * .012 * (F.w - .35) + spostaVivo(F.x, F.w);
    s = (s - .5) / k + .5; s.x -= sh;
    /* ⚠ 11/11 (Maurizio: «sistemerei i fumi che escono dalle case per renderli più realistici»). Prima la «canna» era un
       decimo del tetto senza limite: su una casa grande (tetto 0,1 dell'immagine) il pennacchio saliva per 600 pixel,
       dritto e bianco come un faro. Ora la canna ha un tetto (5 px su 1000), il pennacchio è più corto, più
       trasparente, si apre e si sfilaccia prima, e ondeggia di più salendo (due correnti, una lenta e una svelta) */
    float scF = max(1., uPix.y / 1000.);
    float u = clamp(F.z * uPix.x * .07, 1.3 * scF, 5. * scF);
    vec2 dq = (uv - s) * uPix / u;
    float h = -dq.y, L = 28.;
    if (h < -1.5 || h > L || abs(dq.x) > L * 1.3) continue;
    float semi = h1(vec2(float(i) * 7.3, F.x * 91.));
    float rgF = uRaf.x >= 0. ? rafEnv(rafTau(s)) * rafCella(s) * uRaf.z : 0.;
    float b = .18 + uVento * 1.25;                                    /* quanto si piega */
    float cx = -b * h * h / L - (rumore(vec2(h * .07 - uT * .3, semi * 40.)) - .5) * h * .5 - (rumore(vec2(h * .16 - uT * .7, semi * 13.)) - .5) * h * .22 - rgF * h * 1.1;   /* raffica: il pennacchio si sdraia di traverso (piegato a parabola faceva archi) */
    float wd = .55 + h * .3 * (1. + uVento * .6 + rgF * .7);
    float x = (dq.x - cx) / wd;
    float pr = exp(-x * x * 1.8);
    if (pr < .01) continue;
    vec2 q = vec2(x * .9, h * .2 - uT * .85) + semi * 17.;
    float nn = rumore(q) * .55 + rumore(q * 2.1 + 3.7) * .3 + rumore(q * 4.3 + 9.1) * .15;
    float d = pr * smoothstep(.34, .78, nn + pr * .2) * smoothstep(-1.5, 1.2, h) * (1. - smoothstep(L * .2, L, h)) * (1. - h / L * .55) * (1. - rgF * smoothstep(3., 15., h) * .85);   /* e si strappa: resta solo vicino al comignolo */
    tot = max(tot, d * forzaF);
  }
  return tot * uFumoA;
}

void main(){
  gFiamma = 0.; gFiammaW = 0.;
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec3 col = vec3(0.); float n = .5, sky = 0., alfa = 1.;
  float l0 = 0.; vec3 stelle = vec3(0.);
#ifndef SENZA_NUVOLE
  gVentoA = 128. / 255.; gVentoRG = vec3(.5, 0., 0.);
#endif
  if (uHaImg > .5){
    float n0, s0; gIns = 1.; gLuceF = 1.; gLuciRel = vec3(1.); vec3 c0 = paesaggio(uImg0, uImg0b, uVmix, uDep0, uCrop0, uCropD0, uHaDep0, uMovimento0, uCielo0, uCieloM0, uFermo0, uHaFermo0, uRap0, uHaRap0, uv, n0, s0, uLuciM0);
    if (uMix > .001){
      float n1, s1; gIns = 0.; vec3 c1 = paesaggio(uImg1, uImg1, 0., uDep1, uCrop1, uCropD1, uHaDep1, uMovimento1, uCielo1, uCieloM1, uFermo1, uHaFermo1, uRap0, 0., uv, n1, s1, uLuciM1);
      col = mix(c0, c1, uMix); n = mix(n0, n1, uMix); sky = mix(s0, s1, uMix);
    } else { col = c0; n = n0; sky = s0; }
    float scP = max(1., uPix.y / 1000.);
    stelle = vec3(0.);
    /* ombre delle nuvole: di giorno scorrono sul paesaggio insieme al cielo panoramico (calcolate col vento) */
    /* ⚠ 14/11 sera: il quarto canale del vento porta due cose che non si incontrano mai: sotto l'orizzonte l'ombra delle
       nuvole sul terreno, sopra l'orizzonte quanta nuvola del cielo che scorre c'è (per le stelle). 128/255 = niente, sotto
       l'ombra, sopra la nuvola: a tutte le ore, senza passaggi di consegne fra giorno e notte. Non si rilegge: è quello
       della lettura che paesaggio() fa già per gli alberi (gVentoA). Così le stelle dietro le nuvole non costano niente al
       disegno principale, che anzi ha una lettura in meno di prima (le ombre ne avevano una loro): la prima versione
       (5.59) ne aveva una in più a ogni punto, anche di giorno, e sul TV bastava a far cadere il 90% di risoluzione
       (misurato: con quel pezzo il 90% cadeva in due minuti, senza ha tenuto sette minuti senza una caduta) */
#ifdef SENZA_NUVOLE
    /* «senza nuvole» (vedi Vista, senzaNuvole): il disegno com'era prima della 5.59, con le ombre lette a parte */
    if (uOmbre > .01 && uHaVento > .5){ float om = texture2D(uVentoT, vec2(vUv.x, 1. - vUv.y)).a; col *= 1. - om * .17 * uOmbre * (1. - sky); }
#else
    float dV = gVentoA * 255. - 128.;
    float ombraV = 0., nuvV = 0.;
    if (uDentro > .5 && uDentro < 1.5){   /* 2 = un interno con la luce dei fuochi spenta (prova «fuochi») */
      col *= 1. + gFiamma * .45;   /* 15/11: le fiamme segnate tremano anche di luce */
      /* ⚠ 14/11 sera · LA LUCE DEI FUOCHI, DENTRO (Maurizio, davanti alla taverna di giorno: «Bisogna aumentare movimento
         anche di giorno»). In un interno non ci sono nuvole, chiome, foschia e uccelli: di vivo restava solo il video
         (le fiamme, piccole). Ora tutto quello che è illuminato dai fuochi (muri attorno alle torce, cucina, riflessi su
         pavimento e tavoli: il caldo e chiaro dell'immagine) respira con la fiamma, a tutte le ore. Il respiro è un
         campo morbido (ogni torcia ha il suo, senza quadretti: il tremolio a cellette della notte, sui muri grandi,
         faceva un mosaico) calcolato nel passaggio del vento, che dentro non ha altro da portare in questo canale */
      float lumD = dot(col, vec3(.299, .587, .114));
      float caldoD = smoothstep(.2, .55, col.r) * smoothstep(1.08, 1.34, col.r / max(col.g, .01)) * smoothstep(1.1, 1.5, col.g / max(col.b, .01));
      /* il cuore delle fiamme (torce, candele, camino): chiaro e molto più rosso che blu. La luce delle finestre è chiara
         uguale ma quasi senza colore (misurato sulla taverna: fiamme r-b da .35 a .58, finestre .03-.05, pavimento al sole .11) */
      float fiammaD = smoothstep(.6, .8, col.r) * smoothstep(.22, .34, col.r - col.b);
      /* 14/11 sera, più tardi (Maurizio: «Anima di più la taverna di giorno»): il respiro è più ampio (.3, era .2) e prende
         anche le fiamme */
      col *= 1. + (dV / 127.) * (.3 * caldoD * (1. - fiammaD) + .3 * fiammaD) * gLuceF;   /* 21/11: a fuochi spenti la stanza non respira */
      /* ⚠ LA LUCE DI FUORI, DENTRO («Anima di più la taverna di giorno»): quello che entra dalle finestre (i vetri, i
         raggi sul muro, la chiazza sul pavimento: chiaro e quasi senza colore) non sta più fermo.
         Nei raggi il pulviscolo scende piano, a banchi (tre strati di grana che scivolano verso il basso), e tutta la luce
         di fuori cresce e cala lenta, come quando passano le nuvole. Di notte no */
      float fuoriD = smoothstep(.42, .6, lumD) * (1. - smoothstep(.12, .24, col.r - col.b)) * (1. - smoothstep(.3, .9, uNotte));
      /* 16/11 · il fascio di luce di una finestra in questo punto (VENTO_FRAG e mascheraFasci): di notte no */
      float fasF = uFascioD.z > .5 ? gVentoRG.y * (1. - smoothstep(.3, .9, uNotte)) : 0.;
      /* ⚠ 20/11 (Maurizio: «aumenta un po' la luminosità di giorno, aumentando la luce che entra dalle finestre»): quello che
         è illuminato da fuori (la chiazza sul pavimento, i raggi, le panche e le tovaglie al sole; i vetri meno, sono già
         chiari) diventa più luminoso, nel dipinto e nel video insieme; le fiamme e i loro riflessi caldi no */
      /* 21/11 (Maurizio: «nuvoloso, nebbia, pioggia, etc dovrebbero cambiare la luce che viene da fuori»): senza sole la luce in più cala */
      /* ⚠ 21/11, 10:18 (Maurizio: «su nuvoloso farei che si attenuano e non che spariscono i raggi del sole. Quasi spariscono con
         nebbia. Spariscono con pioggia, temporale o neve. Ed anche la luminosità della stanza varia leggermente»): il sole che
         entra è circa la metà col nuvoloso, un decimo con la nebbia, niente con pioggia, temporale e neve; tutta la stanza
         un po' più scura (dal 3-4% del nuvoloso al 12% del temporale), meno dove la illuminano i fuochi */
      float soleF = clamp(1. - uFuori.x * .9, 0., 1.) * clamp(1. - uFuori.w, 0., 1.) * clamp(1. - uFuori.y * 1.25, 0., 1.) * clamp(1. - uFuoriN * 1.1, 0., 1.);
      float stanzaK = min(.13, .8 * (.06 * uFuori.x + .05 * uFuori.w + .06 * uFuori.y + .04 * uFuori.z + .03 * uFuoriN));
      col *= 1. - stanzaK * (1. - .6 * caldoD);
      if (uFuoriK > .001) col *= 1. + uFuoriK * (.2 + .8 * soleF) * max(fuoriD * (1. - .7 * smoothstep(.6, .72, lumD)), fasF);
      if (fuoriD > .02 || fasF > .01){
        float vetroD = smoothstep(.6, .72, lumD);
        /* ⚠ 16/11 (Maurizio: «rendiamo il pulviscolo e la luce che entra dalle finestre più viva»): il respiro è più ampio
           e ogni tanto passa una nuvola davanti al sole (la luce di fuori cala per una decina di secondi, poi torna: in
           media una volta ogni due minuti). Vale per tutto quello che viene da fuori, vetri meno (il cielo resta chiaro) */
        float respiro = rumore(vec2(uT * .13, 5.7)) * .6 + rumore(vec2(uT * .31, 9.2)) * .4;
        float passa = smoothstep(.6, .82, rumore(vec2(uT * .035, 2.3)));
        float luceF = (respiro - .5) - passa * .45;
        float bello = soleF;   /* col brutto tempo niente fasci né granelli (21/11: anche con nebbia e neve) */
        vec3 lc = uFascioD.z > .5 ? uFascioC : vec3(1., .96, .86);
        if (fuoriD > .02){
          vec2 qd = uv * vec2(uAspetto, 1.) * 16.;
          /* 16/11: i banchi scorrono quasi il doppio più svelti */
          float pulv = rumore(qd + vec2(uT * .14, -uT * .28)) * .5 + rumore(qd * 2.1 + vec2(-uT * .12, -uT * .46) + 7.3) * .3 + rumore(qd * 4.3 + vec2(uT * .21, -uT * .66) + 3.1) * .2;
          /* il pulviscolo sta nell'aria (raggi, chiazza sul pavimento), non sui vetri: i vetri, più chiari, seguono solo il respiro */
          col *= 1. + fuoriD * (1.1 * uPolvK * (pulv - .5) * (1. - vetroD) * (.3 + .7 * bello) + .55 * luceF * (1. - .5 * vetroD) * (.4 + .6 * bello));   /* sul TV vero, con .55 e .25, in dieci secondi i vetri cambiavano dell'1,5%: non si vedeva */
        }
        /* 16/11 · nel fascio la luce nell'aria cresce e cala col respiro, e la polvere ci fa banchi che girano e scivolano */
        if (fasF > .01) col += fasF * lc * (.15 * uPolvK * (gVentoRG.x - .5) * 2. + .09 * luceF) * bello;
        /* ⚠ 15/11 (Maurizio: «aumenta un po' gli effetti particellari della luce che viene da fuori»): oltre ai banchi di
           polvere, i granelli: puntini che si accendono quando girano nella luce, ognuno col suo ritmo.
           ⚠ 16/11 («più viva»): anche nei fasci (prima solo nelle chiazze chiare), più fitti, tre strati (lontani fini,
           medi, e pochi vicini grandi e sfocati), ognuno vaga per conto suo mentre scende, e ogni tanto uno brilla */
        float raggio = max(fuoriD * (1. - vetroD) * (uFascioD.z > .5 ? .4 : 1.), fasF);   /* coi fasci, i granelli stanno soprattutto lì (non sulle tovaglie chiare) */
        if (raggio > .02){
          float gran = 0.;
          for (int g = 0; g < 3; g++){
            float fg = float(g), gr = step(1.5, fg);
            vec2 qm = uv * vec2(uAspetto, 1.) * mix(120. - fg * 48., 34., gr) + vec2(uT * (.16 - fg * .04), -uT * (.42 - fg * .08)) + fg * 17.3;
            vec2 cella = floor(qm), fr = fract(qm) - .5;
            float h = fract(sin(dot(cella + fg * 31.7, vec2(127.1, 311.7))) * 43758.5453), h2 = fract(h * 91.7 + .13);
            vec2 sp = (vec2(fract(h * 13.7), fract(h * 71.3)) - .5) * mix(.4, .2, gr)
                    + vec2(sin(uT * (.35 + .5 * h2) + h * 40.), cos(uT * (.3 + .45 * h) + h2 * 30.)) * mix(.14, .1, gr);
            float tw = .5 + .5 * sin(uT * (.9 + 2.3 * h2) + h * 40.);
            float tw2 = tw * tw, acceso = tw2 * (.6 + .4 * tw2 * tw2);   /* girando, ogni tanto brilla */
            float pt = smoothstep(mix(.15, .28, gr), mix(.02, 0., gr), length(fr - sp));
            gran += pt * acceso * mix(step(.62, h) * (1. - fg * .25), step(.88, h) * .4, gr);
          }
          col += raggio * gran * .6 * uPolvK * lc * max(0., 1. + .8 * luceF) * bello;
        }
        /* ⚠ 15/11 sera · IL TEMPO DI FUORI, DALLE FINESTRE (Maurizio: «pioggia sulle finestre»: quando il meteo è pioggia,
           luce più grigia e gocce sui vetri). Coperto e pioggia spengono i raggi e la chiazza sul pavimento e ingrigiscono
           i vetri; sui vetri chiari le gocce scendono a righe, ognuna col suo passo, e qualche goccia ferma luccica; il
           lampo del temporale accende vetri e raggi (il tuono si sente, js/bard.js) */
        float brutto = max(max(uFuori.x * .6, uFuori.y), max(uFuori.w * .85, uFuoriN * .7));   /* 21/11: col nuvoloso meno (era .8) */
        if (brutto + uLampo > .005){
          /* 21/11: il cuore chiaro delle fiamme (camino, torce: chiaro e appena caldo) non è luce di fuori: col brutto tempo diventava azzurrino */
          float fuoriB = fuoriD * (1. - smoothstep(.05, .12, col.r - col.b) * smoothstep(.62, .75, lumD)) * (1. - smoothstep(.02, .2, gFiamma));
          float vetro = smoothstep(.6, .72, lumD);
          /* ⚠ 21/11 (sul TV, neve all'alba: le punte delle fiamme di torce e camino diventavano azzurre): se il file dei punti dice dove
             sono i vetri, il tempo di fuori tocca solo i vetri, i fasci di luce e, sotto il 60% dell'altezza, le chiazze di luce di fuori */
          if (uNVetri > .5){
            float vR = 0.;
            for (int iv = 0; iv < 4; iv++){
              if (float(iv) < uNVetri){
                vec4 bv = uVetri[iv]; vec2 qv2 = (gTiR - bv.xy) / max(bv.zw - bv.xy, vec2(1e-4));
                vR = max(vR, smoothstep(0., .04, min(min(qv2.x, 1. - qv2.x), min(qv2.y, 1. - qv2.y))));
              }
            }
            vetro = vR * smoothstep(.35, .55, lumD);
            fuoriB = max(vetro, max(fasF * .8, step(.6, gTiR.y) * fuoriD * (1. - smoothstep(.02, .2, gFiamma))));
          }
          col = mix(col, vec3(lumD) * vec3(.9, .94, 1.), fuoriB * brutto * .8);   /* 21/11: grigio appena freddo (era .86/.93/1.06: il cuore bianco dei fuochi diventava azzurro) */
          col *= 1. - fuoriB * brutto * (.55 * (1. - vetro) + .38 * vetro);
          if (uFuori.y > .01 && vetro > .02){
            vec2 qg = uv * vec2(uAspetto, 1.) * vec2(150., 1.);
            float cg = floor(qg.x), hg = fract(sin(cg * 91.7 + 3.1) * 43758.5453);
            float fxg = fract(qg.x) - .5;
            float yg = fract(uv.y * (2.5 + 3. * hg) - uT * (.18 + .5 * hg) + hg * 13.);
            float scia = smoothstep(.34, .06, abs(fxg)) * smoothstep(.1, .9, yg) * step(yg, .93) * step(.5, hg);
            float testa = smoothstep(.36, .0, abs(fxg)) * smoothstep(.045, .0, abs(yg - .9)) * step(.5, hg);
            vec2 qf = uv * vec2(uAspetto, 1.) * 110.; vec2 cf = floor(qf);
            float hf = fract(sin(dot(cf, vec2(41.3, 289.1))) * 43758.5453);
            float ferma = smoothstep(.34, .12, length(fract(qf) - .5 - (vec2(fract(hf * 17.), fract(hf * 31.)) - .5) * .4)) * step(.78, hf);
            float pg = vetro * fuoriB * min(1., uFuori.y * 1.3);
            col *= 1. - pg * (.5 * scia + .38 * ferma);
            col += pg * (.6 * testa + .3 * ferma) * vec3(.95, .97, 1.);
          }
          /* ⚠ 21/11 · QUELLO CHE SI VEDE FUORI (Maurizio: «dovrebbe vedersi qualcosa fuori dalla finestra. Per pioggia e
             temporale si vede, per il resto non mi pare»). Sui vetri chiari: nuvoloso, banchi di nuvole grigie che passano
             piano; nebbia, il fuori si perde in un bianco latte che si muove adagio (il disegno degli alberi sparisce);
             neve, fiocchi che scendono ondeggiando, due grandezze. */
          vec2 qv = uv * vec2(uAspetto, 1.);
          if (uFuori.x > .03 && vetro > .02){
            float nv = rumore(qv * 3. + vec2(uT * .022, .3)) * .6 + rumore(qv * 7. + vec2(uT * .04, 1.7)) * .4;
            col *= 1. - vetro * fuoriB * uFuori.x * .4 * smoothstep(.38, .78, nv);
          }
          if (uFuori.w > .02 && vetro > .02){
            float nb = rumore(qv * 4. + vec2(uT * .03, -uT * .01)) * .55 + rumore(qv * 9. + vec2(-uT * .05, 3.1)) * .45;
            vec3 latte = vec3(lumD) * vec3(.97, .98, 1.) * (.9 + .22 * nb);
            col = mix(col, latte, vetro * fuoriB * min(1., uFuori.w * 1.05));
          }
          if (uFuoriN > .02 && vetro > .02){
            float fi = 0.;
            for (int l = 0; l < 2; l++){
              float sc = l == 0 ? 38. : 70., ve = l == 0 ? .055 : .035;
              vec2 qs = qv * sc + vec2(sin(uT * .6 + qv.y * 7. + float(l) * 2.1) * .7, -uT * ve * sc);
              vec2 cs = floor(qs); float hs = fract(sin(dot(cs, vec2(27.1 + float(l), 113.7))) * 43758.5453);
              vec2 ps = fract(qs) - .5 - (vec2(fract(hs * 13.), fract(hs * 29.)) - .5) * .55;
              fi += smoothstep(l == 0 ? .2 : .13, .0, length(ps)) * step(.5, hs) * (l == 0 ? 1. : .7);
            }
            col += vetro * fuoriB * min(1., uFuoriN * 1.2) * fi * .6 * vec3(.97, .98, 1.);
          }
          col += fuoriD * uLampo * (.9 * vetro + .45 * (1. - vetro)) * vec3(.88, .92, 1.);
        }
      }
    } else {
      ombraV = clamp(-dV / 127., 0., 1.); nuvV = clamp(dV / 127., 0., 1.);
      if (uOmbre > .01) col *= 1. - ombraV * .17 * uOmbre * (1. - sky);
    }
#endif
    /* fuochi, lanterne e finestre accese tremolano come fiamme, di notte e un po' al tramonto (dentro no: lì c'è la
       luce dei fuochi qui sopra) */
#ifdef SENZA_NUVOLE
    if (uNotte > .5){
#else
    if (uNotte > .5 && uDentro < .5){
#endif
      float caldo = smoothstep(.33, .6, col.r) * smoothstep(1.12, 1.4, col.r / max(col.g, .01)) * smoothstep(1.15, 1.6, col.g / max(col.b, .01)) * (1. - sky);
      if (caldo > .01){
        vec2 cel = floor(uv * uPix / (14. * scP));
        float hz = 1.5 + 2. * h1(cel), fl = rumore(vec2(uT * hz, h1(cel) * 97.)) * .65 + rumore(vec2(uT * hz * 2.3, h1(cel + 1.) * 53.)) * .35;
        col *= mix(1., .88 + .2 * fl, caldo * smoothstep(.5, 1., uNotte));   /* 11/11: un lume dietro una finestra, non un falò (era .7 + .55, 5-10 volte al secondo) */   /* solo di notte: all'alba e al tramonto tutto è caldo */
      }
    }
    /* uccelli (js/uccelli.js) */
    /* 10/11: gli uccelli passano anche davanti alle colline lontane (il cielo nuovo si ferma al crinale, prima no) */
    float dietroU = uHaDep0 > .5 ? max(sky, smoothstep(.035, .012, n) * smoothstep(.85, .45, uv.y)) : sky;
    if (uUccelli > .01 && uNU > .5 && dietroU > .2 && uv.x > uUBox.x && uv.y > uUBox.y && uv.x < uUBox.z && uv.y < uUBox.w){ float b = uccelli(uv) * uUccelli * smoothstep(.2, .7, dietroU); col = mix(col, col * .3 + vec3(.035, .035, .045), b * .8); }
    if (uNFumo > .5 && uFumoA > .01){
      float fm = fumo(uv) * (1. - uPioggia * .6) * (1. - uTempesta * .3);
      if (fm > .001){
        vec3 cf = mix(vec3(.8, .81, .84), vec3(.24, .26, .32), smoothstep(.2, .9, uNotte)) * (1. - uCoperto * .18);   /* 8/11: di notte un po' più chiaro (luna), se no sul buio non si vedeva (Maurizio: «di notte non c'è fumo») */
        col = mix(col, cf, fm * .45);   /* 11/11: un po' più trasparente (era .5) */
      }
    }
    /* ⚠ 14/11 sera · DIETRO LE NUVOLE LE STELLE NON SI VEDONO: quanta nuvola del cielo che scorre c'è in questo punto
       (maschera fatta una volta per panorama, vedi mascheraNuvole; la porta qui il passaggio del vento, vedi VENTO_FRAG;
       verso l'orizzonte, dove torna il cielo dipinto, vale quanto il panorama si vede). Vale anche per la stella
       cadente, che dietro una nuvola si vede appena */
#ifdef SENZA_NUVOLE
    float nuv = 0.;
#else
    float nuv = smoothstep(.1, .55, nuvV);
#endif
    /* stelle che brillano (ognuna col suo ritmo) e, ogni tanto, una stella cadente */
    if (uNotte > .01 && sky > .3){
      vec2 pp = uv * uPix / (7. * scP), cel = floor(pp), f = fract(pp);
      float h = h1(cel);
      if (h > .972){
        vec2 pos = vec2(h1(cel + 3.1), h1(cel + 7.7)) * .7 + .15;
        float r = length(f - pos) * 7.;
        float lum = .3 + .7 * h1(cel + 11.);
        float scint = .55 + .45 * sin(uT * (1.2 + 2.8 * h1(cel + 5.)) + h * 40.) * (.65 + .35 * sin(uT * .31 + h * 13.));
        stelle += vec3(.86, .9, 1.) * exp(-r * r * 1.7) * lum * scint * uNotte * (1. - uCoperto) * smoothstep(.3, .8, sky) * (1. - nuv);
      }
    }
    if (uMeteoraK > 0. && sky > .3){
      vec2 A = uMeteora.xy * uPix, B = uMeteora.zw * uPix, P = uv * uPix;
      vec2 testa = mix(A, B, uMeteoraK), coda = mix(A, B, max(0., uMeteoraK - .3));
      float dd = segmento(P, coda, testa), lungo = clamp(dot(P - coda, testa - coda) / max(1., dot(testa - coda, testa - coda)), 0., 1.);
      stelle += vec3(.95, .97, 1.) * exp(-dd * dd / (.5 * scP * scP + .25)) * lungo * lungo * sin(3.14159 * uMeteoraK) * 1.6 * smoothstep(.3, .8, sky) * uNotte * (1. - uCoperto * .7) * (1. - .85 * nuv);   /* 9/11: dietro le nuvole si vede appena */
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
#ifndef LEGGERO
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
#endif

  /* lampo: le nuvole si accendono da dentro (si vede la loro forma), poi il paesaggio ne prende il riflesso */
  /* ⚠ 4/11 (Maurizio: «coi lampi sopra l'orizzonte si vedono dei puntini»): prima la luce del lampo moltiplicava
     tutto, anche il crinale lontano dove cielo e alberi si mescolano, e ne esaltava la grana. Ora il cielo si
     schiarisce per conto suo (bagliore dentro le nuvole, a velo) e la terra prende solo un riflesso moderato */
  if (uLampo > .001 && uDentro < .5){   /* dentro il lampo si vede solo dalle finestre (sopra) */
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

#ifndef SENZA_NUVOLE
  /* ⚠ 16/11 sera (Maurizio: «rendi più buia l'immagine, tipo la mia stanza» e «rendi più scuro il parquet»; alle 19:15: «più
     che buia deve essere scura. Anche i legni più tipo noce. Anche il parquet»). Dentro, dal file dei punti:
     · la stanza scura, non poco illuminata: una curva (potenza) che scende di più negli scuri e lascia le luci, e i colori
       restano pieni (prima si abbassava tutto, e sembrava solo spenta);
     · i legni e il parquet (la maschera nel blu del vento) color noce: bruno profondo e meno arancio, il legno chiaro
       scurisce molto, quello già scuro poco, i riflessi restano */
  if (uDentro > .5 && uScuro.x + uScuro.y > .001){
    if (uScuro.x > .001) col = pow(max(col, vec3(0.)), vec3(1. + uScuro.x));
    float mL = uScuro.y * gVentoRG.z;
    if (mL > .004){
      float lS = dot(col, vec3(.299, .587, .114));
      float sc = mix(.6, .9, smoothstep(.2, .05, lS));
      sc = mix(sc, 1., .6 * smoothstep(.45, .8, lS));
      vec3 noce = mix(vec3(1., .67, .48) * (lS / .747), col, .3) * sc;
      col = mix(col, noce, mL);
    }
  }
#endif
  /* luce dello schermo, buio dei cambi, rumore finissimo contro le fasce */
  /* ⚠ 17/11 notte (Maurizio: «nel giorno la candela sul tavolo a sinistra ha la fiamma poco luminosa»). La luce dello schermo
     (70%) abbassava tutto, fiamme comprese: sul TV la fiamma bianca arrivava a 150-190 su 255 e sembrava grigia, trasparente.
     Una fiamma è una luce: nel suo corpo (dai punti delle fiamme) i punti chiari restano a piena luce, il resto si abbassa */
  float wF = gFiammaW * smoothstep(.45, .8, dot(col, vec3(.299, .587, .114)));
  col *= mix(uLuce, 1., wF) * (1. - uBuio);
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
/* ── 19/11 sera · le fiamme dei punti (candele, torce, lampadario) a metà risoluzione: lo stesso conto che il disegno
   faceva su ogni punto (vedi paesaggio), scritto in un'immagine piccola che il disegno legge. rg: spostamento × 64 (+ 128/255),
   b: tremolio della luce × 0,5 (+ 128/255), a: quanto il punto è corpo di fiamma ── */
/* ⚠ 20/11 · IL VIDEO A RIQUADRI (Maurizio: «trova una soluzione per il 4k»). Un video in 4K pieno costava al TV due gradini
   di risoluzione su tutto il quadro (prova del 20/11: disegno al 70% invece del 90%), per un dettaglio che serve solo dove ci
   sono persone e fuochi (4–20% del quadro). Il video «a riquadri» porta solo quelle zone, ingrandite al dettaglio del 4K e
   messe una accanto all'altra in un fotogramma piccolo (come un 1080p): si decodifica e si carica poco. A ogni fotogramma
   nuovo, qui sotto, ogni riquadro si ridisegna al suo posto in un'immagine grande quanto il quadro (il fermo dove non c'è
   niente): il resto del disegno la legge come un video intero. Il manifesto dei pezzi lo dice: atlante {w, h, riquadri:
   [{box: [x0, y0, x1, y1] nel quadro, tile: [u0, v0, u1, v1] nel video], frazioni}]} */
const ATLANTE_FRAG = `
precision highp float;
uniform sampler2D uSrc;
uniform vec4 uTile, uBox, uLim;   /* uLim: il riquadro nel video, mezzo punto dentro (niente colori dal vicino) */
uniform vec2 uDim;
void main(){
  vec2 q = gl_FragCoord.xy / uDim;   /* riga 0 = la prima riga del quadro, come i fotogrammi caricati dal video */
  vec2 t = clamp(uTile.xy + (q - uBox.xy) / uBox.zw * uTile.zw, uLim.xy, uLim.zw);
  gl_FragColor = vec4(texture2D(uSrc, t).rgb, 1.);
}`;
const FIAMME_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec4 uMap;
uniform float uAspetto, uNFiamma;
uniform vec4 uFiamma[12], uFiammaS[12], uFiammaL[12];
void main(){
  vec2 p = uMap.xy + vUv * uMap.zw;
  vec2 dpF = vec2(0.); float gF = 0., gW = 0.;
#if __VERSION__ >= 300
  for (int i = 0; i < int(uNFiamma + .5); i++){
#else
  for (int i = 0; i < 12; i++){
    if (float(i) >= uNFiamma) break;
#endif
    vec4 F = uFiamma[i];
    vec2 q = vec2((p.x - F.x) * uAspetto, p.y - F.y) / F.z;
    if (abs(q.x) > .9 || q.y > .45 || q.y < -1.7) continue;
    float su = clamp(-q.y, 0., 1.3);
    float zona = smoothstep(.42, .2, abs(q.x)) * smoothstep(1.35, 1.05, -q.y);
    if (zona > 0.){
      vec4 S4 = uFiammaS[i]; float kS = clamp(su / .4333, 0., 3.);
      float sw = kS < 1. ? mix(S4.x, S4.y, kS) : (kS < 2. ? mix(S4.y, S4.z, kS - 1.) : mix(S4.z, S4.w, kS - 2.));
      dpF += zona * vec2(sw * su * .2 * F.z / uAspetto, uFiammaL[i].x * su * .16 * F.z);
    }
    float tondo = smoothstep(1., .25, length(vec2(q.x, (q.y + .5) * .8)));
    gW = max(gW, smoothstep(.5, .25, abs(q.x)) * smoothstep(1.45, 1.05, -q.y) * smoothstep(.3, .0, q.y));
    gF += tondo * smoothstep(.45, -.1, q.y) * uFiammaL[i].y;
  }
  gl_FragColor = vec4(clamp(dpF * 64. + 128. / 255., 0., 1.), clamp(gF * .5 + 128. / 255., 0., 1.), gW);
}`;
const VENTO_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec4 uMap, uCropD, uCieloM;
uniform float uT, uCieloX, uVento;
uniform sampler2D uAlberi, uCielo;
#ifndef SENZA_NUVOLE
uniform float uHaNuvole, uDentro;
uniform sampler2D uNuvole;   /* le nuvole del cielo che scorre (r: 0 sgombro … 1 nuvola), vedi mascheraNuvole */
uniform vec4 uFascioD;       /* 16/11 · i fasci di luce delle finestre di un interno: direzione (x, y), ci sono (z), larghezza su altezza del foro (w) */
#endif
float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rumore(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 uv = uMap.xy + vUv * uMap.zw;
  vec2 ti = clamp(uCropD.xy + uv * uCropD.zw, .001, .999);
  vec4 aM = texture2D(uAlberi, ti);
  float alberi = aM.r;                                          /* solo dove ci sono alberi (o vicino) */
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
  /* ⚠ 14/11 sera · LE NUVOLE DEL CIELO CHE SCORRE, per le stelle del disegno principale (lì dietro non si vedono): quanta
     nuvola sta in questo punto. Stessa mappa del cielo che usa paesaggio(); verso l'orizzonte, dove il panorama sfuma nel
     cielo dipinto, sfuma anche lei. Fatto qui, a un quarto di risoluzione, perché nel disegno principale una lettura in
     più a ogni punto pesava anche di giorno. Va nello stesso canale delle ombre: le ombre ci sono solo sotto l'orizzonte
     (g > 0), le nuvole solo sopra (pp.y < 1), e non si incontrano mai: 128/255 = niente, sotto l'ombra, sopra la nuvola */
#ifndef SENZA_NUVOLE
  float nuvola = 0.;
  if (uHaNuvole > .5 && uCieloM.x > 0.){
    vec2 pp = vec2(ti.x * uCieloM.z / (uCieloM.y * uCieloM.x) + uCieloX, ti.y / uCieloM.x);
    nuvola = texture2D(uNuvole, vec2(fract(pp.x), clamp(pp.y, .002, .998))).r * (1. - smoothstep(.8, 1., pp.y));
  }
  /* ⚠ 14/11 sera · DENTRO (uDentro): niente cielo e niente ombre, il canale porta il respiro della luce dei fuochi
     (vedi «LA LUCE DEI FUOCHI, DENTRO» nel disegno principale): un campo morbido nello spazio, che cambia nel tempo
     senza scorrere (ogni strato sfuma da un disegno a caso al successivo): lento e largo come il respiro di una fiamma,
     con sopra un tremito più svelto e più fitto. -1 … 1, in media 0 */
  float fuoco = 0.;
  if (uDentro > .5 && uDentro < 1.5){
    vec2 pq = uv * vec2(2.6, 1.9);
    float t1 = uT * 2.3, t2 = uT * 5.3, t3 = uT * .55, t4 = uT * 9.7;
    float k1 = floor(t1), f1 = fract(t1), k2 = floor(t2), f2 = fract(t2), k3 = floor(t3), f3 = fract(t3), k4 = floor(t4), f4 = fract(t4);
    f1 = f1 * f1 * (3. - 2. * f1); f2 = f2 * f2 * (3. - 2. * f2); f3 = f3 * f3 * (3. - 2. * f3); f4 = f4 * f4 * (3. - 2. * f4);
    float n1 = mix(rumore(pq + vec2(h1(vec2(k1, 1.)), h1(vec2(k1, 7.))) * 37.), rumore(pq + vec2(h1(vec2(k1 + 1., 1.)), h1(vec2(k1 + 1., 7.))) * 37.), f1);
    float n2 = mix(rumore(pq * 1.7 + vec2(h1(vec2(k2, 2.)), h1(vec2(k2, 8.))) * 53.), rumore(pq * 1.7 + vec2(h1(vec2(k2 + 1., 2.)), h1(vec2(k2 + 1., 8.))) * 53.), f2);
    float n3 = mix(rumore(pq * .7 + vec2(h1(vec2(k3, 3.)), h1(vec2(k3, 9.))) * 29.), rumore(pq * .7 + vec2(h1(vec2(k3 + 1., 3.)), h1(vec2(k3 + 1., 9.))) * 29.), f3);
    float n4 = mix(rumore(pq * 2.6 + vec2(h1(vec2(k4, 4.)), h1(vec2(k4, 5.))) * 41.), rumore(pq * 2.6 + vec2(h1(vec2(k4 + 1., 4.)), h1(vec2(k4 + 1., 5.))) * 41.), f4);
    fuoco = clamp((n1 * .4 + n2 * .3 + n3 * .16 + n4 * .14 - .5) * 2.7, -1., 1.);
  }
  /* ⚠ 16/11 · IL PULVISCOLO NEI FASCI DI LUCE (Maurizio: «rendiamo il pulviscolo e la luce che entra dalle finestre più
     viva»): dove c'è un fascio (il quarto canale della maschera delle chiome, vedi mascheraFasci) la polvere nell'aria fa
     banchi più chiari e più scuri, allungati lungo il fascio, che girano piano su sé stessi e scivolano di traverso e in
     giù: -1 … 1. Qui a un quarto di risoluzione (sono morbidi); i granelli, piccoli, li fa il disegno principale */
  float fascio = 0., polvere = 0.;
  if (uDentro > .5 && uDentro < 1.5 && uFascioD.z > .5){
    fascio = 1. - aM.a;
    if (fascio > .004){
      vec2 dd = uFascioD.xy, nn = vec2(-dd.y, dd.x), qq = uv * vec2(uFascioD.w, 1.);
      vec2 w = vec2(dot(qq, nn) * 9., dot(qq, dd) * 3.6);   /* di traverso più fitto: banchi lunghi lungo il fascio */
      float tw = uT;
      w += (vec2(rumore(w * .45 + vec2(tw * .06, 1.3)), rumore(w * .45 + vec2(5.2, -tw * .05))) - .5) * 2.2;   /* girano su sé stessi */
      float d1 = rumore(w + vec2(tw * .3, -tw * .22));
      float d2 = rumore(w * 2.2 + vec2(-tw * .45, -tw * .38) + 3.7);
      float d3 = rumore(w * 4.6 + vec2(tw * .8, -tw * .6) + 9.1);
      polvere = clamp((d1 * .5 + d2 * .32 + d3 * .18 - .5) * 2.6, -1., 1.);
    }
  }
#endif
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
#ifdef SENZA_NUVOLE
  gl_FragColor = vec4(clamp(fx * .9 + .5, 0., 1.), clamp(fy * .9 + .5, 0., 1.), raffica * alberi, ombra);
#else
  /* dentro niente chiome al vento: rosso e verde portano la polvere nei fasci e quanto fascio c'è, blu quanto pavimento */
  if (uDentro > .5 && uDentro < 1.5) gl_FragColor = vec4(.5 + .5 * polvere, fascio, aM.r, (128. + 127. * fuoco) / 255.);   /* blu: il pavimento (rosso della maschera, mascheraFasci) */
  else gl_FragColor = vec4(clamp(fx * .9 + .5, 0., 1.), clamp(fy * .9 + .5, 0., 1.), raffica * alberi, (128. + 127. * (uDentro > .5 ? fuoco : nuvola - ombra)) / 255.);
#endif
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
#ifdef LEGGERO
/* 9/11: sul Raspberry (scheda video V3D) la raffica non si disegna: da quando c'è, il suo processo grafico cade e
   Chromium spegne WebGL. Con queste funzioni costanti il compilatore la toglie del tutto */
float rafTau(vec2 q){ return -1.; }
float rafCella(vec2 q){ return 0.; }
float rafEnv(float t){ return 0.; }
float rafStrada(float t){ return 0.; }
#else
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
#endif
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
  } else if (uTipo < 1.5){
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
  } else {
    /* 9/11 · pulviscolo nella luce: granelli che il vento porta piano verso sinistra, salgono e scendono appena, e
       si accendono quando girano nella luce (ognuno col suo ritmo); i semi piumosi (strato grande) vanno più lenti */
    float R = uStrato.x * uScala * (.5 + .9 * r.w);
    float x = fract(r.x - (uTV * .35 + uT * .006) * uStrato.z * 10. * (.6 + .8 * r.z) - uRafS * .4);
    float y = fract(r.y + sin(uT * (.07 + .09 * r.z) + r.x * 6.283) * .035 + uT * uStrato.z * .15 * (r.w - .45));
    c = vec2(x * uFori.x + sin(uT * (.4 + .5 * r.y) + r.z * 6.283) * 6. * uScala, y * uFori.y);
    vis = step(fract(r.w * 7.31 + r.z), uDens);
    float luccica = .5 + .5 * sin(uT * (.6 + 1.6 * r.z) + r.y * 40.);
    luccica = pow(luccica, 14.);                      /* acceso solo per un attimo */
    vis *= step(.02, luccica);                        /* gli altri non si disegnano neanche */
    float hw = R + 1.;
    pos = c + aAngolo * hw;
    vQ = aAngolo * hw; vW = R + .5;
    vA = vis * luccica;
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

/* ── 9/11 · bagliori: luci delle case, falò e lucciole (js/vita.js) ───────────
   Ognuno è un quadratino intorno al suo punto: un nucleo piccolo e un alone morbido, sommati alla luce che c'è
   («piu»); oppure, per una finestra che di notte si spegne, un'ombra che moltiplica («per»). Costano solo i pixel
   che coprono */
const BAG_VERT = `
precision highp float;
attribute vec2 aPos;          /* pixel nel foro, dall'alto */
attribute vec2 aQ;            /* -1..1 dentro il quadratino */
attribute vec4 aCol;          /* colore già moltiplicato per la forza, e quanto è grande il nucleo rispetto all'alone */
uniform vec2 uFori;
varying vec2 vQ; varying vec4 vCol;
void main(){ vQ = aQ; vCol = aCol; gl_Position = vec4(aPos.x / uFori.x * 2. - 1., 1. - aPos.y / uFori.y * 2., 0., 1.); }`;
const BAG_FRAG = `
precision highp float;
uniform float uModo;
varying vec2 vQ; varying vec4 vCol;
void main(){
  float d = length(vQ), cr = max(vCol.a, .02);
  float nucleo = exp(-d * d / (cr * cr) * 1.6), alone = exp(-d * d * 4.5) * (1. - smoothstep(.8, 1., d));
  if (uModo < .5) gl_FragColor = vec4(vCol.rgb * (nucleo + alone * .32), 1.);
  else gl_FragColor = vec4(mix(vec3(1.), vCol.rgb, exp(-d * d * 1.8)), 1.);
}`;
/* il pulviscolo nella luce (alba, giorno, tramonto): granelli fini e qualche seme piumoso che il vento porta */
/* ⚠ 9/11 (Maurizio: «sono pallini grandi e quasi sembrano fiocchi di neve»): erano granelli di 2-3 pixel sempre visibili
   e semi di 10: tolti i semi, granelli sotto il pixel, quasi tutti invisibili; si accendono un attimo quando girano
   nella luce (un luccichio, non un fiocco) */
const PULVISCOLO = [
  {n:220, raggio:.35, morb:0, vel:.012, alfa:.55, fine:true},
  {n:45,  raggio:.6,  morb:0, vel:.018, alfa:.6}
];

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
    /* ⚠ 9/11 · scheda video del Raspberry (V3D): dopo la raffica (5.26) e la nebbia che sale (5.27) il suo processo grafico
       cadeva e Chromium spegneva WebGL («WebGL non disponibile» anche dopo il riavvio). Lì quelle due parti non si
       compilano. ?leggero=1 / ?leggero=0 per forzare */
    try { const di = gl.getExtension('WEBGL_debug_renderer_info'); this.scheda = di ? gl.getParameter(di.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch(e) { this.scheda = '?'; }
    const ql = new URLSearchParams(location.search).get('leggero');
    this.leggero = ql != null ? ql === '1' : /V3D|VideoCore|Broadcom/i.test(this.scheda || '');
    /* 14/11 sera · «senza nuvole»: il disegno si compila com'era prima della 5.59 (le stelle si vedono anche davanti alle
       nuvole, le ombre delle nuvole hanno la loro lettura). Da lontano: prova {senzaNuvole: true} e ricarica. Serve a
       confrontare sullo stesso schermo quanto pesa il disegno con e senza (il banco di prova crea il suo disegno e
       legge l'interruttore in quel momento: i due si misurano uno dopo l'altro, senza ricaricare), e a toglierle se
       su qualche apparecchio dessero fastidio */
    try { this.senzaNuvole = localStorage.getItem('fin-senza-nuvole') === '1'; } catch(e) { this.senzaNuvole = false; }
    /* con WebGL2 i programmi passano alla lingua GLSL 3: servono le letture col livello di dettaglio esplicito */
    const in3 = (src, vert) => '#version 300 es\n' + (vert ? src.replace(/\battribute /g, 'in ').replace(/\bvarying /g, 'out ')
      : src.replace(/\bvarying /g, 'in ').replace(/gl_FragColor/g, 'fragColor').replace(/(precision \w+ float;)/, '$1\nout vec4 fragColor;')).replace(/texture2D\(/g, 'texture(');
    const sh = (tipo, src) => { if (this.gl2) src = in3(src.trim(), tipo === gl.VERTEX_SHADER);
      if (this.leggero) src = /^#version[^\n]*\n/.test(src) ? src.replace(/^(#version[^\n]*\n)/, '$1#define LEGGERO\n') : '#define LEGGERO\n' + src;
      if (this.senzaNuvole) src = /^#version[^\n]*\n/.test(src) ? src.replace(/^(#version[^\n]*\n)/, '$1#define SENZA_NUVOLE\n') : '#define SENZA_NUVOLE\n' + src;
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const programma = (v, f, attr) => { const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
      attr.forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const posizioni = (p, nomi) => { const u = {}; for (const n of nomi) u[n] = gl.getUniformLocation(p, n); return u; };
    /* il programma principale: paesaggio, cielo, nebbia, lampo, luce */
    this.p = programma(VERT, FRAG, ['aPos']);
    this.fumoDati = new Float32Array(32); this.fumoForza = new Float32Array(8);
    this.u = posizioni(this.p, ['uOcchio','uImg0b','uVmix','uImg0','uImg1','uDep0','uDep1','uMap','uCrop0','uCrop1','uCropD0','uCropD1','uUccelli','uCielo0','uCielo1','uCieloM0','uCieloM1','uCieloX','uFermo0','uFermo1','uHaFermo0','uHaFermo1','uRap0','uHaRap0','uVentoT','uAlberiM','uHaVento','uU','uNU','uUBox','uFumo','uFumoI','uNFumo','uFumoA','uFiamma','uFiammaS','uFiammaL','uNFiamma','uFiamT','uHaFiamT','uCamino','uNCamino','uParte','uNParte','uIns0','uIns1','uRiqBox','uRiqTile','uRiqSam','uRiqW','uRiqSam2','uRiqW2','uNebV','uNebG','uDentro','uFascioD','uFascioC','uFuoriK','uPolvK','uScuro','uChiar','uNotte','uOmbre','uMeteora','uMeteoraK','uMix','uHaImg','uHaDep0','uHaDep1','uMovimento0','uMovimento1',
      'uLato','uT','uTV','uRaf','uAspetto','uPix','uCoperto','uNebbia','uPioggia','uNeve','uTempesta','uVento','uLampo','uLampoX','uLampoS','uLampoB',
      'uNotteFinta','uLuce','uBuio','uQualita','uColNebbia','uMeteo','uSale','uFuori','uFuoriN','uVetri','uNVetri','uLuciM0','uLuciM1','uLuciW']);
    gl.useProgram(this.p);
    gl.uniform1i(this.u.uImg0, 0); gl.uniform1i(this.u.uImg1, 1); gl.uniform1i(this.u.uDep0, 2); gl.uniform1i(this.u.uDep1, 3); gl.uniform1i(this.u.uImg0b, 4); gl.uniform1i(this.u.uMeteo, 5); gl.uniform1i(this.u.uCielo0, 6); gl.uniform1i(this.u.uCielo1, 7); gl.uniform1i(this.u.uFermo0, 8); gl.uniform1i(this.u.uFermo1, 9); gl.uniform1i(this.u.uVentoT, 10); if (this.u.uAlberiM) gl.uniform1i(this.u.uAlberiM, 11); if (this.u.uRap0) gl.uniform1i(this.u.uRap0, 12); if (this.u.uFiamT) gl.uniform1i(this.u.uFiamT, 13); if (this.u.uIns0) gl.uniform1i(this.u.uIns0, 14); if (this.u.uIns1) gl.uniform1i(this.u.uIns1, 15);
    this.unita = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) || 8;   /* il fermo vuole 10 unità (il Raspberry 4 ne ha 16) */
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;       /* Raspberry 4 e telefoni vecchi: 4096; il G10 16384 */
    /* nebbia e nuvole a bassa risoluzione */
    this.pm = programma(VERT, METEO_FRAG, ['aPos']);
    this.um = posizioni(this.pm, ['uMap','uT','uTV','uRaf','uVento']);
    /* 19/11 sera · le fiamme a metà risoluzione: solo con WebGL2 e 16 unità (l'immagine piccola va nella 13) */
    try { this.pAtl = programma(VERT, ATLANTE_FRAG, ['aPos']); this.uAtl = posizioni(this.pAtl, ['uSrc','uTile','uBox','uLim','uDim']); } catch(e) { this.pAtl = null; }   /* 20/11: il video a riquadri */
    try { if (this.gl2 && this.unita >= 16){ this.pfi = programma(VERT, FIAMME_FRAG, ['aPos']); this.ufi = posizioni(this.pfi, ['uMap','uAspetto','uNFiamma','uFiamma','uFiammaS','uFiammaL']); } } catch(e) { this.pfi = null; }
    this.fiamBuf = [];
    this.pv = programma(VERT, VENTO_FRAG, ['aPos']);
    this.uv = posizioni(this.pv, ['uMap','uT','uCropD','uCieloM','uCieloX','uAlberi','uCielo','uVento','uNuvole','uHaNuvole','uDentro','uFascioD']);
    gl.useProgram(this.pv); gl.uniform1i(this.uv.uAlberi, 11); gl.uniform1i(this.uv.uCielo, 6); if (this.uv.uNuvole) gl.uniform1i(this.uv.uNuvole, 13);
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
    /* bagliori (luci, falò, lucciole) e la vita del paesaggio che li decide */
    this.pb = programma(BAG_VERT, BAG_FRAG, ['aPos', 'aQ', 'aCol']);
    this.ub = posizioni(this.pb, ['uFori', 'uModo']);
    this.bBag = gl.createBuffer(); this.datiBag = new Float32Array(96 * 6 * 8);
    this.vita = typeof Vita !== 'undefined' ? new Vita() : null;
    this.meteo = [];   /* per ogni foro: la sua piccola immagine di nebbia e nuvole */
    /* le due «fonti» (quella che si vede e quella da cui si sfuma): immagine, profondità, eventuale video */
    this.fonti = [this.fonteVuota(), this.fonteVuota()];
    this.mix = 0; this.mixDa = 0; this.mixDur = 0;
  }
  quad(){ const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (this.ist){ this.ist.div(1, 0); gl.disableVertexAttribArray(1); } }
  /* 20/11 · un fotogramma nuovo del video sulla scheda: intero, o «a riquadri» rimessi al loro posto (vedi ATLANTE_FRAG) */
  caricaVideo(f, quale, v){
    const gl = this.gl, B = quale === 'B';
    if (B && !f.vtexB) f.vtexB = this.texture();
    const A = f.atlante;
    if (!A || !this.pAtl){ this.carica(B ? f.vtexB : f.vtex, v); return; }
    gl.activeTexture(gl.TEXTURE0);
    if (!f.atlTmp) f.atlTmp = this.texture();
    this.carica(f.atlTmp, v);
    const vw = v.videoWidth || 1920, vh = v.videoHeight || 1080;
    f.atlFb = f.atlFb || {};
    let o = f.atlFb[B ? 'B' : 'A'];
    if (!o){ const tex = B ? f.vtexB : f.vtex; this.carica(tex, null, A.w, A.h);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      o = f.atlFb[B ? 'B' : 'A'] = {fb, pieno: false}; }
    const u = this.uAtl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, o.fb); gl.viewport(0, 0, A.w, A.h); gl.disable(gl.BLEND); gl.useProgram(this.pAtl);
    gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDim, A.w, A.h);
    if (!o.pieno && f.fTex){   /* la prima volta, sotto, il fermo intero (fuori dai riquadri il disegno prende comunque il fermo) */
      gl.disable(gl.SCISSOR_TEST); gl.bindTexture(gl.TEXTURE_2D, f.fTex);
      gl.uniform4f(u.uTile, 0, 0, 1, 1); gl.uniform4f(u.uBox, 0, 0, 1, 1); gl.uniform4f(u.uLim, 0, 0, 1, 1); this.quad(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); o.pieno = true; }
    gl.bindTexture(gl.TEXTURE_2D, f.atlTmp); gl.enable(gl.SCISSOR_TEST);
    for (const r of A.riquadri){
      const [x0, y0, x1, y1] = r.box, [u0, v0, u1, v1] = r.tile;
      gl.scissor(Math.floor(x0 * A.w), Math.floor(y0 * A.h), Math.ceil((x1 - x0) * A.w) + 1, Math.ceil((y1 - y0) * A.h) + 1);
      gl.uniform4f(u.uBox, x0, y0, x1 - x0, y1 - y0); gl.uniform4f(u.uTile, u0, v0, u1 - u0, v1 - v0);
      gl.uniform4f(u.uLim, u0 + .5 / vw, v0 + .5 / vh, u1 - .5 / vw, v1 - .5 / vh);
      this.quad(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.c.width, this.c.height);
  }
  /* la piccola immagine della nebbia per il foro i, grande un quarto per lato */
  bufferMeteo(i, w, h, lista = this.meteo, div = 4){
    const gl = this.gl, W = Math.max(8, Math.ceil(w / div)), H = Math.max(8, Math.ceil(h / div));
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
  fonteVuota(){ return {fumi:[], fuochi:[], luci:[], prati:[], fumiUrl:null, dimg:null, img:null, tex:null, dep:null, depTex:null, video:null, cTex:null, cm:[0,0,0,0], fTex:null, lTex:null, lH:0, iw:1, ih:1, url:null, ok:false}; }

  /* nuova immagine (o video in loop), con la sua profondità; sfuma da quella di prima in `dur` secondi */
  /* 21/11 · gli interruttori della taverna deserta: {t, l, c} da 0 a 1 (torce a muro, lampadario, camini + torce da terra);
     contano solo per un paesaggio con «luciOre». Il disegno ci va in poco più di un secondo */
  impostaLuci(o){ const v = o || {}; this.luciVolute = {t: v.t == null ? 1 : +v.t, l: v.l == null ? 1 : +v.l, c: v.c == null ? 1 : +v.c}; }
  async mostra({url, profondita = null, video = null, fuoco = null, cielo = null, fermo = null, maschera = null, comignoli = null, alberi = null, ricolora = false, notte = null, interno = false, stelle = false}, dur = 0){
    if (this.fonti[0].ok && this.fonti[0].url === url + '|' + (video || '')){
      this.fonti[0].fuoco = fuoco;
      if ((comignoli || null) !== (this.fonti[0].fumiUrl || null)) this.aggiornaPunti(comignoli);   /* spostati dal telefono */
      return;
    }
    if (ricolora && this.unita < 13) video = null;   /* il ricolorato vuole una texture in più */
    const chiave = url + '|' + (video || '');
    if (this.inArrivo === chiave) return;
    this.inArrivo = chiave;
    this.internoInArrivo = !!interno;   /* 13/11: un interno (la taverna) non ha cielo: la maschera del cielo resta vuota */
    try { await this._mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera, comignoli, alberi, ricolora && !!video, notte, stelle); } finally { if (this.inArrivo === chiave) this.inArrivo = null; }
  }
  /* ⚠ 18/11 sera · stessa immagine, file dei punti nuovo (rimandata la scena dopo averlo cambiato). I video «inserto» si aprivano
     solo con un'immagine nuova: al giorno, dopo aver messo torce e lampadario dell'alba nell'inserto dei fuochi, il TV teneva il
     video e i riquadri di prima. Se gli inserti cambiano, si riaprono */
  aggiornaPunti(url){
    const f = this.fonti[0], prima = JSON.stringify(f.inserti || []);
    return this.caricaFumi(f, url, f.dimg).then(() => {
      if (this.fonti[0] !== f || !f.ok || f.fumiUrl !== (url || null) || JSON.stringify(f.inserti || []) === prima) return;
      for (const I of f.ins || []) if (I){ lasciaVideo(I.v); if (I.tex) this.gl.deleteTexture(I.tex); }
      this.apriInserti(f);
    }).catch(() => {});
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
      const pr = q => dd ? dd[(Math.min(H - 1, Math.max(0, Math.round(q.y * H))) * W + Math.min(W - 1, Math.max(0, Math.round(q.x * W)))) * 4] / 255 : .5;
      f.fumi = (j.punti || []).slice(0, 6).map(q => ({x:+q.x, y:+q.y, w:+q.w || .04, n: pr(q)}));
      /* 9/11: dove si può accendere un fuoco lontano (un prato, un campo, una radura): js/vita.js */
      f.fuochi = (j.fuochi || []).slice(0, 4).map(q => ({x:+q.x, y:+q.y, w:+q.w || .02, n: pr(q)}));
      /* 15/11: le fiamme di candele e torce di un interno (base x, y e altezza h, nell'immagine) */
      /* 15/11 sera · le candele si consumano ora per ora: «fiammeOre» {ora: […]} vince su «fiamme» (l'ora arriva in fondo all'indirizzo, #ora=…) */
      const ora = (String(url).match(/#ora=(\w+)/) || [])[1], fo = ora && j.fiammeOre && j.fiammeOre[ora];
      f.fiamme = (fo || j.fiamme || []).slice(0, 12).map((q, i) => ({x:+q.x, y:+q.y, h:+q.h || .03, s: i * .37 + .11}));
      /* 16/11 · i fuochi dei camini: «caminiOre» {ora: [{x, y (base), w (larghezza), h (altezza)}]} vince su «camini» */
      const co = ora && j.caminiOre && j.caminiOre[ora];
      f.camini = (co || j.camini || []).slice(0, 2).filter(q => +q.w > 0 && +q.h > 0).map(q => ({x:+q.x, y:+q.y, w:+q.w, h:+q.h}));
      /* 16/11 sera · parti di animali che si muovono: «animaliOre» {ora: [{tipo: 'testa'|'coda', perno: [x, y], centro: [x, y],
         raggi: [rx (in larghezze), ry (in altezze)], gradi, sposta (in altezze), periodo (secondi)}]}, nell'immagine */
      const ao = ora && j.animaliOre && j.animaliOre[ora];
      f.parti = (ao || []).slice(0, 3).filter(q => q && Array.isArray(q.perno) && Array.isArray(q.centro) && Array.isArray(q.raggi)).map((q, i) => ({
        coda: q.tipo === 'coda', px: +q.perno[0], py: +q.perno[1], cx: +q.centro[0], cy: +q.centro[1], rx: +q.raggi[0], ry: +q.raggi[1],
        rot: (+q.gradi || 0) * Math.PI / 180, sposta: +q.sposta || 0, periodo: Math.max(1, +q.periodo || 4), seme: i * .41 + .17}));
      /* 16/11 · dove va la luce che entra dalle finestre: «fasci» {ora: {gradi: dalla verticale, meno = verso sinistra,
         vetri: [[x0, y0, x1, y1], …] i riquadri delle finestre}} (gradi da soli = i vetri si cercano); null o assente =
         niente fasci a quell'ora. Vedi mascheraFasci */
      const fa = j.fasci, fv0 = fa == null ? null : (typeof fa === 'number' || fa.gradi != null) ? fa : (ora ? fa[ora] : null);
      const fv = fv0 == null ? null : typeof fv0 === 'number' ? fv0 : +fv0.gradi;
      f.fasciAng = typeof fv === 'number' && isFinite(fv) ? Math.max(-80, Math.min(80, fv)) : null;
      f.fasciVetri = fv0 && Array.isArray(fv0.vetri) ? fv0.vetri.filter(r => Array.isArray(r) && r.length === 4 && r[2] > r[0] && r[3] > r[1]).slice(0, 6) : null;
      /* 16/11 sera · quanto più buia la stanza («buio» per tutte le ore, «buioOre» {ora: …} per una sola; 0 … .8) e il
         pavimento più scuro («pavimentoOre» {ora: {k: quanto, poli: [[x, y], …] il suo contorno nell'immagine}}) */
      const bo = ora && j.buioOre ? j.buioOre[ora] : null, bv = bo != null ? bo : j.buio;
      f.scuro = typeof bv === 'number' && isFinite(bv) ? Math.max(0, Math.min(.8, bv)) : 0;
      /* 20/11 · la luce che entra dalle finestre più forte: «fuoriOre» {ora: quanto, 0 … 1,5} */
      const fuo = ora && j.fuoriOre ? j.fuoriOre[ora] : null;
      f.fuoriK = typeof fuo === 'number' && isFinite(fuo) ? Math.max(0, Math.min(1.5, fuo)) : 0;
      /* 20/11 sera (Maurizio: «aumenterei luce che entra dalle finestre ed effetto del pulviscolo»): «polvereOre» {ora: 0 … 3},
         quanto più forti banchi e granelli di polvere nella luce (1 = come prima) */
      const pvo = ora && j.polvereOre ? j.polvereOre[ora] : null;
      f.polvK = typeof pvo === 'number' && isFinite(pvo) ? Math.max(0, Math.min(3, pvo)) : 1;
      const po = ora && j.pavimentoOre ? j.pavimentoOre[ora] : null;
      f.pavimento = po && Array.isArray(po.poli) && po.poli.length >= 3 ? {poli: po.poli.map(q => [+q[0], +q[1]]), k: Math.max(0, Math.min(1, +po.k || .3))} : null;
      /* 19:30 · i legni (e il parquet) da fare noce: «legnoOre» {ora: {k: quanto, maschera: file accanto a questo}} */
      /* 16/11 sera · i video «inserto» (il gatto, i fuochi): «insertiOre» {ora: [{video: file accanto a questo, modo: 'riposo'|'continuo',
         tratti: [[da, a], …] (secondi nel video: i movimenti), attesa: [min, max] (secondi fermo fra un movimento e l'altro),
         riquadri: [{box: [x0, y0, x1, y1] nell'immagine, tile: [u0, v0, u1, v1] nel video}]}]}, al massimo due video e quattro riquadri */
      const io = ora && j.insertiOre && j.insertiOre[ora];
      f.inserti = (io || []).slice(0, 2).filter(q => q && typeof q.video === 'string' && Array.isArray(q.riquadri)).map(q => ({url: new URL(q.video, String(url).split('#')[0]).href,
        modo: q.modo === 'continuo' ? 'continuo' : 'riposo', tratti: (q.tratti || []).filter(t => Array.isArray(t) && t[1] > t[0]), attesa: Array.isArray(q.attesa) ? q.attesa.map(Number) : [6, 20],
        riquadri: q.riquadri.filter(r => r && Array.isArray(r.box) && r.box.length === 4).map(r => ({box: r.box.map(Number), tile: Array.isArray(r.tile) && r.tile.length === 4 ? r.tile.map(Number) : [0, 0, 1, 1], alfa: !!r.alfa, g: 'tlc'.includes(r.g) ? r.g : null, luce: !!r.luce}))}));
      /* 21/11 · gli interruttori (taverna deserta): «luciOre» {ora: {spento: file, luci: file, scuri: true|false}} accanto a
         questo; nelle fiamme e nei camini «g» dice il gruppo (t torce a muro, l lampadario, c camini e torce da terra) */
      const uo = ora && j.luciOre && j.luciOre[ora], base = String(url).split('#')[0];
      f.luciDef = uo && typeof uo.spento === 'string' && typeof uo.luci === 'string' ? {spento: new URL(uo.spento, base).href, luci: new URL(uo.luci, base).href, scuri: !!uo.scuri} : null;
      f.fiamme.forEach((q, i) => { const r = (fo || j.fiamme || [])[i]; q.g = r && 'tlc'.includes(r.g) ? r.g : null; });
      f.camini.forEach((q, i) => { const r = (co || j.camini || []).filter(q => +q.w > 0 && +q.h > 0)[i]; q.g = r && 'tlc'.includes(r.g) ? r.g : null; });
      const lo = ora && j.legnoOre && j.legnoOre[ora];
      f.legno = lo && typeof lo.maschera === 'string' ? {k: Math.max(0, Math.min(1, +lo.k || .8)), url: new URL(lo.maschera, String(url).split('#')[0]).href} : null;
    } catch(e) { f.fumi = []; f.fuochi = []; f.fiamme = []; f.camini = []; f.parti = []; f.inserti = []; f.fasciAng = null; f.scuro = 0; f.fuoriK = 0; f.polvK = 1; f.pavimento = null; f.legno = null; f.luciDef = null; }
  }
  /* 9/11 · luci delle case (dall'immagine della notte) e prati delle lucciole (dalla profondità): js/vita.js.
     Le finestre accese si cercano una volta sola per immagine */
  async caricaVita(f, notte, dimg, giorno = null){
    if (typeof trovaLuci === 'undefined') return;
    this.lavoroDa = performance.now();   /* 11/11: la ricerca delle finestre accese ferma il disegno per qualche decimo: la scala non deve giudicarla */
    try {
      const pr = profonditaDi(dimg);
      f.prati = pratiVita(dimg);
      let luci = [];
      if (notte){
        const cache = Vista.luciTrovate || (Vista.luciTrovate = new Map());
        /* il giorno serve al controllo dei falsi positivi (js/vita.js): solo se è lo stesso paesaggio, stessa inquadratura */
        if (!cache.has(notte)){ const nim = await caricaImg(notte), g = giorno && Math.abs(giorno.naturalWidth / giorno.naturalHeight - nim.naturalWidth / nim.naturalHeight) < .02 ? giorno : null; cache.set(notte, trovaLuci(nim, g, profonditaDi(dimg, 512))); }   /* il cielo con la profondità più fine: a 128 punti le torri contro il cielo cadevano fuori */
        luci = cache.get(notte).map(L => Object.assign({}, L));
      }
      /* senza notte (o senza finestre accese): una o due finestre sotto ogni comignolo */
      if (!luci.length) (f.fumi || []).forEach((q, i) => {
        const r = q.w * .05 * f.iw / f.ih;
        luci.push({x: q.x - q.w * .18, y: q.y + q.w * .5 * f.iw / f.ih, r, seme: (i * .37 + .11) % 1, inImg: false});
        if (i % 2 === 0) luci.push({x: q.x + q.w * .16, y: q.y + q.w * .55 * f.iw / f.ih, r, seme: (i * .61 + .53) % 1, inImg: false});
      });
      luci.forEach(L => { L.n = pr(L.x, L.y); });
      f.luci = luci;
    } catch(e) { f.luci = []; }
    this.lavoroDa = performance.now();
  }
  /* i bagliori della vita del paesaggio, nel foro: stessa inquadratura e stessa prospettiva del paesaggio */
  disegnaBagliori(foro, s, lista, f0, marg){
    const gl = this.gl, ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco), map = foro.map;
    const oc = s.occhio || {x: 0, z: 0}, kz = 1 + (oc.z || 0) * .15, lato = s.prospettiva ? foro.lato : 0, ris = ((marg || 1.04) - 1) / 2;
    const scala = (foro.h / map[3]) / 1000;   /* pixel della vista intera su 1000 */
    const luce = (.45 + .55 * Math.sqrt(Math.max(0, s.luce || 0))) * (1 - (s.buio || 0));
    const d = this.datiBag;
    const metti = modo => {
      let n = 0;
      for (const b of lista){
        if (b.modo !== modo || n >= 96 * 6) continue;
        let u = (b.x - ci[0]) / ci[2], v = (b.y - ci[1]) / ci[3];
        u = (u - .5) / kz + .5; v = (v - .5) / kz + .5;
        { const s0 = (oc.x || 0) * .08 * (1 - .7 * b.n), c0 = 1 - (2 * (u - map[0]) / map[2] - 1) ** 2;   /* come spostaVivo */
          const wE = Math.min(1, ris / Math.max(Math.abs(s0), 1e-4));
          u -= lato * .012 * (b.n - .35) + s0 * (wE + (1 - wE) * c0); }
        const px = (u - map[0]) / map[2] * foro.w, py = (v - map[1]) / map[3] * foro.h;
        const R = Math.max(2, b.alone * scala), cr = Math.min(1, Math.max(.6, b.core * scala) / R);
        if (px < -R || py < -R || px > foro.w + R || py > foro.h + R) continue;
        const k = modo === 'piu' ? b.forza * luce : 1;
        const col = modo === 'piu' ? b.col.map(c => c * k) : b.col.map(c => 1 + (c - 1) * b.forza);
        const Ry = R * (b.ry || 1);   /* ry: allungato in verticale (fiamma) o schiacciato (bagliore sul terreno) */
        for (const [qx, qy] of [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]){
          d.set([px + qx * R, py + qy * Ry, qx, qy, col[0], col[1], col[2], cr], n * 8); n++;
        }
      }
      if (!n) return;
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 8), gl.DYNAMIC_DRAW);
      gl.uniform1f(this.ub.uModo, modo === 'piu' ? 0 : 1);
      if (modo === 'piu') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); else gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    };
    gl.useProgram(this.pb); gl.uniform2f(this.ub.uFori, foro.w, foro.h);
    if (this.ist){ this.ist.div(1, 0); this.ist.div(2, 0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bBag);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.enable(gl.BLEND);
    metti('per'); metti('piu');
    gl.disable(gl.BLEND); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.useProgram(this.p); this.quad();
  }
  async _mostra(chiave, url, profondita, video, dur, fuoco, cielo, fermo, maschera, comignoli = null, alberi = null, ricolora = false, notte = null, stelle = false){
    const f = this.fonteVuota(); f.url = chiave; f.fuoco = fuoco;
    /* 8/11: tutti i file partono insieme (prima uno dopo l'altro: immagine, profondità, cielo, video, fermo…
       e nell'app si restava al nero per molti secondi); poi si montano nello stesso ordine di prima */
    const pDep = profondita ? caricaImg(profondita).catch(() => null) : null;
    const pAlberi = alberi && alberi !== url ? caricaImg(alberi).catch(() => null) : null;
    const pCielo = cielo ? caricaImg(cielo).catch(() => null) : null;
    const pVideo = video ? apriVideo(video, this.videoIntero).catch(() => null) : null;
    const pCucito = video ? fetch(video.split('?')[0].replace(/\.mp4$/, '-originale.mp4'), {method:'HEAD', cache:'no-store'}).then(r => r.ok).catch(() => false) : null;
    /* 16/11 · i tratti per gli allacci a caso (aggiornaTratti), se il cucitore li ha scritti accanto al video */
    const pTratti = video ? fetch(video.split('?')[0].replace(/\.mp4$/, '-segmenti.png') + '?t=' + Date.now(), {cache:'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null) : null;
    const pFermo = video && fermo && maschera && this.unita >= 10 ? Promise.all([caricaImg(fermo), caricaImg(maschera)]).catch(() => null) : null;
    const im = await caricaImg(url);
    f.img = im; f.iw = im.naturalWidth; f.ih = im.naturalHeight; f.tex = this.texture(); this.carica(f.tex, this.entro(im)); this.mip(f.tex);
    let dimg = null;
    if (pDep){ dimg = await pDep; if (dimg){ f.depTex = this.texture(); let dc = dimg; try { dc = mascheraCielo(dimg, this.internoInArrivo); } catch(e) { /* senza maschera: niente cielo che scorre, ma il resto va */ } this.carica(f.depTex, dc); this.mip(f.depTex); } }   /* 10/11: verde = maschera del cielo */
    const imA = pAlberi ? (await pAlberi) || im : im;   /* 8/11: di notte gli alberi si trovano sull'immagine del giorno */
    let mA = null;
    try { f.aTex = this.texture(); mA = mascheraAlberi(imA, dimg); this.carica(f.aTex, mA); } catch(e) { f.aTex = null; }
    f.nebG = !!f.aTex && !!alberi && (!pAlberi || imA !== im);   /* 14/11: il blu della maschera è la nebbia del GIORNO (non di quest'ora, se l'immagine del giorno non è arrivata) */
    f.dimg = dimg; await this.caricaFumi(f, comignoli, dimg);
    /* 16/11 · i fasci di luce delle finestre di un interno (mascheraFasci): nel quarto canale della maschera delle chiome,
       che dentro non serve (255 = niente fascio: anche la maschera bianca di riserva vuol dire niente) */
    f.fascio = null; f.pavimentoOk = false;
    if (this.internoInArrivo && f.aTex && mA){
      if (f.fasciAng != null) try { const fz = mascheraFasci(im, f.fasciAng, mA.width, mA.height, f.fasciVetri);
        if (fz){ for (let i = 0; i < fz.a.length; i++) mA.data[i * 4 + 3] = 255 - fz.a[i]; f.fascio = fz; } } catch(e) { f.fascio = null; }
      /* 16/11 sera · dentro il rosso (le chiome, che non ci sono) porta i legni e il pavimento da fare noce: il passaggio del
         vento lo passa al disegno. ⚠ Dalle 19:30 (Maurizio: «anche i legni più tipo noce, anche il parquet») i legni vengono
         da una maschera fatta da Claude sull'immagine (rosso, 1024 di larghezza): allora la maschera intera si rifà a 1024,
         col fascio ingrandito nel quarto canale */
      let lg = null; if (f.legno) try { lg = await caricaImg(f.legno.url); } catch(e) { lg = null; }
      let M = mA;
      if (lg){
        const LW = 1024, LH = Math.max(8, Math.round(LW * mA.height / mA.width)), cv = document.createElement('canvas'); cv.width = LW; cv.height = LH;
        const cx = cv.getContext('2d', {willReadFrequently: true}); cx.drawImage(lg, 0, 0, LW, LH); const ld = cx.getImageData(0, 0, LW, LH);
        M = new ImageData(LW, LH);
        for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++){
          const k = (y * LW + x) * 4, fx = Math.min(mA.width - 1.001, (x + .5) * mA.width / LW - .5), fy = Math.min(mA.height - 1.001, (y + .5) * mA.height / LH - .5);
          const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), ax = Math.max(0, fx - x0), ay = Math.max(0, fy - y0), A = (xx, yy) => mA.data[(yy * mA.width + xx) * 4 + 3];
          M.data[k] = ld.data[k]; M.data[k + 3] = Math.round(A(x0, y0) * (1 - ax) * (1 - ay) + A(x0 + 1, y0) * ax * (1 - ay) + A(x0, y0 + 1) * (1 - ax) * ay + A(x0 + 1, y0 + 1) * ax * ay);
        }
      }
      let pm = null; if (f.pavimento) try { pm = mascheraPoligono(f.pavimento.poli, M.width, M.height); } catch(e) { pm = null; }
      for (let i = 0, n = M.width * M.height; i < n; i++){ M.data[i * 4] = Math.max(lg ? M.data[i * 4] : 0, pm ? pm[i] : 0); M.data[i * 4 + 1] = M.data[i * 4 + 2] = 0; }
      f.pavimentoOk = !!pm || !!lg; f.legnoOk = !!lg;
      this.carica(f.aTex, M);
    }
    /* 21/11 · gli interruttori: stanza spenta in alto, i sei riquadri della luce sotto, in una texture sola (luciAccese) */
    f.lTex = null; f.lH = 0;
    if (this.internoInArrivo && f.luciDef) try {
      const [sp, lu] = await Promise.all([caricaImg(f.luciDef.spento), caricaImg(f.luciDef.luci)]);
      const W = sp.naturalWidth, H = sp.naturalHeight + lu.naturalHeight, gl = this.gl;
      if (lu.naturalWidth !== W) throw new Error('luci: larghezze diverse');
      f.lTex = this.texture(); gl.bindTexture(gl.TEXTURE_2D, f.lTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sp);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, sp.naturalHeight, gl.RGBA, gl.UNSIGNED_BYTE, lu);
      f.lH = sp.naturalHeight / H;
    } catch(e) { console.warn('luci', e); if (f.lTex) this.gl.deleteTexture(f.lTex); f.lTex = null; }
    this.apriInserti(f);
    /* ⚠ 16/11 sera (Maurizio: «elimina quei puntini luminosi in alto a sinistra accanto allo stemma sopra il camino»): erano le
       «luci delle case» di js/vita.js, cercate nell'immagine della notte. In un interno la notte è un altro dipinto (torce
       e candele in altri posti): all'alba se ne accendevano 17 a caso, sui muri. Dentro le luci sono quelle dipinte */
    this.caricaVita(f, this.internoInArrivo ? null : notte, dimg, imA);   /* luci delle case e prati delle lucciole: senza aspettare */
    /* il cielo che scorre (serve la profondità, per sapere dov'è il cielo). Il video resta per quello che
       si muove sotto il cielo (nebbia nelle valli, fumo dei camini): il suo cielo non si usa più */
    if (pCielo && dimg){
      try {
        const ci = await pCielo, oriz = ci ? orizzonte(dimg) : 0;
        if (ci && oriz > .05){ f.cTex = this.texture(); this.carica(f.cTex, this.entro(ci)); this.mip(f.cTex); f.cm = [oriz, ci.naturalWidth / ci.naturalHeight, f.iw / f.ih, 0];
          /* 14/11 sera: dove sono le nuvole di questo cielo, per le stelle (solo se a questa luce le stelle si possono
             vedere: lo dice la pagina; il calcolo costa un decimo di secondo). Se non riesce, le stelle restano come prima */
          if (stelle && this.unita >= 14){ try { const nu = await mascheraNuvole(ci); f.nTex = this.texture(); this.carica(f.nTex, nu); f.nuvole = nu.tempi; } catch(e2) { f.nTex = null; } } }
      } catch(e) { /* nessun cielo panoramico per questo paesaggio */ }
    }
    if (pVideo){ f.video = await pVideo; if (f.video){ f.vtex = this.texture(); f.atlante = this.pAtl ? atlanteValido(f.video[0]._atlante) : null; } }
    /* cucito? cuci-animazione.py lascia accanto il file dell'AI, «…-originale.mp4» */
    if (f.video) f.cucito = await pCucito;
    if (f.video && f.cucito) f.trattiGrezzi = await pTratti;   /* si controllano quando il video sa quanto dura (aggiornaVideo) */
    f.interno = !!this.internoInArrivo;   /* 15/11: il giro del video di un interno si chiude in tre fotogrammi (aggiornaVideo) */
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
          /* 10/11: il fermo del giorno com'è (con le sue riduzioni): il disegno toglie al video il suo fermo e tiene il
             movimento (vedi paesaggio()) */
          const dd = new ImageData(new Uint8ClampedArray(d.data), W, H);
          for (let i = 3; i < dd.data.length; i += 4) dd.data[i] = 255;
          f.rTex = this.texture(); this.carica(f.rTex, dd); this.mip(f.rTex);
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
  /* ⚠ 18/11 sera (Maurizio: «anche cliccando tutto schermo non va», persone ferme a tutte le ore). Quando l'iPhone non lascia
     partire i video da soli (risparmio energetico) il video principale aspetta un tocco (apriVideo), ma nell'app, a tutto
     schermo, i tocchi non arrivano alla pagina (iframe con pointer-events:none) e gli altri video, il secondo del cucito e
     gli inserti (gatto, fuochi), partono più tardi da soli e venivano rifiutati. Qui, chiamato dentro un tocco vero della
     pagina che ci contiene: ogni video ancora fermo parte e si rimette subito dov'era; da lì in poi l'iPhone lo lascia
     partire quando lo chiede il motore. Il principale lo fa partire apriVideo, col suo «pointerdown» */
  sveglia(){
    for (const f of this.fonti) for (const v of [...(f.video || []), ...(f.ins || []).map(I => I && I.v)]){
      if (!v || !v.paused || v._sveglio) continue;
      v._sveglio = true; const t = v.currentTime;
      const p = v.play(); if (p && p.then) p.then(() => { v.pause(); try { v.currentTime = t; } catch(e) {} }).catch(() => { v._sveglio = false; });
    }
  }
  /* ⚠ 16/11 sera · I VIDEO «INSERTO» (il gatto, i fuochi della taverna): ognuno è un <video> piccolo e muto con la sua texture.
     «continuo»: gira in tondo (i fuochi). «riposo»: fermo sul primo fotogramma (il dipinto); dopo un'attesa a caso fa uno dei
     suoi tratti, a caso e mai lo stesso due volte di fila, e si ferma sull'ultimo fotogramma, che è di nuovo il dipinto */
  apriInserti(f){
    f.ins = [];
    if (!(f.inserti || []).length || this.unita < 16) return;
    f.inserti.forEach((q, j) => {
      const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = v.defaultMuted = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.preload = 'auto'; v.loop = q.modo === 'continuo';
      const I = {q, v, tex: this.texture(), pronto: false, nuovo: true, attivo: -1, ultimo: -1, prossimo: performance.now() + 1000 * (3 + Math.random() * 6), fatti: 0};
      v.addEventListener('loadeddata', () => { I.pronto = true; I.nuovo = true; if (q.modo === 'continuo') v.play().catch(() => {}); });
      v.addEventListener('seeked', () => { I.nuovo = true; });
      v.addEventListener('error', () => { I.errore = true; });
      nuovoFotogramma(v);   /* 19/11 sera: solo per annotare i buchi (lo stato); l'inserto si carica a ogni disegno */
      f.ins[j] = I;
      /* 19/11 sera · anche l'inserto scaricato intero prima di partire (vedi scaricaIntero): fino ad allora lì resta il dipinto */
      const avvia = src => { v.src = src; if (q.modo === 'continuo') v.play().catch(() => {}); else v.load(); };
      if (this.videoIntero) scaricaIntero(q.url, 300).then(u => { if (f.ins[j] === I) avvia(u || q.url); else if (u) URL.revokeObjectURL(u); });
      else avvia(q.url);
    });
  }
  aggiornaInserti(f){
    const gl = this.gl, ora = performance.now();
    for (const I of f.ins || []){
      if (!I || !I.pronto || I.errore) continue;
      const v = I.v, q = I.q;
      if (q.modo === 'continuo'){   /* in tondo: «loop» del lettore, e se si ferma in fondo (succede) si riparte da capo a mano */
        if (v.ended || (v.duration && v.currentTime >= v.duration - .04)){ v.currentTime = 0; v.play().catch(() => {}); }
        else if (v.paused) v.play().catch(() => {});
      }
      else if (q.tratti.length){
        if (I.attivo < 0 && ora >= I.prossimo){
          let k = Math.floor(Math.random() * q.tratti.length); if (k === I.ultimo && q.tratti.length > 1) k = (k + 1 + Math.floor(Math.random() * (q.tratti.length - 1))) % q.tratti.length;
          I.attivo = k; I.ultimo = k; I.fatti++; v.currentTime = q.tratti[k][0]; v.play().catch(() => {});
        } else if (I.attivo >= 0 && (v.currentTime >= q.tratti[I.attivo][1] - .02 || v.ended)){
          v.pause(); I.attivo = -1; const [a, b] = q.attesa; I.prossimo = ora + 1000 * (a + Math.random() * Math.max(0, b - a));
        }
      }
      if (v.readyState >= 2 && (!v.paused || I.nuovo)){
        gl.bindTexture(gl.TEXTURE_2D, I.tex);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v); I.nuovo = false; I.ok = true; } catch(e) {}
      }
    }
  }
  libera(f){ const gl = this.gl; if (!f) return;
    for (const I of f.ins || []) if (I){ lasciaVideo(I.v); if (I.tex) gl.deleteTexture(I.tex); }
    f.ins = [];
    for (const t of [f.tex, f.depTex, f.vtex, f.vtexB, f.cTex, f.fTex, f.aTex, f.rTex, f.nTex, f.lTex]) if (t) gl.deleteTexture(t);
    if (f.video) f.video.forEach(lasciaVideo);
    f.tex = f.depTex = f.vtex = f.vtexB = f.cTex = f.fTex = f.aTex = f.rTex = f.nTex = f.lTex = null; f.ok = false;
    if (f.atlFb){ for (const k in f.atlFb) try { this.gl.deleteFramebuffer(f.atlFb[k].fb); } catch(e) {} f.atlFb = null; } if (f.atlTmp){ try { this.gl.deleteTexture(f.atlTmp); } catch(e) {} f.atlTmp = null; } f.atlante = null; }
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
    /* ⚠ 15/11 (Maurizio, finestrelle della taverna: «si vede ancora il loop subito dopo che mette sul tavolo il
       bicchiere»): dentro, il mezzo secondo di dissolvenza sovrapponeva due momenti diversi dell'uomo (braccia e
       cucchiaio doppi). Il video di un interno lo chiude già il cucitore seguendo il movimento: qui basta un passaggio
       di tre fotogrammi */
    const [a, b] = f.video, D = a.duration || 0, coda = f.cucito ? Math.min(f.interno ? .1 : .5, D * .08) : f.fTex ? Math.min(1, D * .15) : Math.min(.25, D * .05);
    if (f.trattiGrezzi !== undefined && D > 0){ f.tratti = tratti(f.trattiGrezzi, D); f.trattiGrezzi = undefined; }
    if (f.tratti) return this.aggiornaTratti(f, a, b);
    if (D > 2 && a.currentTime > D - coda && b.paused){ b.currentTime = 0; b.play().catch(() => {}); }
    if (!b.paused){
      const k = Math.min(1, Math.max(0, (a.currentTime - (D - coda)) / coda));
      if (a.ended || k >= 1){ a.pause(); f.video = [b, a]; f.vNuovo = true; return this.aggiornaVideo(f); }
      if (b.readyState >= 2 && nuovoFotogramma(b)) this.caricaVideo(f, 'B', b);
      f.vk = f.vtexB ? k : 0;
    }
    /* il fotogramma si carica sulla scheda solo quando è nuovo: il video ne ha 30 al secondo, lo schermo
       60 giri (prima lo si ricaricava a ogni giro: il doppio del lavoro, e sul Raspberry si perdevano immagini) */
    if (a.readyState >= 2){ if (nuovoFotogramma(a) || f.vNuovo){ this.caricaVideo(f, 'A', a); f.vNuovo = false; } return true; }
    return false;
  }

  /* ⚠ 16/11 · GLI ALLACCI A CASO (Maurizio: «tipo che butta il pane nella cesta una volta ogni 2/3 giri di altre azioni»).
     Un'animazione a tappe (la cuoca dell'alba: impasta; sparge il sale; fa la pagnottina e la mette nella cesta) è
     cucita in un file solo, a tratti che partono e tornano tutti sulla posa dipinta. Il cucitore scrive dove cominciano
     («…-segmenti.png», con nome, peso, ogni quanti tratti torna quello raro, se può ripetersi di fila). Qui, a ogni ritorno
     sulla posa, si sceglie il tratto dopo: se è quello che segue nel file non si fa niente, altrimenti il secondo lettore
     si mette per tempo (2,5 s prima) sull'inizio di quel tratto, fermo, e alla fine del tratto di adesso parte e si
     sfuma in un quinto di secondo (la posa è la stessa). Se il secondo lettore non è pronto, si resta sul file. */
  /* ⚠ 19/11 · GLI AVVENTORI CHE SI BLOCCANO (Maurizio, tramonto della taverna: «gli avventori ogni tanto è come se si
     blocchino»). Al salto il secondo lettore partiva solo un quinto di secondo prima della fine del tratto, e il motore
     passava a lui a fine sfumata anche se non era ancora partito davvero (sulla Ally, con tre video aperti, il play ci mette
     più di così): sullo schermo restava ferma la posa, a lettore di prima già fermo, finché il secondo non partiva. In più
     il primo segno di «fotogramma nuovo» arrivava subito dopo la ricerca, anche da fermo. Ora: il secondo lettore parte
     mezzo secondo prima, da mezzo secondo prima dell'inizio del suo tratto (lì nel file c'è la fine di un altro tratto, che
     va sulla stessa posa: il cucitore ci mette un pezzo anche prima del primo tratto); conta solo quando il suo tempo è
     andato avanti davvero; la sfumata comincia quando corre, e il primo lettore non si ferma prima. Se non parte entro
     0,6 s dalla fine del tratto, si va avanti nel file come prima */
  aggiornaTratti(f, a, b){
    const S = f.tratti, P = .2, PRE = .5, t = a.currentTime;
    if (f.tratto == null){ f.tratto = Math.max(0, S.findIndex(s => t < s.a - .05)); f.dopo = S.map(() => 0); f.soglia = S.map(s => s.ogni ? sogliaOgni(s) : 0); f.storia = []; }
    const fine = S[f.tratto].a;
    if (f.prossimo == null && t > fine - 2.5 && !a.paused){
      f.prossimo = scegliTratto(f); f.salto = f.prossimo !== f.tratto + 1;          /* dall'ultimo al primo è sempre un salto: il file finisce */
      if (f.salto){ const da = S[f.prossimo].da; f.pre = Math.min(PRE, da); b.pause(); b.currentTime = da - f.pre; f.bPartito = false; }
    }
    if (f.prossimo != null && !f.salto && t >= fine){ f.tratto = f.prossimo; f.prossimo = null; }
    if (f.salto){
      if (!f.bPartito && t > fine - Math.max(P, f.pre) && b.readyState >= 2 && !b.seeking){ b.play().catch(() => {}); f.bPartito = true; f.bCaricato = false; f.bT = b.currentTime; f.kDa = null; }
      if (f.bPartito){
        const corre = !b.paused && b.currentTime > f.bT + .03;
        if (corre && b.readyState >= 2 && nuovoFotogramma(b)){ this.caricaVideo(f, 'B', b); f.bCaricato = true; }
        if (f.bCaricato && f.kDa == null) f.kDa = Math.max(fine - P, t);
        const k = f.kDa == null ? 0 : Math.min(1, Math.max(0, (t - f.kDa) / P));
        f.vk = k;
        if (f.bCaricato && (a.ended || k >= 1)){ a.pause(); f.video = [b, a]; f.tratto = f.prossimo; f.prossimo = null; f.salto = f.bPartito = false; f.vNuovo = true; f.saltiFatti = (f.saltiFatti || 0) + 1; f.ritardi = (f.ritardi || []).concat(Math.round((f.kDa - (fine - P)) * 100) / 100).slice(-20); return this.aggiornaVideo(f); }
        if (!f.bCaricato && (t > fine + .6 || a.ended)){ b.pause(); f.vk = 0; this.mancato(f, a, S); }
      } else if (t > fine + .6 || a.ended) this.mancato(f, a, S);                     /* il salto non riesce: si va avanti nel file */
    }
    if (a.readyState >= 2){ if (nuovoFotogramma(a) || f.vNuovo){ this.caricaVideo(f, 'A', a); f.vNuovo = false; } return true; }
    return false;
  }

  mancato(f, a, S){
    f.salto = f.bPartito = false; f.prossimo = null; f.tratto = a.ended ? 0 : Math.min(S.length - 1, f.tratto + 1); f.saltiMancati = (f.saltiMancati || 0) + 1;
    if (a.ended){ a.currentTime = 0; a.play().catch(() => {}); }
  }

  /* ⚠ 30/10: la mappa di profondità è dell'immagine intera, il video invece ne è un taglio 9:16 (fatto quando
     è stato creato: copertura, orizzontale dall'inquadratura scelta, verticale al centro). Prima si leggeva
     la mappa col taglio del video: profondità sfasate, e le case si spostavano come fossero cielo. */
  cropProfondita(f, c){
    const vw = (f.atlante ? f.atlante.w : f.video[0].videoWidth) || 9, vh = (f.atlante ? f.atlante.h : f.video[0].videoHeight) || 16;
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

  /* ⚠ 14/11 · GLI UCCELLI E LE DUE FINESTRELLE (Maurizio: «gli uccelli nelle finestrelle si trovano a volare nella stessa
     posizione, dovrebbero essere sfalsati per la prospettiva»). Le due finestrelle guardano due strisce dello stesso
     panorama (il trucco della prospettiva, 4/11), ma gli uccelli si disegnavano nello stesso punto di tutti e due i fori:
     due copie dello stesso volo. Ora il cielo degli uccelli è largo quanto il panorama che le due finestrelle vedono
     insieme, e ognuna ne mostra la sua striscia, la stessa del paesaggio: uno stormo che attraversa passa da una
     finestrella all'altra, e nel pezzo in comune si vede in tutte e due, spostato come l'elemento cardine.
     Torna {k, inizio}: k = quante finestre è largo il campo (1: un foro solo, il TV, le immagini verticali),
     inizio[i] = dove comincia il foro i nel campo (0..1). Le strisce sono quelle vere del paesaggio (crop). */
  campoUccelli(fori, margine = 1.04){
    const f0 = this.fonti[0], uno = {k: 1, inizio: fori.map(() => 0)};
    if (!f0 || !f0.ok || fori.length < 2 || fori.some(f => !f.striscia)) return uno;
    const cr = fori.map(f => this.crop(f0, f.aspetto, margine, f0.fuoco, f.striscia, f0.fuoco)), w = cr[0][2];
    if (!(w > 0) || cr.some(c => Math.abs(c[2] - w) > 1e-4)) return uno;
    const x0 = Math.min(...cr.map(c => c[0])), x1 = Math.max(...cr.map(c => c[0] + c[2])), k = (x1 - x0) / w;
    if (!(k > 1.001) || k > 4) return uno;
    return {k, inizio: cr.map(c => (c[0] - x0) / (x1 - x0))};
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
    /* 21/11 · gli interruttori: ogni gruppo va verso quello che chiede la scena in poco più di un secondo (una fiamma che si
       accende o si spegne, non uno scatto) */
    { const ora = performance.now(), dt = this._lT == null ? 0 : Math.min(.25, (ora - this._lT) / 1000); this._lT = ora;
      const ob = this.luciVolute || {t: 1, l: 1, c: 1}, w = this.luciW || (this.luciW = {t: ob.t, l: ob.l, c: ob.c});
      for (const g of 'tlc'){ const d = (+ob[g] || 0) - w[g]; w[g] = Math.abs(d) < .002 ? +ob[g] || 0 : w[g] + Math.sign(d) * Math.min(Math.abs(d), dt / 1.2); } }
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
    if (f0.ins && f0.ins.length && !sp.has('inserti')) this.aggiornaInserti(f0);
    const haImg = f0.ok && !s.trasparente;
    const lega = (unita, t) => { gl.activeTexture(gl.TEXTURE0 + unita); gl.bindTexture(gl.TEXTURE_2D, t || this.vuota); };
    lega(0, haImg ? (v0 ? f0.vtex : f0.tex) : null);
    lega(1, haImg && this.mix > 0 ? (v1 ? f1.vtex : f1.tex) : null);
    lega(2, f0.depTex); lega(3, f1.depTex); lega(4, haImg && f0.vk > 0 ? f0.vtexB : null); lega(5, null); lega(6, f0.cTex || f0.lTex); lega(7, f1.cTex || f1.lTex); if (this.unita >= 10){ lega(8, f0.fTex); lega(9, f1.fTex); } if (this.unita >= 13) lega(12, f0.rTex);
    if (this.unita >= 12) lega(11, f0.aTex || this.bianca);   /* 14/11: serve anche alla nebbiolina di notte, non solo al vento */
    if (this.unita >= 14) lega(13, f0.nTex);   /* 14/11 sera: le nuvole del cielo che scorre, per le stelle (le legge il passaggio del vento) */
    /* quando le stelle si vedono (anche appena, al tramonto) il passaggio del vento porta al disegno quanta nuvola c'è in ogni punto del cielo */
    const nuvoleCielo = haImg && !!f0.cTex && !!f0.nTex && this.unita >= 14 && !this.senzaNuvole && !sp.has('cielo') && (s.notte || 0) > .005;
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
    gl.uniform4f(u.uLuciM0, haImg && f0.lTex && !sp.has('luci') ? 1 : 0, f0.lH || 0, 0, 0); gl.uniform4f(u.uLuciM1, haImg && f1.lTex && !sp.has('luci') ? 1 : 0, f1.lH || 0, 0, 0);
    gl.uniform3f(u.uLuciW, this.luciW.t, this.luciW.l, this.luciW.c);
    gl.uniform4fv(u.uCieloM0, haImg && f0.cTex && s.movimento && !sp.has('cielo') ? f0.cm : [0,0,0,0]); gl.uniform4fv(u.uCieloM1, haImg && f1.cTex && s.movimento ? f1.cm : [0,0,0,0]);
    gl.uniform1f(u.uCieloX, s.cieloX || 0);
    gl.uniform2f(u.uChiar, this.chiarezza ? this.chiarezza[0] : .5, this.chiarezza ? this.chiarezza[1] : 0);
    gl.uniform1f(u.uNebV, s.movimento && !sp.has('nebbiolina') ? (s.nebViva == null ? 1 : s.nebViva) : 0);   /* 9/11: quanta, secondo l'ora e il tempo (finestra/index.html) */
    gl.uniform1f(u.uNebG, f0.aTex && f0.nebG ? 1 : 0);   /* 14/11: la nebbia di giorno sta nel blu della maschera delle chiome */
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
    /* 14/11 sera: un interno: la luce dei fuochi respira (vedi «LA LUCE DEI FUOCHI, DENTRO»). 2 = interno con i fuochi
       spenti per prova: la maschera del video si legge comunque da interno (due piani) */
    const dentro = haImg && !!(s.vita && s.vita.interno) ? (sp.has('fuochi') ? 2 : 1) : 0;
    gl.uniform1f(u.uDentro, dentro);
    { const fu = dentro && s.fuori && !(f0.luciDef && f0.luciDef.scuri) ? s.fuori : [0, 0, 0, 0, 0];   /* 21/11: scuri chiusi, fuori non si vede */ gl.uniform4f(u.uFuori, fu[0] || 0, fu[1] || 0, fu[2] || 0, fu[3] || 0); gl.uniform1f(u.uFuoriN, fu[4] || 0);
      const vt = dentro && f0.fasciVetri ? f0.fasciVetri.slice(0, 4) : []; const vb = new Float32Array(16); vt.forEach((r, i) => vb.set(r, i * 4)); gl.uniform4fv(u.uVetri, vb); gl.uniform1f(u.uNVetri, vt.length); }   /* 21/11: + nebbia e neve */
    /* 16/11 · i fasci di luce delle finestre (mascheraFasci); la larghezza del foro si mette foro per foro */
    const fasci = dentro === 1 && f0.fascio && !sp.has('fasci') ? f0.fascio : null;
    gl.uniform3fv(u.uFascioC, fasci ? fasci.col : [1, .96, .86]);
    gl.uniform1f(u.uFuoriK, dentro === 1 && !sp.has('fuori') ? (f0.fuoriK || 0) : 0);   /* 20/11 */
    gl.uniform1f(u.uPolvK, dentro === 1 && !sp.has('polvere') ? (f0.polvK != null ? f0.polvK : 1) : 1);   /* 20/11 sera */
    gl.uniform2f(u.uScuro, dentro === 1 ? (f0.scuro || 0) : 0, dentro === 1 && f0.pavimentoOk ? (f0.legnoOk && f0.legno ? f0.legno.k : f0.pavimento ? f0.pavimento.k : 0) : 0);   /* 16/11 sera */
    const me = s.meteora || null;
    gl.uniform4fv(u.uMeteora, me ? me.da : [0,0,0,0]); gl.uniform1f(u.uMeteoraK, me ? me.k : 0);
    const oc = s.occhio || {x:0, z:0}; gl.uniform3f(u.uOcchio, oc.x || 0, ((s.margine || 1.04) - 1) / 2, oc.z || 0);   /* y: la riserva ai lati (spostaVivo) */
    const marg = s.margine || 1.04;
    const campoU = uc.n ? this.campoUccelli(fori, marg) : {k: 1};   /* 14/11: con due finestrelle, la striscia di ognuna nel cielo degli uccelli */
    const tempo = (s.nebbia || 0) + (s.pioggia || 0) + (s.neve || 0) > .005 || (s.coperto || 0) > .01 || (s.lampo || 0) > .001;
    const gocce = this.ist && ((s.pioggia || 0) > .01 || (s.neve || 0) > .01 || (!sp.has('vita') && (s.pulviscolo || 0) > .01));
    /* 9/11 · la vita del paesaggio a quest'ora (js/vita.js): luci delle case, fuochi lontani, lucciole */
    let vitaBagliori = [], vitaFumi = [];
    if (this.vita && haImg && s.vita && !sp.has('vita')){
      const adesso = performance.now(), dtv = this._vitaT ? Math.min(.25, (adesso - this._vitaT) / 1000) : 0; this._vitaT = adesso;
      this.vita.aggiorna(dtv, f0, s.vita.o, s.vita.k, s);
      vitaBagliori = this.vita.bagliori(s); vitaFumi = s.movimento ? this.vita.fumi() : [];
    }
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
      const c0v = f0.ok ? this.crop(v0 ? {iw:(f0.atlante ? f0.atlante.w : f0.video[0].videoWidth) || f0.iw, ih:(f0.atlante ? f0.atlante.h : f0.video[0].videoHeight) || f0.ih} : f0, foro.aspetto, marg, v0 ? null : f0.fuoco, foro.striscia, f0.fuoco) : [0,0,1,1];
      let tv = null;
      if (haImg && mov && this.unita >= 12){
        const m = this.bufferMeteo(i, foro.w, foro.h, this.vento); tv = m.tex;
        lega(5, null); lega(10, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, m.w, m.h);
        lega(11, f0.aTex || this.bianca); lega(6, f0.cTex);
        /* 14/11 sera: anche la 13, ogni volta. bufferMeteo, quando crea l'immagine del vento (al primo disegno e a ogni cambio di
           grandezza), la lascia legata all'unità attiva in quel momento, che è l'ultima legata qui sopra: se resta la 13, questo
           passaggio leggerebbe l'immagine su cui sta disegnando e il disegno verrebbe rifiutato (per un fotogramma niente vento). */
        if (this.unita >= 14) lega(13, f0.nTex);
        gl.useProgram(this.pv);
        gl.uniform4fv(this.uv.uMap, foro.map); gl.uniform1f(this.uv.uT, s.t); gl.uniform1f(this.uv.uVento, Math.max(0, Math.min(1, s.vento || 0)));
        gl.uniform4fv(this.uv.uCropD, v0 ? this.cropProfondita(f0, c0v) : c0v);
        gl.uniform4fv(this.uv.uCieloM, f0.cTex && !sp.has('cielo') ? f0.cm : [0,0,0,0]); gl.uniform1f(this.uv.uCieloX, s.cieloX || 0);
        gl.uniform1f(this.uv.uHaNuvole, nuvoleCielo ? 1 : 0);
        gl.uniform1f(this.uv.uDentro, dentro);
        gl.uniform4f(this.uv.uFascioD, fasci ? fasci.dir[0] : 0, fasci ? fasci.dir[1] : 1, fasci ? 1 : 0, foro.aspetto);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      /* 15/11: le fiamme vive degli interni, nella vista (come il fumo) */
      const fiamme = haImg && f0.ok && s.movimento && !sp.has('fiamme') && !sp.has('candele') && s.vita && s.vita.interno ? (f0.fiamme || []).filter(q => !q.g || !f0.lTex || this.luciW[q.g] > .02) : [];   /* 21/11: solo i gruppi accesi */   /* 19/11: «candele» solo queste, «camini» solo i camini (banco) */
      if (fiamme.length){
        const ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco);
        if (!this.fiammaDati) this.fiammaDati = new Float32Array(48);
        fiamme.forEach((q, j) => { this.fiammaDati[j * 4] = (q.x - ci[0]) / ci[2]; this.fiammaDati[j * 4 + 1] = (q.y - ci[1]) / ci[3]; this.fiammaDati[j * 4 + 2] = q.h / ci[3]; this.fiammaDati[j * 4 + 3] = q.s; });
        /* 19/11 sera: i rumori delle fiamme, una volta per immagine (stesse formule che il disegno faceva su ogni punto) */
        if (!this.fiammaS){ this.fiammaS = new Float32Array(48); this.fiammaL = new Float32Array(48); }
        fiamme.forEach((q, j) => { const w = this.fiammaDati[j * 4 + 3], t = s.t * 1.25 + w * 13.7;
          for (let k = 0; k < 4; k++){ const su = k * .43333; this.fiammaS[j * 4 + k] = (rumoreJ(t * 1.9, su * 1.1 + w * 5) - .5) * .6 + (rumoreJ(t * 5.3, su * 2.3 + w * 9) - .5) * .4; }
          this.fiammaL[j * 4] = (rumoreJ(t * 3.1 + 3.7, w * 7) - .5) * .6 + (rumoreJ(t * 7.9, w * 3) - .5) * .4;
          this.fiammaL[j * 4 + 1] = rumoreJ(t * 6.1, w) * .65 + rumoreJ(t * 11.3, w + 2) * .35 - .5; });
        /* 21/11 · una fiamma che si accende o si spegne si muove e trema quanto è accesa */
        fiamme.forEach((q, j) => { const k = q.g && f0.lTex ? this.luciW[q.g] : 1; if (k < 1){ for (let n = 0; n < 4; n++) this.fiammaS[j * 4 + n] *= k; this.fiammaL[j * 4] *= k; this.fiammaL[j * 4 + 1] *= k; } });
      }
      /* 1c. 19/11 sera · le fiamme dei punti a metà risoluzione (FIAMME_FRAG), se il disegno ha il passaggio */
      let ftx = null;
      if (fiamme.length && this.pfi && !sp.has('fiammeIntere')){
        lega(13, null);   /* prima: bufferMeteo, quando crea l'immagine, la lega all'unità attiva (così è la 13, non il cielo della 6) */
        const m = this.bufferMeteo(i, foro.w, foro.h, this.fiamBuf, 2); ftx = m.tex;
        lega(13, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, m.w, m.h);
        gl.useProgram(this.pfi);
        gl.uniform4fv(this.ufi.uMap, foro.map); gl.uniform1f(this.ufi.uAspetto, foro.aspetto); gl.uniform1f(this.ufi.uNFiamma, fiamme.length);
        gl.uniform4fv(this.ufi.uFiamma, this.fiammaDati); gl.uniform4fv(this.ufi.uFiammaS, this.fiammaS); gl.uniform4fv(this.ufi.uFiammaL, this.fiammaL);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      /* 2. il paesaggio col suo tempo */
      gl.useProgram(this.p);
      lega(5, tm); if (this.unita >= 12) lega(10, tv); gl.uniform1f(u.uHaVento, tv ? 1 : 0);
      lega(6, f0.cTex || f0.lTex);   /* 21/11: il passaggio del vento lascia la 6 col cielo (dentro: niente); le luci della taverna deserta stanno lì */
      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(foro.x, y, foro.w, foro.h); gl.scissor(foro.x, y, foro.w, foro.h);
      gl.uniform4fv(u.uMap, foro.map);
      gl.uniform1f(u.uAspetto, foro.aspetto); gl.uniform4f(u.uFascioD, fasci ? fasci.dir[0] : 0, fasci ? fasci.dir[1] : 1, fasci && tv ? 1 : 0, foro.aspetto);
      gl.uniform2f(u.uPix, foro.w / foro.map[2], foro.h / foro.map[3]);   /* pixel della vista intera */
      gl.uniform1f(u.uLato, s.prospettiva ? foro.lato : 0);
      if (campoU.k !== 1){   /* gli uccelli visti da questo foro: x del campo → x del foro */
        const du = this.uccDati || (this.uccDati = new Float32Array(96)), i0 = campoU.inizio[i], k = campoU.k, b = uc.box || [0, 0, 1, 1];
        du.set(uc.dati); for (let j = 0; j < uc.n; j++) du[j * 8] = (uc.dati[j * 8] - i0) * k;
        gl.uniform4fv(u.uU, du); gl.uniform4f(u.uUBox, (b[0] - i0) * k, b[1], (b[2] - i0) * k, b[3]);
      }
      const c0 = f0.ok ? this.crop(v0 ? {iw:(f0.atlante ? f0.atlante.w : f0.video[0].videoWidth) || f0.iw, ih:(f0.atlante ? f0.atlante.h : f0.video[0].videoHeight) || f0.ih} : f0, foro.aspetto, marg, v0 ? null : f0.fuoco, foro.striscia, f0.fuoco) : [0,0,1,1];
      const c1 = f1.ok ? this.crop(v1 ? {iw:(f1.atlante ? f1.atlante.w : f1.video[0].videoWidth) || f1.iw, ih:(f1.atlante ? f1.atlante.h : f1.video[0].videoHeight) || f1.ih} : f1, foro.aspetto, marg, v1 ? null : f1.fuoco, foro.striscia, f1.fuoco) : [0,0,1,1];
      gl.uniform4fv(u.uCrop0, c0); gl.uniform4fv(u.uCrop1, c1);
      gl.uniform4fv(u.uCropD0, v0 ? this.cropProfondita(f0, c0) : c0); gl.uniform4fv(u.uCropD1, v1 ? this.cropProfondita(f1, c1) : c1);
      /* il fumo dei comignoli di quello che si vede (quello nuovo, mentre sfuma dal vecchio) */
      /* 9/11: e quello dei fuochi lontani accesi (js/vita.js), dopo i comignoli, al massimo 8 in tutto */
      const fumi = haImg && f0.ok && s.movimento && !sp.has('fumo') ? (f0.fumi || []).slice(0, 6).concat(sp.has('vita') ? [] : vitaFumi).slice(0, 8) : [];
      if (fumi.length){
        const ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco);
        fumi.forEach((q, j) => { this.fumoDati[j * 4] = (q.x - ci[0]) / ci[2]; this.fumoDati[j * 4 + 1] = (q.y - ci[1]) / ci[3]; this.fumoDati[j * 4 + 2] = q.w / ci[2]; this.fumoDati[j * 4 + 3] = q.n; this.fumoForza[j] = q.forza == null ? 1 : q.forza; });
        gl.uniform4fv(u.uFumo, this.fumoDati); gl.uniform1fv(u.uFumoI, this.fumoForza);
      }
      gl.uniform1f(u.uNFumo, fumi.length); gl.uniform1f(u.uFumoA, 1 - (this.mix || 0));
      if (fiamme.length){ gl.uniform4fv(u.uFiamma, this.fiammaDati); gl.uniform4fv(u.uFiammaS, this.fiammaS); gl.uniform4fv(u.uFiammaL, this.fiammaL); }
      gl.uniform1f(u.uNFiamma, fiamme.length);
      lega(13, ftx); gl.uniform1f(u.uHaFiamT, ftx ? 1 : 0);   /* 19/11 sera: le fiamme già fatte a metà risoluzione */
      const camini = haImg && f0.ok && s.movimento && !sp.has('fiamme') && !sp.has('camini') && s.vita && s.vita.interno ? (f0.camini || []).filter(q => !q.g || !f0.lTex || this.luciW[q.g] > .5) : [];   /* 21/11: camino spento, la brace sta ferma */
      if (camini.length){
        const ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco);
        if (!this.caminoDati) this.caminoDati = new Float32Array(8);
        camini.forEach((q, j) => { this.caminoDati[j * 4] = (q.x - ci[0]) / ci[2]; this.caminoDati[j * 4 + 1] = (q.y - ci[1]) / ci[3]; this.caminoDati[j * 4 + 2] = q.w / 2 / ci[2]; this.caminoDati[j * 4 + 3] = q.h / ci[3]; });
        gl.uniform4fv(u.uCamino, this.caminoDati);
      }
      gl.uniform1f(u.uNCamino, camini.length);
      const parti = haImg && f0.ok && s.movimento && !sp.has('animali') && s.vita && s.vita.interno ? (f0.parti || []) : [];
      if (parti.length){
        const ci = this.crop(f0, foro.aspetto, marg, f0.fuoco, foro.striscia, f0.fuoco), A = foro.aspetto;
        if (!this.parteDati) this.parteDati = new Float32Array(36);
        parti.forEach((q, j) => { const o = j * 12, D = this.parteDati, vx = x => (x - ci[0]) / ci[2], vy = y => (y - ci[1]) / ci[3];
          D[o] = vx(q.px); D[o + 1] = vy(q.py); D[o + 2] = vx(q.cx); D[o + 3] = vy(q.cy);
          D[o + 4] = q.rx / ci[2] * A; D[o + 5] = q.ry / ci[3]; D[o + 6] = q.rot; D[o + 7] = q.sposta / ci[3];
          D[o + 8] = q.coda ? 1 : 0; D[o + 9] = q.seme; D[o + 10] = q.periodo; D[o + 11] = Math.hypot((q.cx - q.px) / ci[2] * A, (q.cy - q.py) / ci[3]) * 2; });
        gl.uniform4fv(u.uParte, this.parteDati);
      }
      gl.uniform1f(u.uNParte, parti.length);
      /* 16/11 sera · i riquadri dei video «inserto» */
      { const sam = [-1, -1, -1, -1, -1, -1, -1, -1], pesi = [1, 1, 1, 1, 1, 1, 1, 1], box = this.riqBox || (this.riqBox = new Float32Array(32)), tile = this.riqTile || (this.riqTile = new Float32Array(32)); let n = 0;
        if (haImg && f0.ok && s.movimento && !sp.has('inserti') && this.unita >= 16){
          (f0.ins || []).forEach((I, j) => { if (!I || !I.ok || n >= 8) return; lega(14 + j, I.tex);
            for (const r of I.q.riquadri){ if (n >= 8) break; box.set(r.box, n * 4); tile.set(r.tile, n * 4); pesi[n] = r.g && f0.lTex ? this.luciW[r.g] : 1; sam[n++] = j + (r.alfa ? 2 : 0) + (r.luce ? 4 : 0); } });
        }
        gl.uniform4fv(u.uRiqBox, box); gl.uniform4fv(u.uRiqTile, tile); gl.uniform4f(u.uRiqSam, sam[0], sam[1], sam[2], sam[3]); gl.uniform4f(u.uRiqW, pesi[0], pesi[1], pesi[2], pesi[3]);
        gl.uniform4f(u.uRiqSam2, sam[4], sam[5], sam[6], sam[7]); gl.uniform4f(u.uRiqW2, pesi[4], pesi[5], pesi[6], pesi[7]); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      /* 2b. luci delle case, falò e lucciole: piccoli bagliori sopra il paesaggio (js/vita.js) */
      if (vitaBagliori.length) this.disegnaBagliori(foro, s, vitaBagliori, f0, marg);
      /* 3. pioggia e neve (e il pulviscolo nella luce), goccia per goccia, sopra */
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
    if ((s.pulviscolo || 0) > .01 && !(this.spegni && this.spegni.has('vita'))){
      const g = (s.vita && s.vita.o === 'giorno' ? [1, .97, .88] : [1, .86, .62]).map(v => v * Math.min(1, luce * 1.25));
      strati(PULVISCOLO, 2, Math.min(1, s.pulviscolo), g, Math.min(1, s.pulviscolo * 1.2));
    }
    this.ist.div(1, 0); gl.disableVertexAttribArray(1);
    gl.disable(gl.BLEND);
  }
}

/* dove finisce il cielo, dall'alto (0..1), letto dalla mappa di profondità: per ogni colonna fin dove scende
   il cielo (quasi nero nella mappa), poi un valore alto fra le colonne (il cielo arriva lì quasi ovunque) */
/* dove ci sono alberi: R (con un po' intorno, perché le chiome escono dal contorno quando si piegano) dice al vento
   dove soffiare; G (solo le chiome) dice al disegno che cosa può muoversi.
   ⚠ 11/11 (Maurizio, TV grande: «in alcune zone si muove anche la casa a destra in basso o il prato, forse andrebbe
   controllato meglio dove non far muovere»): prima bastava il verde, e il verde è anche il prato (un terzo
   dell'immagine si muoveva); intorno alle chiome, larghe il 5% dell'immagine, si muoveva anche quello che era scuro:
   tetti, muri in ombra, sentieri. Ora una chioma è verde, ha la grana delle foglie (luce e ombra fitte: il prato è
   liscio) ed è più scura di quello che ha intorno; e si allarga di poco */
function mascheraAlberi(img, dimg){
  const W = 256, H = Math.max(8, Math.round(W * img.naturalHeight / img.naturalWidth)), W3 = W * 3, H3 = H * 3;
  const c = document.createElement('canvas'); c.width = W3; c.height = H3;
  const x = c.getContext('2d', {willReadFrequently:true});
  /* ⚠ 14/11 · un'immagine in 4K ridotta di colpo a 768 punti si riempie di grana finta, e in più è nitida davvero:
     la «grana delle foglie» usciva dappertutto (prati, campi, pendii) e un terzo del paesaggio ondeggiava. Si riduce a
     metà per volta (ogni punto è la media dei quattro sotto) e la grana si giudica rispetto a quella dell'immagine */
  let src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  while (sw > W3 * 2 && sh > H3 * 2){
    const m = document.createElement('canvas'); m.width = Math.round(sw / 2); m.height = Math.round(sh / 2);
    const mx2 = m.getContext('2d'); mx2.imageSmoothingEnabled = true; mx2.imageSmoothingQuality = 'high'; mx2.drawImage(src, 0, 0, m.width, m.height);
    src = m; sw = m.width; sh = m.height;
  }
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W3, H3); const d = x.getImageData(0, 0, W3, H3).data;
  let p = null; if (dimg){ x.clearRect(0, 0, W3, H3); x.drawImage(dimg, 0, 0, W, H); p = x.getImageData(0, 0, W, H).data; }
  const ss = (a, b2, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b2 - a))); return t * t * (3 - 2 * t); };
  /* a 3× la risoluzione: luminanza e verde (come fogliame() nel disegno) */
  const L3 = new Float32Array(W3 * H3), F3 = new Float32Array(W3 * H3);
  for (let i = 0; i < W3 * H3; i++){
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, .01), l = r * .299 + g * .587 + b * .114;
    L3[i] = l; F3[i] = ss(.88, .97, g / Math.max(r, .01)) * ss(.95, 1.05, g / Math.max(b, .01)) * ss(.06, .12, sat) * ss(.8, .6, l);
  }
  /* per cella: verde medio, luminanza media e grana (deviazione della luminanza su 3×3 a 3×) */
  const F = new Float32Array(W * H), L = new Float32Array(W * H), S = new Float32Array(W * H);
  for (let y = 0; y < H3; y++) for (let x3 = 0; x3 < W3; x3++){
    const i = y * W3 + x3, k = Math.floor(y / 3) * W + Math.floor(x3 / 3);
    let su = 0, s2 = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const yy = y + dy, xx = x3 + dx; if (yy < 0 || yy >= H3 || xx < 0 || xx >= W3) continue; const v = L3[yy * W3 + xx]; su += v; s2 += v * v; n++; }
    const mu = su / n; S[k] += Math.sqrt(Math.max(0, s2 / n - mu * mu)) / 9; F[k] += F3[i] / 9; L[k] += L3[i] / 9;
  }
  /* luminanza dei dintorni (15×15 celle): la chioma è più scura del prato e dei campi intorno */
  const box = (src, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++){ let a = 0; for (let xx = -r; xx <= r; xx++) a += src[y * W + Math.min(W - 1, Math.max(0, xx))];
      for (let xx = 0; xx < W; xx++){ t[y * W + xx] = a / (2 * r + 1); a += src[y * W + Math.min(W - 1, xx + r + 1)] - src[y * W + Math.max(0, xx - r)]; } }
    for (let xx = 0; xx < W; xx++){ let a = 0; for (let y = -r; y <= r; y++) a += t[Math.min(H - 1, Math.max(0, y)) * W + xx];
      for (let y = 0; y < H; y++){ o[y * W + xx] = a / (2 * r + 1); a += t[Math.min(H - 1, y + r + 1) * W + xx] - t[Math.max(0, y - r) * W + xx]; } }
    return o; };
  const Lloc = box(L, 7), C = new Float32Array(W * H);
  /* la grana di riferimento: la mediana della grana dove c'è verde (fra .03 e .09). Una chioma ha più grana della
     metà del verde dell'immagine ed è più scura di quello che ha intorno (prima bastava non essere più chiara) */
  const verdi = []; for (let i = 0; i < W * H; i++) if (F[i] > .5) verdi.push(S[i]);
  verdi.sort((a, b2) => a - b2);
  const ref = Math.min(.09, Math.max(.03, verdi.length > 50 ? verdi[verdi.length >> 1] : .0395));
  for (let i = 0; i < W * H; i++){
    const n = p ? p[i * 4] / 255 : (i / W / H);
    C[i] = F[i] * ss(.81 * ref, 1.47 * ref, S[i]) * ss(.02, -.035, L[i] - Lloc[i]) * (n > .08 ? 1 : 0);
  }
  /* ⚠ 14/11 sera · blu = DOV'È LA NEBBIA (in questa immagine, che è quella del giorno): chiara, poco colorata, fredda,
     la stessa prova che fa il disegno punto per punto (vedi «neb» in paesaggio()), qui per cella. Serve di notte: nel
     dipinto notturno la nebbia non si riconosce dal colore, ma sta dove sta di giorno */
  const Nb = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++){
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++){ const i = ((y * 3 + dy) * W3 + xx * 3 + dx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    r /= 2295; g /= 2295; b /= 2295;   /* 9 punti × 255 */
    const mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, .01), l = r * .299 + g * .587 + b * .114;
    const n = p ? p[(y * W + xx) * 4] / 255 : .2, so = .4 - .2 * ss(.05, .3, n);   /* la nebbia vicina, in ombra, è più scura */
    Nb[y * W + xx] = ss(so - .06, so + .22, l) * (1 - ss(.1, .34, sat)) * ss(-.05, .03, b - r);
  }
  const o = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++){
    let g = 0, gw = 0, v = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const yy = y + dy, x2 = xx + dx; if (yy < 0 || yy >= H || x2 < 0 || x2 >= W) continue;
      const m = C[yy * W + x2]; v = Math.max(v, m);
      if (Math.abs(dy) <= 1 && Math.abs(dx) <= 1){ const w = (2 - Math.abs(dy)) * (2 - Math.abs(dx)); g += m * w; gw += w; } }
    const k = (y * W + xx) * 4, core = Math.max(C[y * W + xx], g / gw * .8);
    o.data[k] = Math.round(Math.min(1, v * 1.5) * 255); o.data[k + 1] = Math.round(Math.min(1, core * 1.3) * 255); o.data[k + 2] = Math.round(Nb[y * W + xx] * 255); o.data[k + 3] = 255;
  }
  return o;
}
/* ⚠ 16/11 · I FASCI DI LUCE DELLE FINESTRE, in un interno (Maurizio: «rendiamo il pulviscolo e la luce che entra dalle
   finestre più viva»). Il pulviscolo stava solo dove l'immagine è chiara e senza colore (vetri, chiazze sul pavimento:
   il 3-5% del quadro), non nei fasci che scendono dalle finestre, che sono un velo chiaro sul muro e restano sotto quella
   soglia. Qui, una volta per immagine, si cercano i vetri (macchie chiare, quasi senza colore, nella parte alta, più grandi
   di una fiamma) e da ognuno si traccia il fascio nella direzione detta dal file dei punti (gradi dalla verticale: -25 =
   giù verso sinistra), lungo fino a tre quarti del quadro, più forte vicino al vetro; più forte dove il velo dipinto c'è
   davvero. Torna {a: 0..255 per cella (W×H come la maschera delle chiome), dir, col: il colore della luce dei vetri} o null.
   Al tramonto i vetri sono arancio e saturi come le fiamme: per questo il file dei punti può dire dove sono (vetri:
   riquadri); lì dentro è vetro quello che è più chiaro della metà del riquadro */
function mascheraPoligono(poli, W, H){
  const m = new Float32Array(W * H), n = poli.length;
  for (let y = 0; y < H; y++){
    const py = (y + .5) / H;
    for (let x = 0; x < W; x++){
      const px = (x + .5) / W; let dentro = false;
      for (let i = 0, j = n - 1; i < n; j = i++){ const [xi, yi] = poli[i], [xj, yj] = poli[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) dentro = !dentro; }
      m[y * W + x] = dentro ? 1 : 0;
    }
  }
  const o = new Uint8Array(W * H), r = 2;   /* bordo morbido (due celle) */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    let s = 0, c = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue; s += m[yy * W + xx]; c++; }
    o[y * W + x] = Math.round(s / c * 255);
  }
  return o;
}
function mascheraFasci(img, ang, W, H, vetri = null){
  let src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  while (sw > W * 4 && sh > H * 4){
    const m = document.createElement('canvas'); m.width = Math.round(sw / 2); m.height = Math.round(sh / 2);
    const mx2 = m.getContext('2d'); mx2.imageSmoothingEnabled = true; mx2.imageSmoothingQuality = 'high'; mx2.drawImage(src, 0, 0, m.width, m.height);
    src = m; sw = m.width; sh = m.height;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true}); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, N = W * H;
  const ss = (a, b2, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b2 - a))); return t * t * (3 - 2 * t); };
  const L = new Float32Array(N), V = new Float32Array(N);
  for (let i = 0; i < N; i++){
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, l = r * .299 + g * .587 + b * .114, mx = Math.max(r, g, b);
    L[i] = l; V[i] = vetri ? 0 : ss(.55, .7, l) * (1 - ss(.35, .5, (mx - Math.min(r, g, b)) / Math.max(mx, .01))) * (1 - ss(.55, .7, Math.floor(i / W) / H));
  }
  if (vetri) for (const [x0, y0, x1, y1] of vetri){
    const X0 = Math.max(0, Math.floor(x0 * W)), Y0 = Math.max(0, Math.floor(y0 * H)), X1 = Math.min(W, Math.ceil(x1 * W)), Y1 = Math.min(H, Math.ceil(y1 * H)), v = [];
    for (let y = Y0; y < Y1; y++) for (let x2 = X0; x2 < X1; x2++) v.push(L[y * W + x2]);
    if (!v.length) continue; v.sort((p, q) => p - q); const so = Math.max(.4, v[Math.floor(v.length * .55)]);
    for (let y = Y0; y < Y1; y++) for (let x2 = X0; x2 < X1; x2++){ const i = y * W + x2; V[i] = Math.max(V[i], ss(so, so + .12, L[i])); }
  }
  /* solo le macchie grandi: una fiamma di candela, quasi bianca anche lei, è una manciata di celle */
  const lab = new Int32Array(N).fill(-1), tenere = [], coda = new Int32Array(N);
  for (let i = 0; i < N; i++){
    if (V[i] <= .5 || lab[i] >= 0) continue;
    let qa = 0, qb = 0; coda[qb++] = i; lab[i] = i;
    while (qa < qb){ const j = coda[qa++], jx = j % W;
      for (const k of [j - W, j + W, jx > 0 ? j - 1 : -1, jx < W - 1 ? j + 1 : -1]) if (k >= 0 && k < N && lab[k] < 0 && V[k] > .5){ lab[k] = i; coda[qb++] = k; } }
    let x0 = W, x1 = 0, y0 = H, y1 = 0; for (let q = 0; q < qb; q++){ const j = coda[q], jx = j % W, jy = (j - jx) / W; x0 = Math.min(x0, jx); x1 = Math.max(x1, jx); y0 = Math.min(y0, jy); y1 = Math.max(y1, jy); }
    if (vetri ? qb >= 4 : (qb >= N * .0025 && y1 - y0 + 1 >= 1.3 * (x1 - x0 + 1))) for (let q = 0; q < qb; q++) tenere.push(coda[q]);   /* senza riquadri: solo macchie grandi e alte (finestre), non fiamme né aloni */
  }
  if (!tenere.length) return null;
  const Wv = new Float32Array(N); let cr = 0, cg = 0, cb = 0;
  for (const i of tenere){ Wv[i] = V[i]; cr += d[i * 4]; cg += d[i * 4 + 1]; cb += d[i * 4 + 2]; }
  const mx = Math.max(cr, cg, cb, 1), col = [cr / mx, cg / mx, cb / mx];
  /* il fascio: da ogni cella di vetro, un raggio nella direzione della luce (sparso sulle quattro celle vicine) */
  const a = ang * Math.PI / 180, dx = Math.sin(a), dy = Math.cos(a), K = Math.round(H * .75), k0 = Math.round(H * .03), S = new Float32Array(N);
  for (const i of tenere){
    const x0 = i % W, y0 = Math.floor(i / W), w0 = Wv[i];
    for (let k = k0; k < K; k++){
      const px = x0 + dx * k, py = y0 + dy * k; if (px < 0 || py < 0 || px >= W - 1 || py >= H - 1) break;
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, e = w0 * Math.exp(-k / (K * .55)), j = iy * W + ix;
      S[j] += e * (1 - fx) * (1 - fy); S[j + 1] += e * fx * (1 - fy); S[j + W] += e * (1 - fx) * fy; S[j + W + 1] += e * fx * fy;
    }
  }
  const box = (src, r) => { const t = new Float32Array(N), o = new Float32Array(N);
    for (let y = 0; y < H; y++){ let s = 0; for (let xx = -r; xx <= r; xx++) s += src[y * W + Math.min(W - 1, Math.max(0, xx))];
      for (let xx = 0; xx < W; xx++){ t[y * W + xx] = s / (2 * r + 1); s += src[y * W + Math.min(W - 1, xx + r + 1)] - src[y * W + Math.max(0, xx - r)]; } }
    for (let xx = 0; xx < W; xx++){ let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + xx];
      for (let y = 0; y < H; y++){ o[y * W + xx] = s / (2 * r + 1); s += t[Math.min(H - 1, y + r + 1) * W + xx] - t[Math.max(0, y - r) * W + xx]; } }
    return o; };
  const Sb = box(box(S, 2), 2);
  /* il velo dipinto: più chiaro di quello che ha intorno (su un ottavo del quadro) */
  const Lb = box(L, Math.round(W / 16)), Hz0 = new Float32Array(N); for (let i = 0; i < N; i++) Hz0[i] = L[i] - Lb[i];
  const Hz = box(Hz0, 1), vals = []; for (let i = 0; i < N; i++) if (Sb[i] > 1e-4) vals.push(Sb[i]);
  if (vals.length < 20) return null;
  vals.sort((p, q) => p - q); const ref = vals[Math.floor(vals.length * .9)] || 1;
  const Wd = box(Wv, 1), F = new Float32Array(N), out = new Uint8Array(N); let tot = 0;
  for (let i = 0; i < N; i++) F[i] = Math.min(1, Sb[i] / ref) * (.35 + .65 * ss(-.01, .05, Hz[i])) * (1 - Math.min(1, Wd[i] * 2));
  const Fb = box(F, 1);   /* morbido: niente quadretti dove il velo dipinto va e viene */
  for (let i = 0; i < N; i++){ out[i] = Math.round(Fb[i] * 255); tot += Fb[i]; }
  return {a: out, dir: [dx, dy], col, area: Math.round(tot / N * 1000) / 10, vetri: tenere.length};
}
/* ⚠ 10/11 · la maschera del cielo, una volta per immagine (vedi cielo() nel disegno). Torna una tela grande come la mappa
   di profondità: rosso (e blu) = la profondità di prima, verde = quanto è cielo (0..1, già sfumato).
   · cielo = il nero della mappa in alto (la soglia la dà il bordo alto stesso, +1,5/255: i monti lontani a 2-4/255 no)
   · per colonna, la linea del cielo: la prima riga dall'alto che non è cielo e non lo sono le 3 dopo (un puntino non la
     ferma); sotto non c'è più cielo, anche se la mappa è nera (un crinale lontano): niente isole, niente puntini
   · le gobbe di cielo strette (un pezzo di crinale nero come il cielo) si tolgono; la torre, che è il contrario, resta
   · verso l'orizzonte generale (mediana larga: la torre non conta) il cielo che scorre sfuma nel dipinto, su 5% d'altezza
   · un filo di sfocatura per il bordo, poi niente più soglie da un pixel all'altro */
function mascheraCielo(dimg, interno = false){
  const W = Math.min(dimg.naturalWidth, 2048), H = Math.round(W * dimg.naturalHeight / dimg.naturalWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(dimg, 0, 0, W, H);
  const im = x.getImageData(0, 0, W, H), d = im.data;
  const m = interno ? new Float32Array(W * H) : mascheraCieloDa(d, W, H), o = mascheraOggettiDa(d, W, H);
  for (let i = 0; i < W * H; i++){ d[i * 4 + 1] = Math.round(m[i] * 255); d[i * 4 + 2] = Math.round(o[i] * 255); d[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  return c;
}
/* ⚠ 10/11 · gli OGGETTI (blu): abbazia, castello, torri, cipressi, cioè quello che sulla sua riga sta molto più vicino
   di quello che ha intorno (profondità meno la sua «apertura» lungo la riga, finestra 60% dell'altezza: un oggetto più
   stretto sparisce, il terreno resta). La nebbiolina viva lì non va: la pietra in ombra è grigio-azzurra come la nebbia
   e i veli ci facevano aloni e macchie (Maurizio: alone sul campanile, macchie scure sul fianco del castello).
   Solo da metà distanza in là (sotto 0,3): la nebbia vicina fra gli alberi in primo piano resta viva */
function mascheraOggettiDa(d, W, H){
  const o = new Float32Array(W * H), w = Math.min(W, Math.max(3, Math.round(H * .6))) | 1, h = w >> 1;
  const riga = new Float32Array(W), a = new Float32Array(W), g = new Float32Array(W + w), sx = new Float32Array(W + w), dx = new Float32Array(W + w);
  /* minimo (o massimo) su una finestra scorrevole, in tempo lineare (van Herk / Gil-Werman) */
  const scorri = (src, out, f, vuoto) => {
    const n = W + w; for (let i = 0; i < n; i++){ const k = i - h; g[i] = k >= 0 && k < W ? src[k] : src[k < 0 ? 0 : W - 1]; }
    for (let i = 0; i < n; i++) sx[i] = i % w === 0 ? g[i] : f(sx[i - 1], g[i]);
    for (let i = n - 1; i >= 0; i--) dx[i] = (i % w === w - 1 || i === n - 1) ? g[i] : f(dx[i + 1], g[i]);
    for (let k = 0; k < W; k++) out[k] = f(dx[k], sx[k + w - 1]);
    return vuoto;
  };
  const ap = new Float32Array(W), mn = new Float32Array(W);
  for (let y = 0; y < H; y++){
    for (let i = 0; i < W; i++) riga[i] = d[(y * W + i) * 4] / 255;
    scorri(riga, mn, Math.min); scorri(mn, ap, Math.max);
    for (let i = 0; i < W; i++){
      const pr = riga[i] - ap[i]; let v = Math.min(1, Math.max(0, (pr - .03) / .03));
      v *= 1 - Math.min(1, Math.max(0, (riga[i] - .3) / .15));
      o[y * W + i] = v;
    }
  }
  /* allargata di ~1% dell'altezza prima di sfocarla: il bordo morbido sta fuori dalla sagoma, non dentro (se no un filo
     di velo restava attaccato al campanile) */
  const rD = Math.max(1, Math.round(H * .01)), t2 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++){ let v = 0; for (let k = Math.max(0, i - rD); k <= Math.min(W - 1, i + rD); k++) v = Math.max(v, o[y * W + k]); t2[y * W + i] = v; }
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++){ let v = 0; for (let k = Math.max(0, y - rD); k <= Math.min(H - 1, y + rD); k++) v = Math.max(v, t2[k * W + i]); o[y * W + i] = v; }
  sfoca2(o, W, H, Math.max(1, Math.round(H * .004)));
  return o;
}
function sfoca2(m, W, H, r){   /* tre passate di media mobile (quasi una gaussiana), in orizzontale e in verticale */
  const tmp = new Float32Array(W * H);
  for (let p = 0; p < 3; p++){
    for (let y = 0; y < H; y++){ let acc = 0; for (let i = -r; i <= r; i++) acc += m[y * W + Math.min(W - 1, Math.max(0, i))];
      for (let i = 0; i < W; i++){ tmp[y * W + i] = acc / (2 * r + 1); acc += m[y * W + Math.min(W - 1, i + r + 1)] - m[y * W + Math.max(0, i - r)]; } }
    for (let i = 0; i < W; i++){ let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + i];
      for (let y = 0; y < H; y++){ m[y * W + i] = acc / (2 * r + 1); acc += tmp[Math.min(H - 1, y + r + 1) * W + i] - tmp[Math.max(0, y - r) * W + i]; } }
  }
}
/* il calcolo, su RGBA (solo il rosso): a parte, per provarlo fuori dal browser */
function mascheraCieloDa(d, W, H){
  const m = new Float32Array(W * H);
  const alto = [];
  for (let y = 0; y < Math.max(2, Math.floor(H / 20)); y++) for (let i = 0; i < W; i++) alto.push(d[(y * W + i) * 4]);
  alto.sort((a, b) => a - b);
  const t0 = alto[Math.floor(alto.length * .95)];
  if (t0 > 5) return m;                                                    /* in alto non c'è cielo */
  const T = t0 + 1.5, eC = (y, i) => d[(y * W + i) * 4] <= T;
  const sl = new Float32Array(W);
  for (let i = 0; i < W; i++){
    let y = 0;
    while (y < H){
      if (!eC(y, i)){ let ok = true; for (let k = 1; k <= 3 && y + k < H; k++) if (eC(y + k, i)){ ok = false; break; } if (ok) break; }
      y++;
    }
    sl[i] = y;
  }
  /* apertura (minimo poi massimo, finestra 3% della larghezza): via le gobbe strette verso il basso */
  const fin = (a, w, f) => { const r = new Float32Array(W), h = w >> 1; for (let i = 0; i < W; i++){ let v = a[i]; for (let k = Math.max(0, i - h); k <= Math.min(W - 1, i + h); k++) v = f(v, a[k]); r[i] = v; } return r; };
  const w = Math.max(3, Math.round(W * .03)) | 1;
  const ap = fin(fin(sl, w, Math.min), w, Math.max);
  for (let i = 0; i < W; i++) ap[i] = Math.min(ap[i], sl[i]);
  /* l'orizzonte generale: mediana larga (25%), poi lisciata, così la sfumatura non fa gradini */
  const hw = Math.max(5, Math.round(W * .25)) | 1, hs = new Float32Array(W);
  for (let i = 0; i < W; i++){ const v = Array.from(ap.slice(Math.max(0, i - (hw >> 1)), Math.min(W, i + (hw >> 1) + 1))).sort((a, b) => a - b); hs[i] = v[v.length >> 1]; }
  const hl = sfoca1(hs, Math.max(2, Math.round(W * .04)));
  const F = H * .05;
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++){
    if (y >= ap[i]) continue;
    let f = Math.min(1, Math.max(0, (hl[i] - y) / F)); f = f * f * (3 - 2 * f);
    m[y * W + i] = y < hl[i] - F ? 1 : f;
  }
  /* il bordo: sfocatura leggera (raggio ~0,25% dell'altezza) */
  sfoca2(m, W, H, Math.max(1, Math.round(H * .0025)));
  return m;
}
function sfoca1(a, r){ const n = a.length, o = new Float32Array(n); for (let i = 0; i < n; i++){ let s = 0, k = 0; for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++){ s += a[j]; k++; } o[i] = s / k; } return o; }
/* ⚠ 14/11 sera · LE NUVOLE DEL CIELO CHE SCORRE, per le stelle (Maurizio: «sì», alla domanda se sistemare le stelle che
   brillano anche davanti alle nuvole). Le stelle del disegno stanno ferme sullo schermo e brillavano dappertutto nel
   cielo, anche sopra le nuvole del panorama che scorre. Dal colore del punto non si capisce se è nuvola: il cielo
   notturno dipinto schiarisce verso l'orizzonte (luce da 0,05 in alto a 0,26 in basso) e il fianco in ombra di una
   nuvola ha la stessa luce e lo stesso blu del cielo accanto (una soglia sulla luce spegneva le stelle di mezzo cielo).
   Qui le nuvole si trovano una volta per panorama, a 512 punti di larghezza:
   1. via le stelle dipinte (apertura 3×3: minimo poi massimo);
   2. la grana (deviazione della luce su 5×5): le nuvole hanno luce e ombra fitte, il cielo sgombro è liscio;
   3. il cielo sgombro riga per riga (cambia solo con l'altezza): la mediana dei punti lisci e più blu della riga,
      lisciata in altezza;
   4. nuvola = grana, oppure più chiara o meno blu del cielo sgombro della sua riga, oppure più scura; e sotto una
      cresta chiara c'è il corpo in ombra della nuvola (liscio e scuro come il cielo: da solo non si riconosce);
   5. si chiudono i vuoti (massimo poi minimo, 7×7), si tolgono i granelli (3×3), bordo morbido;
   6. i buchi piccoli chiusi dentro una nuvola diventano nuvola.
   Ai lati il panorama si avvolge (si ripete), in alto e in basso no. Provato sui cieli di notte dei tre paesaggi (le
   nuvole coperte, i tratti sgombri puliti) e su quelli di giorno e del tramonto (più largo, ma dalla parte giusta:
   serve alla notte finta, che usa il cielo del giorno). Torna 0 = cielo sgombro … 1 = nuvola */
async function mascheraNuvole(img){
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const W = 512, H = Math.max(8, Math.round(W * ih / iw)), t0 = performance.now();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true}); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  /* la riduzione la fa il browser per conto suo, fuori dal giro del disegno (un panorama è 4000 × 2000 punti: ridurlo qui
     fermava tutto per un momento); se non può, a metà per volta (ridotta di colpo l'immagine si riempie di grana finta,
     vedi mascheraAlberi, e qui la grana conta) */
  let piccola = null;
  try { if (window.createImageBitmap) piccola = await createImageBitmap(img, {resizeWidth: W, resizeHeight: H, resizeQuality: 'high'}); } catch(e) { piccola = null; }
  if (piccola && piccola.width === W){ x.drawImage(piccola, 0, 0, W, H); if (piccola.close) piccola.close(); }
  else {
    let src = img, sw = iw, sh = ih;
    while (sw > W * 2 && sh > H * 2){
      const m = document.createElement('canvas'); m.width = Math.round(sw / 2); m.height = Math.round(sh / 2);
      const mx = m.getContext('2d'); mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(src, 0, 0, m.width, m.height);
      src = m; sw = m.width; sh = m.height;
    }
    x.drawImage(src, 0, 0, W, H);
  }
  /* ⚠ il calcolo si fa in disparte (un «operaio» del browser, fuori dal giro del disegno): fatto qui, sugli schermi veri
     teneva fermo il disegno per 0,2 s (TV) e 0,3 s (finestrelle) a ogni cielo di notte o di tramonto. Se l'operaio non
     parte, si fa qui come prima */
  const t1 = performance.now(), im = x.getImageData(0, 0, W, H);
  let m, dove = 'in disparte';
  try { m = await nuvoleInDisparte(new Uint8ClampedArray(im.data), W, H); if (!m || m.length !== W * H) throw new Error('risposta sbagliata'); }
  catch(e) { dove = 'qui'; m = mascheraNuvoleDa(im.data, W, H); }
  let tot = 0;
  for (let i = 0; i < W * H; i++){ const v = Math.round(m[i] * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; tot += m[i]; }
  im.tempi = {riduzione: Math.round(t1 - t0), calcolo: Math.round(performance.now() - t1), nuvole: Math.round(tot / (W * H) * 100), dove};   /* per lo stato: quanto è costato su questo apparecchio, e quanta parte del cielo è nuvola */
  return im;
}
function nuvoleInDisparte(dati, W, H){
  return new Promise((ok, no) => {
    let w = null, url = null, t = 0;
    const fine = () => { clearTimeout(t); try { if (w) w.terminate(); if (url) URL.revokeObjectURL(url); } catch(e) {} };
    try {
      url = URL.createObjectURL(new Blob(['onmessage = e => { const m = (' + mascheraNuvoleDa.toString() + ')(e.data.d, e.data.W, e.data.H); postMessage(m, [m.buffer]); };'], {type: 'application/javascript'}));
      w = new Worker(url);
      t = setTimeout(() => { fine(); no(new Error('operaio lento')); }, 6000);
      w.onmessage = e => { fine(); ok(e.data); };
      w.onerror = e => { fine(); no(new Error('operaio: ' + (e && e.message || 'errore'))); };
      w.postMessage({d: dati, W, H}, [dati.buffer]);
    } catch(e) { fine(); no(e); }
  });
}
/* il calcolo, su RGBA: a parte, per provarlo fuori dal browser (confrontato punto per punto con la versione di prova)
   e per darlo all'operaio (deve bastare a sé stesso: niente che stia fuori da questa funzione) */
function mascheraNuvoleDa(d, W, H){
  const N = W * H, ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* massimo o minimo su un quadrato di lato 2r+1 (prima le righe, avvolgendo ai lati; poi le colonne, col bordo ripetuto).
     Scritti per esteso, senza conti inutili nel giro stretto: tutto il calcolo deve stare in poche decine di millisecondi
     (si fa a ogni cambio di cielo, mentre il paesaggio di prima è ancora in vista) */
  const estremo = (src, r, mas) => { const t = new Float32Array(N), o = new Float32Array(N), riga = new Float32Array(W + 2 * r), n = 2 * r;
    for (let y = 0; y < H; y++){ const b0 = y * W;
      riga.set(src.subarray(b0, b0 + W), r); for (let k = 0; k < r; k++){ riga[k] = src[b0 + W - r + k]; riga[W + r + k] = src[b0 + k]; }
      if (mas) for (let xx = 0; xx < W; xx++){ let v = riga[xx]; for (let k = 1; k <= n; k++){ const u = riga[xx + k]; if (u > v) v = u; } t[b0 + xx] = v; }
      else for (let xx = 0; xx < W; xx++){ let v = riga[xx]; for (let k = 1; k <= n; k++){ const u = riga[xx + k]; if (u < v) v = u; } t[b0 + xx] = v; } }
    for (let y = 0; y < H; y++){ const y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r), b0 = y * W;
      if (mas) for (let xx = 0; xx < W; xx++){ let v = t[y0 * W + xx]; for (let yy = y0 + 1; yy <= y1; yy++){ const u = t[yy * W + xx]; if (u > v) v = u; } o[b0 + xx] = v; }
      else for (let xx = 0; xx < W; xx++){ let v = t[y0 * W + xx]; for (let yy = y0 + 1; yy <= y1; yy++){ const u = t[yy * W + xx]; if (u < v) v = u; } o[b0 + xx] = v; } }
    return o; };
  /* media pesata separabile (pesi w, raggio r): la media semplice e la sfocatura a campana */
  const pesata = (src, w) => { const n = w.length, r = (n - 1) / 2, t = new Float32Array(N), o = new Float32Array(N), riga = new Float32Array(W + 2 * r), ry = new Int32Array(n); let tot = 0; for (const v of w) tot += v;
    for (let y = 0; y < H; y++){ const b0 = y * W;
      riga.set(src.subarray(b0, b0 + W), r); for (let k = 0; k < r; k++){ riga[k] = src[b0 + W - r + k]; riga[W + r + k] = src[b0 + k]; }
      for (let xx = 0; xx < W; xx++){ let a = 0; for (let k = 0; k < n; k++) a += w[k] * riga[xx + k]; t[b0 + xx] = a / tot; } }
    for (let y = 0; y < H; y++){ const b0 = y * W; for (let k = 0; k < n; k++) ry[k] = Math.min(H - 1, Math.max(0, y + k - r)) * W;
      for (let xx = 0; xx < W; xx++){ let a = 0; for (let k = 0; k < n; k++) a += w[k] * t[ry[k] + xx]; o[b0 + xx] = a / tot; } }
    return o; };
  const campana = (sigma, r) => { const w = []; for (let k = -r; k <= r; k++) w.push(Math.exp(-k * k / (2 * sigma * sigma))); return w; };
  const mediana = a => { a.sort(); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };   /* (su numeri tipizzati: l'ordinamento è già numerico, e svelto) */
  /* 1. via le stelle dipinte */
  const can = [0, 1, 2].map(k => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = d[i * 4 + k] / 255; return estremo(estremo(a, 1, false), 1, true); });
  const R = can[0], G = can[1], B = can[2], L = new Float32Array(N), L2 = new Float32Array(N), sat = new Float32Array(N);
  for (let i = 0; i < N; i++){ const l = R[i] * .299 + G[i] * .587 + B[i] * .114; L[i] = l; L2[i] = l * l; const mx = Math.max(R[i], G[i], B[i]); sat[i] = (mx - Math.min(R[i], G[i], B[i])) / Math.max(mx, .01); }
  /* 2. la grana */
  const mu = pesata(L, [1, 1, 1, 1, 1]), mu2 = pesata(L2, [1, 1, 1, 1, 1]), gr = new Float32Array(N);
  for (let i = 0; i < N; i++) gr[i] = Math.sqrt(Math.max(0, mu2[i] - mu[i] * mu[i])) / Math.max(mu[i], .1);
  /* 3. il cielo sgombro, riga per riga */
  const bg = [new Float32Array(H), new Float32Array(H), new Float32Array(H)], idx = new Int32Array(W), val = new Float32Array(W);
  for (let y = 0; y < H; y++){
    const b0 = y * W, gT = gr.slice(b0, b0 + W).sort()[Math.floor(W * .35)], sT = sat.slice(b0, b0 + W).sort()[Math.floor(W * .6)];
    let n = 0; for (let xx = 0; xx < W; xx++) if (gr[b0 + xx] < gT && sat[b0 + xx] >= sT) idx[n++] = b0 + xx;
    if (n < W * .05){ n = 0; for (let xx = 0; xx < W; xx++) if (gr[b0 + xx] < gT) idx[n++] = b0 + xx; }
    if (n < 8){ n = 0; for (let xx = 0; xx < W; xx++) idx[n++] = b0 + xx; }
    for (let k = 0; k < 3; k++){ const c = can[k], v = val.subarray(0, n); for (let j = 0; j < n; j++) v[j] = c[idx[j]]; bg[k][y] = mediana(v); }
  }
  for (let k = 0; k < 3; k++){ const a = bg[k], t = new Float32Array(H), v = new Float32Array(9);
    for (let y = 0; y < H; y++){ for (let j = -4; j <= 4; j++) v[j + 4] = a[Math.min(H - 1, Math.max(0, y + j))]; t[y] = mediana(v); }
    for (let y = 0; y < H; y++){ let su = 0; for (let j = -7; j <= 7; j++) su += t[Math.min(H - 1, Math.max(0, y + j))]; a[y] = su / 15; } }
  /* 4. il punteggio: grana, più chiara o meno blu del cielo sgombro della riga, più scura */
  const m = new Float32Array(N), chiara = new Float32Array(N);
  for (let y = 0; y < H; y++){
    const Lb = bg[0][y] * .299 + bg[1][y] * .587 + bg[2][y] * .114, rbb = bg[0][y] / Math.max(bg[2][y], .02);
    for (let xx = 0; xx < W; xx++){ const i = y * W + xx, dL = (L[i] - Lb) / Math.max(Lb, .04), rb = R[i] / Math.max(B[i], .02);
      const ch = Math.max(ss(.18, .45, dL), ss(.04, .12, rb - rbb)); chiara[i] = ch;
      m[i] = Math.max(ss(.05, .11, gr[i]), ch, ss(.12, .3, -dL)); }
  }
  /* 4b. sotto la cresta chiara, il corpo in ombra della nuvola (12 punti, sfumando) */
  const NS = 12;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++){ let g = 0; for (let k = 0; k <= NS; k++){ const v = chiara[Math.max(0, y - k) * W + xx] * (1 - .5 * k / NS); if (v > g) g = v; } const i = y * W + xx; if (g * .9 > m[i]) m[i] = g * .9; }
  /* 5. chiusura 7×7, apertura 3×3, bordo morbido */
  let q = estremo(estremo(m, 3, true), 3, false);
  q = estremo(estremo(q, 1, false), 1, true);
  q = pesata(q, campana(1.5, 6)); for (let i = 0; i < N; i++) q[i] = ss(.3, .65, q[i]);
  /* 6. i buchi: pezzi di «non nuvola» piccoli (meno dello 0,6% del cielo), chiusi dentro una nuvola */
  const lab = new Uint8Array(N), coda = new Int32Array(N), buchi = new Float32Array(N);
  for (let s0 = 0; s0 < N; s0++){ if (q[s0] >= .5 || lab[s0]) continue;
    let a = 0, fine = 0; coda[fine++] = s0; lab[s0] = 1;
    while (a < fine){ const i = coda[a++], y = (i / W) | 0, xx = i - y * W;
      let j = y * W + (xx + 1) % W; if (!lab[j] && q[j] < .5){ lab[j] = 1; coda[fine++] = j; }
      j = y * W + (xx + W - 1) % W; if (!lab[j] && q[j] < .5){ lab[j] = 1; coda[fine++] = j; }
      if (y > 0){ j = i - W; if (!lab[j] && q[j] < .5){ lab[j] = 1; coda[fine++] = j; } }
      if (y < H - 1){ j = i + W; if (!lab[j] && q[j] < .5){ lab[j] = 1; coda[fine++] = j; } } }
    if (fine < .006 * N) for (let k = 0; k < fine; k++) buchi[coda[k]] = 1; }
  const sb = pesata(buchi, campana(1, 4));
  for (let i = 0; i < N; i++){ q[i] = Math.min(1, Math.max(q[i], sb[i] * 1.6)); if (buchi[i]) q[i] = 1; }
  return q;
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
/* ⚠ 20/11 · I FILE SALVATI SUL DISPOSITIVO (Maurizio: «la possibilità al device di scaricare in locale i video senza doverli
   ogni volta ricaricare dalla rete … mettiamo questa come opzione di default … altrimenti se uno ha un device senza memoria
   fisica, ogni volta li deve scaricare»). Prima ogni schermo riscaricava tutto a ogni accensione e a ogni cambio di scena
   (la notte 46 MB, il giorno 28 MB più 30 MB di fuochi), e nei primi minuti, col file che arrivava dalla rete, il video
   andava a scatti. Ora video, inserti e dipinti si tengono nella memoria del browser (Cache Storage: resta anche dopo
   riavvii e ricariche) e dalla rete arriva solo quello che è cambiato. Si salva solo un indirizzo con la versione («v=»:
   la data del file o il numero nel file dei punti), perché un file cambiato abbia un indirizzo nuovo; salvata la versione
   nuova, quelle vecchie dello stesso file si cancellano. Se lo spazio libero non basta (o il browser non ha la memoria) si
   fa come prima: si scarica ogni volta e si tiene solo finché la scena è aperta. Acceso di default sul TV e sulle
   finestrelle, mai nell'anteprima del telefono.
   ⚠ 20/11, 09:05 (Maurizio: «diamo anche la possibilità di scegliere se salvare su una cartella o salvare nella cache del
   browser, mettiamolo nell'app»). Tre modi, per apparecchio (dall'app, Impostazioni → Video sugli schermi):
     · «browser»: la memoria del browser (sopra);
     · «cartella»: una cartella vera del computer (Illusionist/file nella cartella dell'utente), tenuta dal programma del
       cucitore (pi/cuci-animazione.py, che gira già su Ally, G10 e Raspberry) su http://127.0.0.1:8790: resta anche se si
       cancellano i dati del browser e si vede. Se il programma non risponde si usa la memoria del browser;
     · false: niente, si scarica ogni volta.
   prova {salvaLocale: 'browser'|'cartella'|false}, {svuotaMemoria: true}. Nello stato e nell'«eccomi»: `memoria` */
const CARTELLA = 'http://127.0.0.1:8790';
const MEM = {attiva: false, modo: false, nome: 'finestre-file-1', stato: {daMemoria: 0, daCartella: 0, daRete: 0, salvati: 0, saltati: 0, tolti: 0, errore: null, persistente: null, cartella: null}};
function memoriaLocale(modo){
  if (modo === true) modo = 'browser';
  MEM.modo = modo === 'cartella' || modo === 'browser' ? modo : false;
  MEM.attiva = !!MEM.modo && typeof caches !== 'undefined';
  if (MEM.attiva && navigator.storage && navigator.storage.persist)
    navigator.storage.persist().then(p => { MEM.stato.persistente = p; }).catch(() => {});   /* che il browser non li cancelli da solo */
  return MEM.modo;
}
async function daCartella(url, maxS){
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = setTimeout(() => { try { if (ac) ac.abort(); } catch(e) {} }, maxS * 1000);
  try {
    const r = await fetch(CARTELLA + '/file?u=' + encodeURIComponent(url), Object.assign({cache: 'no-store'}, ac ? {signal: ac.signal} : {}));
    if (!r.ok){ MEM.stato.cartella = 'http ' + r.status; return null; }
    const b = await r.blob(); if (b.size < 64){ MEM.stato.cartella = 'vuoto'; return null; }
    MEM.stato.cartella = 'ok'; MEM.stato.daCartella++; return b;
  } catch(e){ MEM.stato.cartella = 'non risponde'; return null; }
  finally { clearTimeout(tm); }
}
const versionato = url => /^https?:/.test(url) && /[?&]v=[^&]/.test(url);
async function apriMemoria(){
  if (!MEM.attiva) return null;
  try { return await caches.open(MEM.nome); } catch(e){ MEM.stato.errore = String(e && e.message || e).slice(0, 80); return null; }
}
async function salvaInMemoria(c, url, b){
  try {
    if (navigator.storage && navigator.storage.estimate){
      const e = await navigator.storage.estimate(), libero = (e.quota || 0) - (e.usage || 0);
      if (libero < b.size * 1.5 + 200e6){ MEM.stato.saltati++; return; }   /* poco spazio: questo si riscarica ogni volta */
    }
    await c.put(url, new Response(b, {headers: {'Content-Type': b.type || 'application/octet-stream', 'Content-Length': String(b.size)}}));
    MEM.stato.salvati++;
    const base = url.split('?')[0];
    for (const k of await c.keys()) if (k.url.split('?')[0] === base && k.url !== url){ await c.delete(k); MEM.stato.tolti++; }
  } catch(e){ MEM.stato.errore = String(e && e.message || e).slice(0, 80); }
}
/* il file intero (Blob): dalla memoria se c'è, se no dalla rete (e poi in memoria). maxS: quanto aspettare la rete */
async function prendiFile(url, maxS = 300){
  if (MEM.modo === 'cartella' && versionato(url)){ const b = await daCartella(url, maxS); if (b) return b; }   /* 20/11: se no, la memoria del browser */
  const c = versionato(url) ? await apriMemoria() : null;
  if (c) try { const r = await c.match(url); if (r){ const b = await r.blob(); if (b.size >= 64){ MEM.stato.daMemoria++; return b; } } } catch(e) {}
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = setTimeout(() => { try { if (ac) ac.abort(); } catch(e) {} }, maxS * 1000);
  try {
    const r = await fetch(url, ac ? {signal: ac.signal} : {});
    if (!r.ok) throw new Error('http ' + r.status);
    const b = await r.blob(); MEM.stato.daRete++;
    if (c && b.size >= 64) salvaInMemoria(c, url, b);
    return b;
  } finally { clearTimeout(tm); }
}
async function statoMemoria(){
  const o = Object.assign({attiva: MEM.attiva, modo: MEM.modo}, MEM.stato);
  if (MEM.modo === 'cartella') try { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 2500);
    o.inCartella = await (await fetch(CARTELLA + '/stato', {cache: 'no-store', signal: ac.signal})).json(); clearTimeout(t); } catch(e) { o.inCartella = null; }
  try { if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); o.usatiMB = Math.round((e.usage || 0) / 1048576); o.liberiMB = Math.round(((e.quota || 0) - (e.usage || 0)) / 1048576); } } catch(e) {}
  try { if (MEM.attiva){ const c = await caches.open(MEM.nome); o.file = (await c.keys()).length; } } catch(e) {}
  return o;
}
async function svuotaMemoria(cartella = false){ try { await caches.delete(MEM.nome); } catch(e) {}
  if (cartella) try { await fetch(CARTELLA + '/svuota', {method: 'POST', cache: 'no-store'}); } catch(e) {} }
function caricaImg(url){
  /* 20/11: con la memoria sul dispositivo i dipinti con la versione passano da lì */
  if (MEM.attiva && versionato(url))
    return prendiFile(url, 120).then(b => new Promise((ok, no) => { const u = URL.createObjectURL(b), im = new Image();
      im.onload = () => { ok(im); setTimeout(() => URL.revokeObjectURL(u), 1000); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('immagine non caricata: ' + url)); }; im.src = u; }),
      () => caricaImgRete(url));
  return caricaImgRete(url);
}
function caricaImgRete(url){
  return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => ok(im); im.onerror = () => no(new Error('immagine non caricata: ' + url)); im.src = url; });
}
/* è arrivato un fotogramma nuovo da quando l'ho chiesto l'ultima volta? (con requestVideoFrameCallback
   lo dice il lettore; senza, si guarda se il tempo del video è cambiato) */
function nuovoFotogramma(v){
  if ('requestVideoFrameCallback' in v){
    if (!v._ascolto){ v._ascolto = performance.now(); v._nuovo = true;
      /* 19/11 sera (Maurizio: «ogni tanto gli avventori è come se si fermassero immobili»): si annotano i buchi fra un
         fotogramma e l'altro mentre il video corre (più di 140 ms, o più di 0,1 s di video saltati), per lo stato */
      const giro = (ora, md) => { const adesso = performance.now(), g = adesso - v._ascolto, mt = md && md.mediaTime != null ? md.mediaTime : v.currentTime;
        v._nCb = (v._nCb || 0) + 1;
        if (v._vaV && !v.paused && !v.seeking && (g > 140 || (v._mt != null && mt - v._mt > .1 && mt - v._mt < 2))){
          (v._fermi = v._fermi || []).push([Math.round(mt * 100) / 100, Math.round(g), Math.round(((v._mt != null ? mt - v._mt : 0)) * 1000)]); if (v._fermi.length > 30) v._fermi.shift(); v._nFermi = (v._nFermi || 0) + 1; }
        v._vaV = !v.paused && !v.seeking; v._mt = mt; v._nuovo = true; v._ascolto = adesso; v.requestVideoFrameCallback(giro); }; v.requestVideoFrameCallback(giro); }
    /* se il lettore non avvisa (video fuori pagina su qualche browser), si carica sempre come prima */
    if (!v.paused && performance.now() - v._ascolto > 300) return true;
    const n = v._nuovo; v._nuovo = false; return n;
  }
  const t = v.currentTime; if (t === v._ultimo) return false; v._ultimo = t; return true;
}
/* ⚠ 30/10: le animazioni cucite hanno sostituito i video dell'AI con lo stesso nome, e i browser tenevano
   il vecchio in memoria (fino a un'ora). Il segno qui sotto lo fa riscaricare; la libreria aggiunge anche la data del file. */
const VERSIONE_VIDEO = 'c3';
/* 16/11 · i tratti scritti dal cucitore (vedi aggiornaTratti): si usano solo se tornano col video, in ordine dal primo
   all'ultimo fotogramma (fra uno e l'altro al più il passaggio del cucitore); altrimenti il video gira com'è, in fila */
function tratti(j, D){
  const S = j && Array.isArray(j.segmenti) ? j.segmenti : null;
  if (!S || S.length < 2 || !(D > 4)) return null;
  for (let i = 0; i < S.length; i++){ const s = S[i]; if (!(s.a - s.da >= 1.5) || (i && (s.da < S[i - 1].a - .05 || s.da - S[i - 1].a > 1))) return null; }   /* fra un tratto e l'altro può restare il passaggio (meno di 1 s) */
  /* 19/11: il primo tratto può cominciare fino a 1 s dopo l'inizio del file: lì c'è la fine dell'ultimo tratto, che va sulla
     posa (il secondo lettore parte da lì quando si salta al primo, vedi aggiornaTratti) */
  if (S[0].da < -.05 || S[0].da > 1.05 || Math.abs(S[S.length - 1].a - D) > .4) return null;
  return S.map(s => ({da: +s.da, a: +s.a, nome: String(s.nome || ''), peso: +s.peso > 0 ? +s.peso : 1, noDiFila: !!s.noDiFila,
    ogni: Array.isArray(s.ogni) && s.ogni.length === 2 ? [Math.max(0, s.ogni[0] | 0), Math.max(s.ogni[0] | 0, s.ogni[1] | 0)] : null}));
}
/* 19/11 sera · il rumore del disegno (h1, rumore) in JavaScript, per i conti fatti una volta per fiamma */
const frJ = x => x - Math.floor(x);
function h1J(x, y){ let a = frJ(x * .1031), b = frJ(y * .1031), c = frJ(x * .1031); const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d; return frJ((a + b) * c); }
function rumoreJ(x, y){ const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h1J(ix, iy), b = h1J(ix + 1, iy), c = h1J(ix, iy + 1), d = h1J(ix + 1, iy + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
const sogliaOgni = s => s.ogni[0] + Math.floor(Math.random() * (s.ogni[1] - s.ogni[0] + 1));
/* il tratto dopo: quello raro quando ne sono passati abbastanza degli altri; altrimenti a caso secondo il peso,
   senza ripetere di fila quelli che non vogliono */
function scegliTratto(f){
  const S = f.tratti, n = S.length;
  const conta = i => { for (let j = 0; j < n; j++) f.dopo[j]++; f.dopo[i] = 0; if (S[i].ogni) f.soglia[i] = sogliaOgni(S[i]);
    f.storia.push(S[i].nome || String(i)); if (f.storia.length > 16) f.storia.shift(); return i; };
  for (let i = 0; i < n; i++) if (S[i].ogni && f.dopo[i] >= f.soglia[i]) return conta(i);
  const c = []; for (let i = 0; i < n; i++) if (!S[i].ogni && !(S[i].noDiFila && i === f.tratto)) c.push(i);
  if (!c.length) return conta((f.tratto + 1) % n);
  let tot = 0; for (const i of c) tot += S[i].peso;
  let r = Math.random() * tot;
  for (const i of c){ r -= S[i].peso; if (r <= 0) return conta(i); }
  return conta(c[c.length - 1]);
}

/* ⚠ 19/11 sera · VIDEO SCARICATI INTERI (Maurizio, col video del TV fatto dal telefono: «ogni tanto gli avventori è come se
   si fermassero immobili»). Misurato sul TV (motore 5.94): nei primi minuti dopo un video nuovo il lettore si fermava 300–500 ms
   ogni 0,7 s, col tempo del video fermo (il file arrivava dalla rete appena in tempo, e a ogni salto fra i tratti andava riletto
   da un altro punto); anche gli inserti, centinaia di volte. Tutta la taverna immobile, fuoco compreso, poi ripartiva. Sul TV e
   sulle finestrelle (non nell'anteprima del telefono: `videoIntero`) il video si scarica tutto prima di partire e si suona dalla
   memoria: nessuna attesa della rete, salti immediati. Se in 5 minuti non arriva, o non arriva proprio, si suona dalla rete come
   prima. Nello stato: `scaricati` (MB e secondi di ogni file) */
const scaricati = [];
async function scaricaIntero(url, maxS){
  const t0 = performance.now(), nome = decodeURIComponent(url.split('?')[0].split('/').pop()).slice(-40);
  const nota = o => { scaricati.push(Object.assign({file: nome, s: Math.round((performance.now() - t0) / 100) / 10}, o)); if (scaricati.length > 12) scaricati.shift(); };
  try {
    const prima = MEM.stato.daMemoria, b = await prendiFile(url, maxS);   /* 20/11: dalla memoria del dispositivo, se c'è */
    if (b.size < 2048) throw new Error('vuoto');
    nota({mb: Math.round(b.size / 104857.6) / 10, da: MEM.stato.daMemoria > prima ? 'memoria' : 'rete'});
    return URL.createObjectURL(b.type && b.type.startsWith('video') ? b : new Blob([b], {type: 'video/mp4'}));
  } catch(e){ nota({errore: String(e && e.message || e).slice(0, 60)}); return null; }
}
function atlanteValido(A){
  if (!A || !(A.w > 0) || !(A.h > 0) || !Array.isArray(A.riquadri) || !A.riquadri.length) return null;
  const ok = x => Array.isArray(x) && x.length === 4 && x.every(n => isFinite(n) && n >= -.01 && n <= 1.01) && x[2] > x[0] && x[3] > x[1];
  const R = A.riquadri.filter(r => r && ok(r.box) && ok(r.tile)).slice(0, 32);
  return R.length ? {w: Math.min(8192, A.w | 0), h: Math.min(8192, A.h | 0), riquadri: R} : null;
}
function lasciaVideo(v){
  try { const s = v.currentSrc || v.src; v.pause(); v.removeAttribute('src'); v.load(); if (s && s.startsWith('blob:')) URL.revokeObjectURL(s); } catch(e) {}
}
/* ⚠ 20/11 · VIDEO IN PIÙ PEZZI (Maurizio: «ok a ritornare a otto gesti per la notte … aumentare la qualità»). Il deposito
   accetta al più 50 MB a file: la notte con 8 gesti (70 s) ci stava solo a 5,3 Mbit/s. Ora accanto al video ci può essere
   `…_est-anim-<ora>-parti.png` (JSON {versione, byte, parti: [nomi dei file accanto]}): i pezzi sono il video di qualità
   piena tagliato a byte, uno dopo l'altro; scaricati (o presi dalla memoria del dispositivo) e rimessi in fila danno il
   file intero, che si suona dalla memoria. Il video col nome di sempre resta un video intero più leggero (≤ 50 MB): lo
   usano il telefono (che suona dalla rete), i computer vecchi, e questo stesso motore se un pezzo non arriva. */
async function scaricaPezzi(url, maxS){
  if (!/^https?:/.test(url)) return null;
  let m = null;
  try { const r = await fetch(url.split('?')[0].replace(/\.mp4$/, '-parti.png') + '?t=' + Date.now(), {cache: 'no-store'}); if (r.ok) m = await r.json(); } catch(e) { m = null; }
  if (!m || !Array.isArray(m.parti) || !m.parti.length || !(m.byte > 0)) return null;
  const t0 = performance.now(), dir = url.split('?')[0].replace(/[^/]*$/, ''), nome = decodeURIComponent(url.split('?')[0].split('/').pop()).slice(-40);
  const nota = o => { scaricati.push(Object.assign({file: nome, pezzi: m.parti.length, s: Math.round((performance.now() - t0) / 100) / 10}, o)); if (scaricati.length > 12) scaricati.shift(); };
  try {
    const pz = [], prima = MEM.stato.daMemoria;
    for (const n of m.parti) pz.push(await prendiFile(dir + encodeURIComponent(n) + '?v=' + encodeURIComponent(String(m.versione || '1')), maxS));
    const b = new Blob(pz, {type: 'video/mp4'});
    if (b.size !== +m.byte) throw new Error('pezzi ' + b.size + ' invece di ' + m.byte);
    nota({mb: Math.round(b.size / 104857.6) / 10, da: MEM.stato.daMemoria - prima >= m.parti.length ? 'memoria' : 'rete', atlante: !!m.atlante});
    return {url: URL.createObjectURL(b), atlante: m.atlante || null, versione: String(m.versione || '')};
  } catch(e){ nota({errore: String(e && e.message || e).slice(0, 60)}); return null; }
}
async function apriVideo(url, intero = false){
  url += (url.includes('?') ? '&' : '?') + VERSIONE_VIDEO;
  const pz = intero ? await scaricaPezzi(url, 300) : null;
  const tutto = pz ? pz.url : intero ? await scaricaIntero(url, 300) : null, src = tutto || url;
  const fai = () => { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = v.defaultMuted = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = src; return v; };
  const a = fai(), b = fai();
  a._atlante = pz && pz.atlante;   /* 20/11: il video a riquadri (vedi ATLANTE_FRAG) */
  a._versione = pz ? pz.versione : '';   /* 20/11 sera: per la scritta sullo schermo (quale video si sta guardando) */
  /* ⚠ 15/11 (Maurizio: «sullo smartphone in full screen la mugnaia la vedo ferma, come il resto del paesaggio»).
     Prima si aspettava «canplay» e solo dopo si faceva partire il video. Safari sull'iPhone però non scarica un video
     finché nessuno gli chiede di partire: «canplay» non arrivava, dopo 20 secondi il video veniva lasciato perdere e
     restava il dipinto fermo. Ora si chiede subito di partire (muto e dentro la pagina: permesso senza tocchi).
     Se il telefono rifiuta lo stesso (risparmio energetico) il video si tiene e parte al primo tocco sullo schermo. */
  return new Promise((ok, no) => {
    let fatto = false; const pronto = () => { if (!fatto){ fatto = true; ok([a, b]); } };
    a.onerror = () => no(new Error('video non caricato'));
    a.play().then(pronto).catch(e => {
      if (!e || e.name !== 'NotAllowedError') return no(e || new Error('video non partito'));
      try { if (parent !== window) parent.postMessage({tipo: 'toccaPerVideo'}, '*'); } catch(e2) {}   /* 18/11: l'app dice di toccare */
      const via = () => { removeEventListener('pointerdown', via, true); a.play().catch(() => {}); };
      addEventListener('pointerdown', via, true); pronto();
    });
    setTimeout(() => { if (!fatto) no(new Error('video lento')); }, 45000);
  });
}
