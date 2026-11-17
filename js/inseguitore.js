/* ═══════════════════════════════════════════════════════════════════════════
   inseguitore.js — la posizione di chi guarda, in tempo reale (prospettiva viva).

   Maurizio (30/10): «deve essere real time … che lo porti a massimo 80 ms».
   Il radar dà una posizione circa 10 volte al secondo, con un tremolio di qualche
   centimetro. Due cose servono insieme e di solito si fanno la guerra:
     · ferma quando sei fermo (il paesaggio non deve tremare)
     · pronta quando ti muovi (niente «molla» che arriva dopo mezzo secondo)
   Il filtro «1 euro» (Casiez, Roussel, Vogel, CHI 2012) le mette d'accordo: taglia
   forte il tremolio a bassa velocità e quasi niente quando la velocità sale.
   Poi la PREVISIONE: con la velocità stimata, a ogni immagine (60 al secondo) si
   disegna dove sarai fra `anticipo` secondi — il tempo che il movimento impiega ad
   arrivare dallo schermo agli occhi — così il ritardo percepito si avvicina a zero
   mentre cammini; quando ti fermi la velocità va a zero e la previsione con lei.
   La previsione non va mai oltre `orizzonte` secondi, e si spegne se il radar tace.

   16/11 sera, prima prova vera col radar sotto il TV (Maurizio: «troppo nervosa l'immagine, non rimane ferma
   neanche se io sto fermo»): a 10 letture al secondo il tremolio del radar si legge come velocità, il filtro
   «1 euro» si apre e lascia passare tutto. Prima del filtro c'è ora una QUIETE: finché la lettura resta entro
   `quiete` dal punto fermo, il punto non si muove (immagine ferma davvero); quando ne esce, il punto la segue
   tenendosi a quella distanza (si muove solo l'eccedenza, senza scatto). Per asse: x (lato) e z (distanza).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (radice) {
  const DUE_PI = Math.PI * 2;
  const alfa = (taglio, dt) => { const tau = 1 / (DUE_PI * taglio); return 1 / (1 + tau / dt); };

  class Asse {
    constructor(o, quiete){ this.o = o; this.q = quiete || 0; this.x = null; this.v = 0; this.fermo = null; }
    campione(x, dt){
      /* la quiete: il punto fermo si sposta solo di quanto la lettura ne esce */
      if (this.fermo == null) this.fermo = x;
      const d = x - this.fermo;
      if (Math.abs(d) > this.q) this.fermo += d - Math.sign(d) * this.q;
      x = this.fermo;
      if (this.x == null || !(dt > 0)){ this.x = x; this.v = 0; return; }
      const vGrezza = (x - this.x) / dt;
      this.v += (vGrezza - this.v) * alfa(this.o.tagliaVelocita, dt);
      const taglio = this.o.tagliaMinimo + this.o.beta * Math.abs(this.v);
      this.x += (x - this.x) * alfa(taglio, dt);
    }
  }

  class Inseguitore {
    /* tempi in secondi; le posizioni sono quelle normalizzate della finestra (-1…1) */
    constructor(opz = {}){
      this.o = Object.assign({
        quiete: [0.06, 0.05],    /* 16/11: x (6% del mezzo angolo: circa 7 cm a 2,5 m) e z (8 cm di distanza) */
        tagliaMinimo: 1.5,       /* Hz: quanto si ammorbidisce da fermi (con la quiete davanti può stare più alto: più pronto) */
        beta: 5,                 /* quanto si apre col movimento */
        tagliaVelocita: 2.5,     /* Hz: la velocità si stima su un respiro un po' più lungo */
        anticipo: 0.06,          /* s: il ritardo da recuperare (radar, rete, disegno, schermo) */
        orizzonte: 0.15,         /* s: oltre non si prevede */
        velocitaMassima: 3,      /* unità al secondo: un salto più rapido è un errore del radar */
        silenzio: 0.3,           /* s: se il radar tace da tanto, niente più previsione */
        sogliaMoto: [0.08, 0.3], /* unità/s: sotto, fermo (niente previsione); sopra, movimento pieno */
      }, opz);
      this.reset();
    }
    reset(){ const q = this.o.quiete || [0, 0]; this.ax = new Asse(this.o, q[0]); this.az = new Asse(this.o, q[1]); this.t = null; }
    /* un campione del radar: posizione e istante in cui il radar l'ha visto */
    campione(x, z, t){
      const dt = this.t == null ? 0 : t - this.t;
      if (this.t != null && dt <= 0) return;           /* fuori ordine o doppio: si ignora */
      if (dt > 0.6) this.reset();                       /* dopo un buco lungo si riparte da qui */
      this.ax.campione(x, this.t == null ? 0 : t - this.t);
      this.az.campione(z, this.t == null ? 0 : t - this.t);
      const vm = this.o.velocitaMassima;
      this.ax.v = Math.max(-vm, Math.min(vm, this.ax.v));
      this.az.v = Math.max(-vm, Math.min(vm, this.az.v));
      this.t = t;
    }
    /* dove disegnare adesso */
    posizione(ora){
      if (this.t == null) return null;
      const eta = ora - this.t;
      let h = Math.min(this.o.orizzonte, Math.max(0, eta + this.o.anticipo));
      if (eta > this.o.silenzio) h = 0;
      /* da fermi la velocità stimata è solo tremolio: la previsione entra piano, col movimento vero */
      const sv = Math.hypot(this.ax.v, this.az.v), [a, b] = this.o.sogliaMoto;
      const k = sv <= a ? 0 : sv >= b ? 1 : ((sv - a) / (b - a)) ** 2 * (3 - 2 * (sv - a) / (b - a));
      return { x: this.ax.x + this.ax.v * h * k, z: this.az.x + this.az.v * h * k, eta };
    }
  }
  radice.Inseguitore = Inseguitore;

  /* ═══ 17/11 · LA MOLLA (seconda prova vera col radar sopra il TV) ═══════════════════════════════════
     Maurizio: «fa schifo il movimento: va a scatti, arriva in ritardo, si sposta troppo poco».
     Il radar dà una posizione 10 volte al secondo, a gradini, e da fermo la tiene identica. La quiete
     dell'Inseguitore faceva «ferma… salto», e fra un gradino e l'altro l'immagine stava ferma.
     Qui invece:
       · il BERSAGLIO è l'ultima lettura portata avanti con la velocità (retta sulle ultime 4 letture,
         ~0,3 s: molto meno ballerina della differenza fra due); da fermi la velocità è zero e non si
         prevede niente, quindi niente tremolio;
       · l'IMMAGINE segue il bersaglio come una molla smorzata al punto giusto, aggiornata a ogni
         immagine (60 al secondo): niente gradini, niente rimbalzi;
       · una lettura sola che salta lontano (riflesso) si scarta, se la successiva non la conferma.
     Stessa interfaccia dell'Inseguitore: campione(x, z, t), posizione(ora), reset(), o.anticipo. */
  class Molla {
    constructor(opz = {}){
      this.o = Object.assign({
        anticipo: 0.10,          /* s: il ritardo da recuperare (radar, rete, molla) */
        orizzonte: 0.25,         /* s: oltre non si prevede */
        omega: 13,               /* rad/s: rigidità della molla (più alto = più pronta, meno liscia) */
        campioniVel: 4,          /* letture per stimare la velocità */
        salto: 0.6,              /* unità: una lettura che salta più di così in un decimo di secondo è sospetta */
        sogliaVel: [0.3, 0.8],   /* unità/s: sotto, fermo (niente previsione); sopra, previsione piena */
        silenzio: 0.4,           /* s: se il radar tace da tanto, niente previsione */
        /* 17/11 mattina (Maurizio, fermo al centro a 2,5 m: «troppo nervoso, si muove anche se sto quasi immobile, quasi
           ondeggiando»). Misurato: da fermi il corpo e il radar oscillano di ±5 cm (±2,3° in tutto), e la molla con la
           previsione li seguiva amplificati. Davanti alla molla torna la quiete, ma «a elastico»: dentro 2,6° (11 cm a
           2,5 m) dal punto fermo non succede niente; oltre, il punto fermo si trascina dietro alla lettura (niente salto,
           perché la molla dopo smussa). La previsione entra solo con un passo vero (oltre 0,3 unità al secondo) */
        quiete: [0.13, 0.10],
      }, opz);
      this.reset();
    }
    reset(){ this.c = []; this.p = null; this.v = {x: 0, z: 0}; this.tp = null; this.saltato = false; this.fermo = null; }
    campione(x, z, t){
      const u = this.c[this.c.length - 1];
      if (u && t <= u.t) return;
      if (u && t - u.t > 0.6) this.c = [];
      else if (u && !this.saltato && t - u.t < 0.15 && (Math.abs(x - u.x) > this.o.salto || Math.abs(z - u.z) > this.o.salto)){ this.saltato = true; return; }
      this.saltato = false;
      /* la quiete a scatto (17/11, seconda versione). Con l'elastico l'immagine restava sempre 2,6° indietro (Maurizio: «lo
         fa solo parzialmente, con grossi ritardi»). Ora due stati: FERMO, l'immagine tiene il punto e le oscillazioni dentro
         la quiete non contano; appena la lettura esce dalla quiete si passa a IN MOTO e la molla segue la lettura vera (nessun
         ritardo fisso); quando per 0,4 s la lettura resta entro mezza quiete da dov'è, si torna FERMO lì */
      const r = (this.o.quiete || [0])[0], f = this.fermo || (this.fermo = {x, z, moto: false, rif: x, tq: t});
      if (!f.moto && Math.abs(x - f.x) > r){ f.moto = true; f.rif = x; f.tq = t; }
      if (f.moto){
        if (Math.abs(x - f.rif) > r * .5){ f.rif = x; f.tq = t; }
        else if (t - f.tq > 0.4){ f.moto = false; f.x = x; f.z = z; }
      }
      if (!f.moto){ x = f.x; z = f.z; }
      this.c.push({x, z, t});
      while (this.c.length > this.o.campioniVel) this.c.shift();
      if (!this.p) this.p = {x, z};
    }
    vel(k){
      const c = this.c, n = c.length;
      if (n < 3) return 0;
      let mt = 0, mv = 0;
      for (const q of c){ mt += q.t; mv += q[k]; }
      mt /= n; mv /= n;
      let a = 0, b = 0;
      for (const q of c){ a += (q.t - mt) * (q[k] - mv); b += (q.t - mt) ** 2; }
      return b > 0 ? a / b : 0;
    }
    posizione(ora){
      if (!this.p) return null;
      const c = this.c, u = c[c.length - 1];
      const eta = u ? ora - u.t : 9;
      const h = !u || eta > this.o.silenzio ? 0 : Math.min(this.o.orizzonte, Math.max(0, eta + this.o.anticipo));
      const [a, b] = this.o.sogliaVel, g = v => { const s = Math.abs(v); return s <= a ? 0 : s >= b ? 1 : (s - a) / (b - a); };
      const vx = this.vel('x'), vz = this.vel('z');
      const tx = u ? u.x + vx * h * g(vx) : this.p.x, tz = u ? u.z + vz * h * g(vz) : this.p.z;
      const dt = this.tp == null ? 0 : Math.min(0.05, Math.max(0, ora - this.tp));
      this.tp = ora;
      const w = this.o.omega;
      for (let resto = dt; resto > 1e-6; ){
        const s = Math.min(0.008, resto); resto -= s;
        for (const [k, tk] of [['x', tx], ['z', tz]]){
          const acc = w * w * (tk - this.p[k]) - 2 * w * this.v[k];
          this.v[k] += acc * s; this.p[k] += this.v[k] * s;
        }
      }
      return {x: this.p.x, z: this.p.z, eta};
    }
  }
  radice.Molla = Molla;
  if (typeof module !== 'undefined') module.exports = { Inseguitore, Molla };
})(typeof window !== 'undefined' ? window : globalThis);
