/* ═══════════════════════════════════════════════════════════════════════════
   uccelli.js — gli uccelli nel cielo delle finestre, simulati come uno stormo vero.

   Maurizio (30/10): «migliora il movimento ed il volo degli uccelli, troppo fake». Prima il volo era una
   formula fissa (una V che scorre e ondeggia). Qui ogni uccello è un piccolo corpo che vola:
     · lo stormo si tiene insieme senza toccarsi (separazione, allineamento, coesione), vira insieme e cambia forma;
     · le ali battono quando l'uccello sale o rallenta e plana quando scende; i piccoli volano «a sbalzi»
       (qualche battito, una pausa), i grandi battono più lenti;
     · in virata si inclina dalla parte della curva;
     · ogni tanto un rapace sale in cerchio in una corrente calda, ad ali tese, e poi se ne va;
     · entrano ed escono dai bordi, mai dal nulla; più lontani (più in alto nel cielo) vuol dire più piccoli e chiari.
   I calcoli stanno qui (pochi corpi, sul processore); la scheda grafica disegna soltanto: sul Raspberry era la
   formula nel disegno a costare. Coordinate: y da 0 (in alto) a 1, x da 0 a A (A = larghezza/altezza della vista).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (radice) {
  const MAX = 12;
  const caso = (a, b) => a + Math.random() * (b - a);

  class Stormi {
    constructor(){ this.u = []; this.A = .4; this.prossimoStormo = caso(3, 12); this.prossimoRapace = caso(40, 90); this.t = 0; }

    /* dt in secondi; A = larghezza/altezza della vista; quanti = 0..1 (tempo e luce: 0 = nessun uccello nuovo) */
    aggiorna(dt, A, quanti){
      this.A = A || this.A; this.t += dt;
      dt = Math.min(dt, .05);
      if (quanti > .3){
        if ((this.prossimoStormo -= dt) <= 0){ this.nuovoStormo(); this.prossimoStormo = caso(18, 55) / quanti; }
        if ((this.prossimoRapace -= dt) <= 0){ this.nuovoRapace(); this.prossimoRapace = caso(110, 220) / quanti; }
      }
      const u = this.u;
      for (const b of u){
        if (b.rapace){ this.volaRapace(b, dt); continue; }
        /* stormo: le tre regole fra compagni dello stesso stormo */
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        for (const o of u){
          if (o === b || o.stormo !== b.stormo) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) + 1e-6;
          if (d < .016 * b.scala){ sx -= dx / d / d; sy -= dy / d / d; }
          if (d < .09){ ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; n++; }
        }
        let fx = 0, fy = 0;
        if (n){ fx += (ax / n - b.vx) * 1.2 + (cx / n - b.x) * .9; fy += (ay / n - b.vy) * 1.2 + (cy / n - b.y) * .9; }
        fx += sx * .00012; fy += sy * .00012;
        /* la meta dello stormo (attraversare) e la quota che preferisce, con un vagare lento */
        const st = b.st;
        st.ang += (Math.random() - .5) * dt * .6;
        fx += (Math.cos(st.ang) * st.dir * st.vel - b.vx) * .5;
        fy += (Math.sin(st.ang) * .25 * st.vel - b.vy) * .5 + (st.quota - b.y) * .35;
        if (b.y < .03) fy += (.03 - b.y) * 6;                       /* non sopra il bordo alto */
        b.vx += fx * dt; b.vy += fy * dt;
        const v = Math.hypot(b.vx, b.vy), vmin = st.vel * .6, vmax = st.vel * 1.5;
        if (v > vmax){ b.vx *= vmax / v; b.vy *= vmax / v; } else if (v < vmin){ b.vx *= vmin / (v + 1e-6); b.vy *= vmin / (v + 1e-6); }
        /* inclinazione in virata */
        const dir = Math.atan2(b.vy, b.vx), giro = ((dir - b.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        b.dir = dir; b.bank += (Math.max(-.6, Math.min(.6, giro / Math.max(dt, 1e-3) * .25)) - b.bank) * Math.min(1, dt * 4);
        b.x += b.vx * dt; b.y += b.vy * dt;
        /* ali: battono salendo o rallentando, planano scendendo; i piccoli a sbalzi */
        const sale = -b.vy / (st.vel + 1e-6), lento = 1 - v / (st.vel * 1.2);
        let vuole = Math.max(0, Math.min(1, .35 + sale * 1.4 + lento * 1.2));
        if (b.sbalzi){ b.ritmo -= dt; if (b.ritmo <= 0){ b.batte = !b.batte; b.ritmo = b.batte ? caso(.4, .9) : caso(.3, 1.1); } if (!b.batte) vuole *= .15; }
        b.forza += (vuole - b.forza) * Math.min(1, dt * 3);
        b.fase += dt * b.freq * (.7 + .5 * b.forza);
        b.ali = Math.sin(b.fase) * b.forza - (1 - b.forza) * .15;     /* planando le ali restano un po' basse */
        if (b.x < -.25 || b.x > this.A + .25 || b.y > .6) b.via = true;
      }
      this.u = u.filter(b => !b.via);
      /* quando il tempo si guasta, chi c'è se ne va più in fretta */
      if (quanti < .3) for (const b of this.u) if (!b.rapace) b.st.vel = Math.min(b.st.vel * (1 + dt * .5), .12);
    }

    nuovoStormo(){
      const liberi = MAX - this.u.length; if (liberi < 3) return;
      const n = Math.min(liberi - (this.u.some(b => b.rapace) ? 0 : 1), Math.round(caso(3, 9)));
      if (n < 3) return;
      const dir = Math.random() < .5 ? 1 : -1, quota = caso(.07, .28);
      const lont = (quota - .07) / .21;                            /* 0 vicino (in basso) … 1 lontano */
      const piccoli = Math.random() < .65;
      const st = {dir, quota, vel: caso(.035, .06) * (1.1 - lont * .3), ang: caso(-.25, .25)};
      const id = Math.random(), scala = (piccoli ? caso(.8, 1) : caso(1.15, 1.45)) * (1.25 - lont * .55);
      for (let i = 0; i < n; i++){
        this.u.push({stormo: id, st, x: (dir > 0 ? -.12 : this.A + .12) - dir * caso(0, .1), y: quota + caso(-.025, .025),
          vx: dir * st.vel, vy: 0, dir: dir > 0 ? 0 : Math.PI, bank: 0, scala: scala * caso(.85, 1.15),
          fase: caso(0, 6.28), freq: piccoli ? caso(15, 20) : caso(9, 12), forza: .6, ali: 0,
          sbalzi: piccoli, batte: true, ritmo: caso(.2, .8), alfa: 1 - lont * .35, rapace: false});
      }
    }

    nuovoRapace(){
      if (this.u.length >= MAX || this.u.some(b => b.rapace)) return;
      const dir = Math.random() < .5 ? 1 : -1;
      this.u.push({rapace: true, dir, cx: dir > 0 ? -.15 : this.A + .15, cy: caso(.14, .26), th: caso(0, 6.28), r: caso(.045, .07),
        om: caso(.28, .42) * (Math.random() < .5 ? 1 : -1), deriva: dir * caso(.006, .012), x: 0, y: 0, bank: 0,
        scala: caso(2, 2.5), fase: 0, freq: 5, forza: 0, ali: 0, alfa: 1, vita: caso(55, 90)});
    }

    volaRapace(b, dt){
      b.vita -= dt;
      b.th += b.om * dt; b.cx += b.deriva * dt; b.cy -= .0015 * dt;          /* sale piano nella corrente */
      if (b.vita < 0){ b.deriva *= 1 + dt * .8; b.cy -= .004 * dt; }        /* poi se ne va */
      b.x = b.cx + Math.cos(b.th) * b.r; b.y = b.cy + Math.sin(b.th) * b.r * .3;   /* il cerchio visto di sbieco */
      b.bank = -Math.sin(b.th) * .45 * Math.sign(b.om);
      b.forza += ((Math.sin(this.t * .2 + b.cy * 40) > .93 ? .8 : 0) - b.forza) * Math.min(1, dt * 2);   /* qualche colpo d'ala, raro */
      b.fase += dt * b.freq; b.ali = Math.sin(b.fase) * b.forza + .05;
      if (b.x < -.3 || b.x > this.A + .3 || b.y < -.05) b.via = true;
    }

    /* per il disegno: per ogni uccello due vec4 (x 0..1 della vista, y, grandezza, ali) (inclinazione, chiarezza, tipo, 0) */
    dati(){
      const d = new Float32Array(MAX * 8);
      this.u.slice(0, MAX).forEach((b, i) => {
        d.set([b.x / this.A, b.y, b.scala, b.ali, b.bank, b.alfa, b.rapace ? 1 : 0, 0], i * 8);
      });
      return {dati: d, n: Math.min(MAX, this.u.length)};
    }
  }
  radice.Stormi = Stormi; radice.MAX_UCCELLI = MAX;
  if (typeof module !== 'undefined') module.exports = {Stormi};
})(typeof window !== 'undefined' ? window : globalThis);
