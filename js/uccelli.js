/* ═══════════════════════════════════════════════════════════════════════════
   uccelli.js — gli uccelli nel cielo delle finestre, simulati come uno stormo vero, in tre dimensioni.

   Maurizio (30/10): «migliora il movimento ed il volo degli uccelli, troppo fake», poi: «non troppo geometrico
   il volo con gli uccelli sempre alla stessa distanza… non vanno sempre in linea retta rispetto all'osservatore
   ma fanno tipo delle onde. E non sono tutti sempre alla stessa identica direzione».
   Per questo il volo è nello spazio, non sullo schermo:
     · ogni uccello ha una posizione in larghezza, altezza e PROFONDITÀ; lo stormo curva anche verso chi guarda o
       lontano da lui, e lo schermo mostra la prospettiva: chi si avvicina si ingrandisce, chi si allontana rimpicciolisce
       e schiarisce nella foschia, e le distanze fra loro cambiano di continuo;
     · le ONDE vengono dal volo stesso: battendo le ali salgono, planando scendono; i piccoli volano «a sbalzi»
       (qualche battito, una pausa), i grandi ondeggiano meno;
     · ognuno ha la sua velocità e la sua direzione, che tende a quella dello stormo ma non la copia mai;
       lo stormo si tiene insieme senza toccarsi e cambia forma;
     · in virata si inclinano; ogni tanto un rapace sale in cerchio in una corrente calda (un cerchio vero,
       visto di sbieco: si avvicina e si allontana) e poi se ne va;
     · entrano ed escono dai bordi o si perdono in lontananza, mai dal nulla.
   Coordinate del mondo: X a destra, Y in su (0 = l'orizzonte), Z la distanza (1 = la scala di riferimento).
   Sullo schermo: x = A/2 + X/Z, y = ORIZZONTE − Y/Z, con A = larghezza/altezza della vista.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (radice) {
  const MAX = 12, ORIZZONTE = .36;
  const caso = (a, b) => a + Math.random() * (b - a);
  const giro = a => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  class Stormi {
    constructor(){ this.u = []; this.A = .4; this.prossimoStormo = caso(3, 12); this.prossimoRapace = caso(40, 90); this.prossimoPip = caso(4, 15); this.t = 0; }

    /* pip: 0..1, quanti pipistrelli (9/11: al tramonto e di notte, js/vita.js) */
    aggiorna(dt, A, quanti, pip = 0){
      this.A = A || this.A; this.t += dt; dt = Math.min(dt, .05);
      if (quanti > .3){
        if ((this.prossimoStormo -= dt) <= 0){ this.nuovoStormo(); this.prossimoStormo = caso(18, 55) / quanti; }
        if ((this.prossimoRapace -= dt) <= 0){ this.nuovoRapace(); this.prossimoRapace = caso(110, 220) / quanti; }
      }
      if (pip > .1 && (this.prossimoPip -= dt) <= 0){ this.nuovoPipistrello(); this.prossimoPip = caso(8, 30) / pip; }
      const u = this.u;
      for (const b of u){
        if (b.rapace){ this.volaRapace(b, dt); continue; }
        if (b.pip){ this.volaPipistrello(b, dt); continue; }
        const st = b.st;
        /* la rotta dello stormo curva piano, anche verso chi guarda o lontano */
        st.psi += st.curva * dt; st.curva += (Math.random() - .5) * dt * .5; st.curva *= 1 - dt * .3;
        /* ognuno ha la sua idea della rotta, che vaga */
        b.mio += (Math.random() - .5) * dt * 1.4; b.mio *= 1 - dt * .4;
        const psi = st.psi + b.mio, v0 = st.vel * b.vel;
        let ax = (Math.cos(psi) * v0 - b.vx) * .8, az = (Math.sin(psi) * v0 - b.vz) * .8, ay = 0;
        /* separazione, allineamento (debole), coesione, nello spazio */
        let sx = 0, sy = 0, sz = 0, mx = 0, my = 0, mz = 0, vx = 0, vz = 0, n = 0;
        for (const o of u){
          if (o === b || o.stormo !== b.stormo) continue;
          const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z, d = Math.hypot(dx, dy, dz) + 1e-6;
          if (d < .03){ sx -= dx / (d * d); sy -= dy / (d * d); sz -= dz / (d * d); }
          if (d < .2){ mx += o.x; my += o.y; mz += o.z; vx += o.vx; vz += o.vz; n++; }
        }
        ax += sx * .0006; ay += sy * .0006; az += sz * .0006;
        if (n){ ax += (mx / n - b.x) * .25 + (vx / n - b.vx) * .35; ay += (my / n - b.y) * .25; az += (mz / n - b.z) * .25 + (vz / n - b.vz) * .35; }
        /* le onde: battendo sale, planando scende; e torna verso la quota dello stormo */
        if (b.sbalzi){ b.ritmo -= dt; if (b.ritmo <= 0){ b.batte = !b.batte; b.ritmo = b.batte ? caso(.35, .8) : caso(.3, .9); } }
        else { b.ritmo -= dt; if (b.ritmo <= 0){ b.batte = Math.random() < .75; b.ritmo = caso(.8, 2.2); } }
        const vuole = b.batte ? 1 : .08;
        b.forza += (vuole - b.forza) * Math.min(1, dt * 4);
        ay += (b.forza - .45) * (b.sbalzi ? .09 : .04) + (st.quota - b.y) * .6 - b.vy * 1.2;
        if (b.z < .5) az += (.5 - b.z) * 2;                      /* non addosso alla finestra */
        b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.fase += dt * b.freq * (.7 + .5 * b.forza);
        b.ali = Math.sin(b.fase) * b.forza - (1 - b.forza) * .15;
        /* inclinazione: da quanto curva sullo schermo */
        const sxp = this.A / 2 + b.x / b.z, syp = ORIZZONTE - b.y / b.z;
        if (b.px != null){ const dir = Math.atan2(syp - b.py, sxp - b.px); if (b.dir != null){ const g = giro(dir - b.dir); b.bank += (Math.max(-.7, Math.min(.7, g / Math.max(dt, 1e-3) * .12)) - b.bank) * Math.min(1, dt * 3); } b.dir = dir; }
        b.px = sxp; b.py = syp;
        if (sxp < -.3 || sxp > this.A + .3 || b.z > 4 || syp > .6 || syp < -.1) b.via = true;
      }
      this.u = u.filter(b => !b.via);
      if (quanti < .3) for (const b of this.u) if (!b.rapace && !b.pip) b.st.vel = Math.min(b.st.vel * (1 + dt * .5), .2);
    }

    nuovoStormo(){
      const liberi = MAX - this.u.length; if (liberi < 3) return;
      const n = Math.min(liberi - (this.u.some(b => b.rapace) ? 0 : 1), Math.round(caso(3, 9)));
      if (n < 3) return;
      const dir = Math.random() < .5 ? 1 : -1, z = caso(.8, 2.4), sy = caso(.07, .27);
      const piccoli = Math.random() < .65;
      /* entra da un lato e attraversa, di sbieco: un po' verso chi guarda o un po' lontano */
      const st = {psi: (dir > 0 ? 0 : Math.PI) + caso(-.5, .5), curva: caso(-.25, .25), vel: caso(.05, .085), quota: (ORIZZONTE - sy) * z};
      const id = Math.random(), scala = piccoli ? caso(.8, 1) : caso(1.15, 1.45);
      const x0 = -dir * (this.A / 2 + .06) * z;
      for (let i = 0; i < n; i++){
        this.u.push({stormo: id, st, x: x0 - dir * caso(0, .12), y: st.quota + caso(-.03, .03), z: z + caso(-.12, .12),
          vx: Math.cos(st.psi) * st.vel, vy: 0, vz: Math.sin(st.psi) * st.vel, mio: caso(-.3, .3), vel: caso(.85, 1.15),
          scala: scala * caso(.85, 1.15), fase: caso(0, 6.28), freq: piccoli ? caso(15, 20) : caso(8, 11), forza: .6, ali: 0,
          sbalzi: piccoli, batte: true, ritmo: caso(.1, .8), bank: 0, rapace: false});
      }
    }

    nuovoRapace(){
      if (this.u.length >= MAX || this.u.some(b => b.rapace)) return;
      const dir = Math.random() < .5 ? 1 : -1, z = caso(1.4, 2.4);
      this.u.push({rapace: true, dir, cx: -dir * (this.A / 2 + .1) * z, cz: z, cy: (ORIZZONTE - caso(.14, .24)) * z, th: caso(0, 6.28),
        r: caso(.12, .2), om: caso(.25, .4) * (Math.random() < .5 ? 1 : -1), deriva: dir * caso(.012, .022),
        x: 0, y: 0, z, bank: 0, scala: caso(2, 2.5), fase: 0, freq: 5, forza: 0, ali: 0, vita: caso(55, 90)});
    }

    /* ⚠ 10/11 · PIPISTRELLI rifatti (Maurizio: «il volo dei pipistrelli mi sembrava finto»). Prima: velocità costante a
       tratti dritti, con un cambio di direzione secco ogni mezzo secondo (un robot a zig-zag). Dal vero un pipistrello
       che caccia: gira di continuo e stretto (curve morbide ma rapide, mai un tratto dritto), ronza in una zona
       davanti a sé facendo anelli e otto, ogni tanto scarta di colpo e cala per prendere un insetto; il battito è
       fittissimo e irregolare e la velocità sobbalza col battito (il volo «sfarfallante»). Qui: direzione e velocità
       in curva continua (la velocità di rotazione cambia piano verso valori sempre nuovi), un richiamo morbido verso
       la sua zona di caccia, gli scarti, il sobbalzo a ogni colpo d'ala. Poi se ne va da un lato.
       ⚠ 10/11 (Maurizio, sul video: «sembra un video velocizzato, o sembrano più delle mosche»): troppo piccoli e anelli
       troppo stretti e svelti (un giro in un secondo, in un fazzoletto di cielo). Un pipistrello che si vede da una
       finestra vola a pochi metri: più grande, curve larghe (un anello prende un buon pezzo di cielo e dura 2-3 s),
       scarti più rari e meno secchi. Uno alla volta, a volte due.
       ⚠ 10/11 (Maurizio: «meglio ma ancora fake»): curve larghe e lisce sono il volo della rondine. Il pipistrello è
       nervoso: sopra la curva di fondo la direzione trema di continuo (piccoli sbandamenti, 4-8 al secondo), ogni
       mezzo secondo-secondo e mezzo uno scatto di lato di 30-60° (insegue un insetto) e la velocità cambia a strappi;
       il battito è fitto (7-9 al secondo, prima 3) e a ogni colpo il corpo sobbalza su e giù.
       ⚠ 10/11 (Maurizio: «rimangono sempre della stessa grandezza, come se fossero sempre alla stessa distanza»):
       la distanza ora cambia di continuo e di molto (da metà a quasi il doppio di quella di partenza, una nuova meta
       ogni 1,5-3 s), e ogni tanto passa vicinissimo alla finestra per un attimo e torna; da vicino è più grande, va
       più svelto sullo schermo e più scuro, da lontano è piccolo, lento e un po' velato.
       ⚠ 10/11 (Maurizio: «farei in maniera che duri poco il volo, che si allontanino e scompaiano o vadano fuori
       dall'inquadratura»): caccia solo 3-7 s (prima 8-18). Arriva da un lato oppure dal fondo (piccolo e velato,
       cresce avvicinandosi); poi se ne va in uno di tre modi: si allontana nel fondo rimpicciolendo e sfumando fino a
       sparire (40%), esce di lato (40%) o esce in alto sopra la finestra (20%), accelerando */
    nuovoPipistrello(){
      if (this.u.length >= MAX || this.u.filter(b => b.pip).length >= (Math.random() < .3 ? 2 : 1)) return;
      const dir = Math.random() < .5 ? 1 : -1, dalFondo = Math.random() < .5, z = dalFondo ? caso(4, 4.6) : caso(.8, 1.2);
      const sx = dalFondo ? caso(.25, .75) * this.A : dir > 0 ? -.05 : this.A + .05, sy = ORIZZONTE - (dalFondo ? caso(.05, .12) : caso(.1, .26));
      this.u.push({pip: true, sx, sy, z, x: (sx - this.A / 2) * z, y: (ORIZZONTE - sy) * z,
        h: dir > 0 ? caso(-.4, .4) : Math.PI + caso(-.4, .4), v: caso(.3, .38), w: 0, wt: 0, cambio: 0,
        cx: caso(.3, .7) * this.A, cy: ORIZZONTE - caso(.12, .22), raggio: caso(.18, .3), scarto: 0,
        vita: caso(3, 7), dir, scala: caso(2.4, 3.1), fase: caso(0, 6.28), freq: caso(45, 56), amp: 1, ali: 0, bank: 0, jit: 0, jitT: 0, jitC: 0, scatto: caso(.5, 1.4),
        zt: dalFondo ? caso(.8, 1.1) : z, zC: dalFondo ? 2.5 : 0, uscita: null});
    }
    volaPipistrello(b, dt){
      b.vita -= dt;
      /* finita la caccia sceglie come andarsene */
      if (b.vita <= 0 && !b.uscita){
        const r = Math.random();
        b.uscita = r < .4 ? 'fondo' : r < .8 ? 'lato' : 'alto';
        if (b.uscita === 'lato') b.dir = b.sx < this.A / 2 ? -1 : 1;     /* dal lato più vicino */
        if (b.uscita === 'fondo'){ b.x = (b.sx - this.A / 2) * b.z; b.y = (ORIZZONTE - b.sy) * b.z; }
      }
      if (b.uscita === 'fondo') return this.allontana(b, dt);
      if ((b.cambio -= dt) <= 0){
        b.cambio = caso(.4, 1);
        b.wt = caso(-2.6, 2.6);                                        /* nuova voglia di girare, rad/s: un anello in 2-3 s */
        b.amp = caso(.75, 1.05);
      }
      /* la zona di caccia: finché caccia ci torna (curva verso il centro se si allontana), poi esce dal suo lato */
      const tx = b.vita > 0 ? b.cx : b.uscita === 'alto' ? b.sx + b.dir * .1 : (b.dir > 0 ? this.A + .4 : -.4),
            ty = b.vita > 0 ? b.cy : b.uscita === 'alto' ? -.5 : b.sy - .05;
      /* la zona è larga e bassa (il cielo sopra l'orizzonte è una striscia): in verticale conta il doppio */
      const dx = tx - b.sx, dy = ty - b.sy, dist = Math.hypot(dx, dy * 2);
      let verso = Math.atan2(dy, dx) - b.h; verso = Math.atan2(Math.sin(verso), Math.cos(verso));
      /* vicino al bordo alto o all'orizzonte gira prima di arrivarci (prima ci strisciava contro in linea dritta) */
      const bordo = Math.max(b.uscita ? 0 : Math.min(1, (.16 - b.sy) / .08), Math.min(1, (b.sy - (ORIZZONTE - .13)) / .08), 0);
      const richiamo = Math.max(b.vita > 0 ? Math.min(1, Math.max(0, (dist - b.raggio) / b.raggio)) : .8, bordo);
      /* scarto per un insetto: di colpo, un quarto di giro e giù */
      if (b.vita > 0 && b.scarto <= 0 && Math.random() < dt * .18){ b.scarto = .3; b.w = (Math.random() < .5 ? -1 : 1) * caso(4, 6); b.v = caso(.42, .5); }
      b.scarto -= dt;
      if (b.scarto <= 0) b.w += ((b.wt * (1 - richiamo) + verso * (2.5 + 5 * bordo) * richiamo) - b.w) * Math.min(1, dt * (3 + 6 * bordo));
      b.h += b.w * dt;
      /* lo scatto di lato: la direzione salta di 30-60° in un decimo di secondo, e la velocità con lei */
      if ((b.scatto -= dt) <= 0 && b.vita > 0){ b.scatto = caso(.5, 1.5); b.h += (Math.random() < .5 ? -1 : 1) * caso(.5, 1); b.v = caso(.24, .46); }
      /* il tremito della direzione (non si accumula: sbanda e torna) */
      if ((b.jitC -= dt) <= 0){ b.jitC = caso(.12, .25); b.jitT = caso(-.45, .45); }
      b.jit += (b.jitT - b.jit) * Math.min(1, dt * 14);
      const hh = b.h + b.jit;
      b.fase += dt * b.freq;
      const colpo = Math.sin(b.fase);
      b.ali = colpo * b.amp;
      b.v += ((b.uscita ? .45 : .33) - b.v) * Math.min(1, dt * .8);     /* andandosene accelera */
      const vv = b.v * (1 + .18 * colpo);                               /* il sobbalzo a ogni colpo d'ala */
      const zz = Math.max(.32, b.z);                                    /* da vicino va più svelto sullo schermo */
      b.sx += Math.cos(hh) * vv * dt / zz;
      b.sy += Math.sin(hh) * vv * dt * .75 / zz + (b.scarto > 0 ? .1 * dt : 0) + Math.cos(b.fase) * .0035 * b.freq * dt;
      b.sy = Math.min(ORIZZONTE - .02, Math.max(b.uscita === 'alto' ? -.3 : .03, b.sy));
      /* la distanza: una meta nuova ogni 1,5-3 s, e ogni tanto un passaggio vicinissimo */
      if ((b.zC = (b.zC || 0) - dt) <= 0){
        b.zC = caso(1.5, 3);
        b.zt = Math.random() < .18 && b.vita > 0 ? caso(.32, .42) : Math.exp(caso(Math.log(.55), Math.log(1.9)));
        if (b.zt < .45) b.zC = caso(.7, 1.1);                            /* da vicino ci resta poco */
      }
      b.z += (b.zt - b.z) * Math.min(1, dt * 1.6);
      b.x = (b.sx - this.A / 2) * b.z; b.y = (ORIZZONTE - b.sy) * b.z;
      b.bank += (Math.max(-.6, Math.min(.6, -b.w * .15)) - b.bank) * Math.min(1, dt * 5);
      if (b.vita < 0 && (b.sx < -.25 || b.sx > this.A + .25 || b.sy < -.2)) b.via = true;
      if (b.vita < -20) b.via = true;
    }
    /* se ne va nel fondo: la sua posizione nel mondo resta (con un po' di sbandare), la distanza cresce, e sullo
       schermo rimpicciolisce, rallenta e scivola verso l'orizzonte come fa una cosa che si allontana; sfuma e sparisce */
    allontana(b, dt){
      b.fase += dt * b.freq;
      b.ali = Math.sin(b.fase) * b.amp;
      if ((b.jitC -= dt) <= 0){ b.jitC = caso(.15, .35); b.jitT = caso(-1, 1); }
      b.jit += (b.jitT - b.jit) * Math.min(1, dt * 6);
      b.x += (b.dir * .06 + b.jit * .12) * dt * b.z;
      b.y += Math.cos(b.fase) * .0025 * b.freq * dt * b.z;
      b.z += dt * (.5 + b.z * .35);                                       /* sempre più svelto: 1→5 in circa 3 s */
      b.bank += (Math.max(-.6, Math.min(.6, -b.jit * .5)) - b.bank) * Math.min(1, dt * 5);
      b.sx = this.A / 2 + b.x / b.z; b.sy = ORIZZONTE - b.y / b.z;
      if (b.z > 5.2) b.via = true;
    }

    volaRapace(b, dt){
      b.vita -= dt;
      b.th += b.om * dt; b.cx += b.deriva * dt; b.cy += .004 * dt;              /* sale piano nella corrente */
      if (b.vita < 0){ b.deriva *= 1 + dt * .8; b.cy += .01 * dt; }            /* poi se ne va */
      b.x = b.cx + Math.cos(b.th) * b.r; b.z = b.cz + Math.sin(b.th) * b.r; b.y = b.cy;   /* un cerchio vero, in prospettiva */
      b.bank = -Math.cos(b.th) * .5 * Math.sign(b.om);
      b.forza += ((Math.sin(this.t * .2 + b.cz * 7) > .93 ? .8 : 0) - b.forza) * Math.min(1, dt * 2);
      b.fase += dt * b.freq; b.ali = Math.sin(b.fase) * b.forza + .05;
      const sxp = this.A / 2 + b.x / b.z, syp = ORIZZONTE - b.y / b.z;
      if (sxp < -.35 || sxp > this.A + .35 || syp < -.1) b.via = true;
    }

    /* per il disegno: per ogni uccello (x 0..1 della vista, y, grandezza, ali) (inclinazione, chiarezza, tipo, -) */
    dati(){
      const d = new Float32Array(MAX * 8);
      this.u.slice(0, MAX).forEach((b, i) => {
        const z = Math.max(.35, b.z), sx = this.A / 2 + b.x / z, sy = ORIZZONTE - b.y / z;
        const alfa = Math.max(.35, Math.min(1, 1.25 - z * .28));          /* più lontano = più chiaro nella foschia */
        d.set([sx / this.A, sy, b.scala * 1.35 / z, b.ali, b.bank, b.pip ? Math.max(.45, Math.min(1, 1.2 - z * .35)) * Math.max(0, Math.min(1, (5.2 - z) / 2.4)) : alfa, b.rapace ? 1 : b.pip ? 2 : 0, 0], i * 8);
      });
      /* il riquadro che li contiene tutti (con margine per le ali): il disegno lavora solo lì dentro */
      let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
      for (let i = 0; i < Math.min(MAX, this.u.length); i++){
        const x = d[i * 8], y = d[i * 8 + 1], m = d[i * 8 + 2] * .02 + .01;
        x0 = Math.min(x0, x - m / this.A); x1 = Math.max(x1, x + m / this.A); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m);
      }
      return {dati: d, n: Math.min(MAX, this.u.length), box: [x0, y0, x1, y1]};
    }
  }
  radice.Stormi = Stormi; radice.MAX_UCCELLI = MAX;
  if (typeof module !== 'undefined') module.exports = {Stormi};
})(typeof window !== 'undefined' ? window : globalThis);
