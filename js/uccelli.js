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
    constructor(){ this.u = []; this.A = .4; this.prossimoStormo = caso(3, 12); this.prossimoRapace = caso(40, 90); this.t = 0; }

    aggiorna(dt, A, quanti){
      this.A = A || this.A; this.t += dt; dt = Math.min(dt, .05);
      if (quanti > .3){
        if ((this.prossimoStormo -= dt) <= 0){ this.nuovoStormo(); this.prossimoStormo = caso(18, 55) / quanti; }
        if ((this.prossimoRapace -= dt) <= 0){ this.nuovoRapace(); this.prossimoRapace = caso(110, 220) / quanti; }
      }
      const u = this.u;
      for (const b of u){
        if (b.rapace){ this.volaRapace(b, dt); continue; }
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
      if (quanti < .3) for (const b of this.u) if (!b.rapace) b.st.vel = Math.min(b.st.vel * (1 + dt * .5), .2);
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
        d.set([sx / this.A, sy, b.scala * 1.35 / z, b.ali, b.bank, alfa, b.rapace ? 1 : 0, 0], i * 8);
      });
      return {dati: d, n: Math.min(MAX, this.u.length)};
    }
  }
  radice.Stormi = Stormi; radice.MAX_UCCELLI = MAX;
  if (typeof module !== 'undefined') module.exports = {Stormi};
})(typeof window !== 'undefined' ? window : globalThis);
