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
   ═══════════════════════════════════════════════════════════════════════════ */
(function (radice) {
  const DUE_PI = Math.PI * 2;
  const alfa = (taglio, dt) => { const tau = 1 / (DUE_PI * taglio); return 1 / (1 + tau / dt); };

  class Asse {
    constructor(o){ this.o = o; this.x = null; this.v = 0; }
    campione(x, dt){
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
        tagliaMinimo: 1.2,       /* Hz: quanto si ammorbidisce da fermi (più basso = più fermo) */
        beta: 7,                 /* quanto si apre col movimento */
        tagliaVelocita: 2.5,     /* Hz: la velocità si stima su un respiro un po' più lungo */
        anticipo: 0.06,          /* s: il ritardo da recuperare (radar, rete, disegno, schermo) */
        orizzonte: 0.15,         /* s: oltre non si prevede */
        velocitaMassima: 3,      /* unità al secondo: un salto più rapido è un errore del radar */
        silenzio: 0.3,           /* s: se il radar tace da tanto, niente più previsione */
        sogliaMoto: [0.08, 0.3], /* unità/s: sotto, fermo (niente previsione); sopra, movimento pieno */
      }, opz);
      this.reset();
    }
    reset(){ this.ax = new Asse(this.o); this.az = new Asse(this.o); this.t = null; }
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
  if (typeof module !== 'undefined') module.exports = { Inseguitore };
})(typeof window !== 'undefined' ? window : globalThis);
