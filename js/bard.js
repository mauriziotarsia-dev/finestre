/* ═══════════════════════════════════════════════════════════════════════════
   bard.js — il lettore di Bard (musiche e suoni della stanza), 1/11/2026.
   Suona dove è stato scelto: la pagina del TV sul G10 (di solito) o il telefono stesso.
   Quattro canali, ognuno col suo volume:
     tempo       pioggia, vento, neve, temporale che seguono la scena delle finestre; tuoni coi lampi;
                 se la registrazione non c'è (non ancora copiata da DMaster) un suono fatto qui, più semplice
     sottofondo  un ambiente in loop (taverna, foresta…), con dissolvenza quando cambia
     musica      una lista di brani, uno dopo l'altro (o a caso)
     effetti     colpi singoli a comando
   Lo stato arriva intero da chi comanda (telefono o DMaster), con gli indirizzi firmati dei file:
     {rev, dove, tempo:{acceso, volume}, registrazioni:{pioggia:url…}, sottofondo:{id,url,titolo}|null, volSottofondo,
      musica:{brani:[{id,url,titolo}], i, casuale, acceso}|null, volMusica, volEffetti}
   ═══════════════════════════════════════════════════════════════════════════ */
const BARD_PRED = {rev:0, dove:'stanza', tempo:{acceso:true, volume:.6}, registrazioni:{}, sottofondo:null, volSottofondo:.6,
  musica:null, volMusica:.5, volEffetti:.8};
/* quanto vento c'è con ogni tempo, se il telefono lo lascia «auto» */
const BARD_VENTO = {sereno:.12, nuvoloso:.28, nebbia:.08, pioggia:.32, temporale:.8, neve:.38};

class LettoreBard {
  constructor({quandoCambia, tuoniDaSoli = false} = {}){
    this.tuoniDaSoli = tuoniDaSoli;   /* sul telefono non ci sono i lampi della finestra: col temporale i tuoni vengono da soli */
    this.stato = Object.assign({}, BARD_PRED);
    this.scena = null;
    this.qui = false;          /* questo apparecchio deve suonare? (lo decide la pagina) */
    this.muto = false;         /* la Serata di DMaster comanda: Bard tace */
    this.ctx = null; this.buffer = new Map(); this.strati = {}; this.quandoCambia = quandoCambia || (() => {});
    this.el = null; this.branoOra = null; this.prossimoTuono = 0; this.prossimaRaffica = 0;
    setInterval(() => this._ogniTanto(), 1000);
  }
  /* ── l'audio ─────────────────────────────────────────────────────────────── */
  _ctx(){
    if (!this.ctx){
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      const x = this.ctx = new C();
      this.master = x.createGain(); this.master.connect(x.destination);
      this.canali = {};
      for (const k of ['tempo', 'sottofondo', 'musica', 'effetti']){ const g = x.createGain(); g.gain.value = 0; g.connect(this.master); this.canali[k] = g; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  /** l'uscita audio (le casse del TV, una JBL…): l'id del browser; se non c'è più, l'uscita predefinita del sistema */
  async uscita(id){
    this.idUscita = id || '';
    const x = this._ctx(); if (!x) return false;
    try {
      if (x.setSinkId) await x.setSinkId(this.idUscita);
      if (this.el && this.el.setSinkId) await this.el.setSinkId(this.idUscita);
      return true;
    } catch(e) { console.warn('[bard] uscita', e.message); try { if (x.setSinkId) await x.setSinkId(''); } catch(e2) {} return false; }
  }
  /** da chiamare a un tocco (sul telefono il browser non fa suonare prima) */
  sblocca(){ const x = this._ctx(); if (x && this.el) this.el.play && this.qui && !this.muto && this.stato.musica && this.stato.musica.acceso && this.el.play().catch(() => {}); return x ? x.state : 'nessuno'; }
  get attivo(){ return this.qui && !this.muto; }
  async _carica(chiave, url){
    if (this.buffer.has(chiave)) return this.buffer.get(chiave);
    const p = (async () => {
      const r = await fetch(url); if (!r.ok) throw new Error('suono non scaricato (' + r.status + ')');
      const ab = await r.arrayBuffer();
      return await new Promise((ok, no) => this._ctx().decodeAudioData(ab, ok, no));
    })();
    this.buffer.set(chiave, p);
    p.catch(() => this.buffer.delete(chiave));
    return p;
  }
  _rampa(g, v, s = 1.2){ const x = this.ctx; if (!x) return; const t = x.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + s); }
  /* un suono in loop su un canale: se la chiave è la stessa cambia solo il volume, se no dissolve il vecchio nel nuovo */
  async _loop(posto, canale, chiave, url, volume, sintetico){
    const x = this._ctx(); if (!x) return;
    const ora = this.strati[posto];
    if (ora && ora.chiave === chiave){ this._rampa(ora.g, volume, 1.5); return; }
    if (ora){ this._rampa(ora.g, 0, 2.5); const s = ora.src; setTimeout(() => { try { s.stop(); } catch(e) {} }, 2700); delete this.strati[posto]; }
    if (!chiave || volume <= 0 && !url && !sintetico) return;
    const voce = {chiave, g: x.createGain(), src: null};
    voce.g.gain.value = 0; voce.g.connect(this.canali[canale]);
    this.strati[posto] = voce;
    try {
      if (url){
        const b = await this._carica(chiave, url);
        if (this.strati[posto] !== voce) return;
        const s = x.createBufferSource(); s.buffer = b; s.loop = true;
        s.connect(voce.g); s.start(0, Math.random() * Math.max(0, b.duration - 1)); voce.src = s;
      } else if (sintetico){ voce.src = sintetico(x, voce.g); }
      this._rampa(voce.g, volume, 2.5);
    } catch(e) { console.warn('[bard]', chiave, e.message); if (this.strati[posto] === voce) delete this.strati[posto]; }
  }
  _ferma(posto){ const ora = this.strati[posto]; if (!ora) return; this._rampa(ora.g, 0, 2); const s = ora.src; setTimeout(() => { try { s && s.stop(); } catch(e) {} }, 2200); delete this.strati[posto]; }
  async _colpo(chiave, url, volume = 1, canale = 'effetti', dopo = 0, sintetico){
    const x = this._ctx(); if (!x) return;
    try {
      const g = x.createGain(); g.gain.value = volume; g.connect(this.canali[canale]);
      if (url){ const b = await this._carica(chiave, url); const s = x.createBufferSource(); s.buffer = b; s.connect(g); s.start(x.currentTime + dopo); }
      else if (sintetico) sintetico(x, g, x.currentTime + dopo);
    } catch(e) { console.warn('[bard] effetto', chiave, e.message); }
  }

  /* ── lo stato ────────────────────────────────────────────────────────────── */
  applica(stato){ this.stato = Object.assign({}, BARD_PRED, stato || {}); this._aggiorna(); }
  suScena(scena){ this.scena = scena; this._aggiorna(); }
  imposta({qui, muto}){ if (qui != null) this.qui = !!qui; if (muto != null) this.muto = !!muto; this._aggiorna(); }
  _aggiorna(){
    const s = this.stato, on = this.attivo;
    if (on) this._ctx();
    if (!this.ctx) return;
    this._rampa(this.canali.tempo, on && s.tempo && s.tempo.acceso ? s.tempo.volume : 0);
    this._rampa(this.canali.sottofondo, on ? s.volSottofondo : 0);
    this._rampa(this.canali.musica, on ? s.volMusica : 0);
    this._rampa(this.canali.effetti, on ? s.volEffetti : 0, .2);
    /* spento (o non tocca a lui): i loop si fermano dopo la dissolvenza, così non consumano */
    if (!on){ setTimeout(() => { if (!this.attivo){ Object.keys(this.strati).forEach(k => this._ferma(k)); if (this.el) this.el.pause(); } }, 1800); return; }
    this._tempo();
    if (s.sottofondo && s.sottofondo.url) this._loop('sottofondo', 'sottofondo', 'f:' + s.sottofondo.id, s.sottofondo.url, 1); else this._ferma('sottofondo');
    this._musica();
  }
  /* il tempo segue le finestre: quello che si vede si sente */
  _tempo(){
    const sc = this.scena || {}, s = this.stato, reg = s.registrazioni || {};
    const acceso = s.tempo && s.tempo.acceso && sc.acceso !== false;
    const m = sc.meteo || 'sereno', k = sc.intensita == null ? .75 : sc.intensita;
    const pioggia = !acceso ? 0 : m === 'pioggia' ? .25 + .75 * k : m === 'temporale' ? Math.max(.8, k) : 0;
    const neve = !acceso ? 0 : m === 'neve' ? .3 + .5 * k : 0;
    const vento = !acceso ? 0 : (sc.vento == null ? (BARD_VENTO[m] || .15) : sc.vento) * (m === 'nebbia' ? .6 : 1);
    const strato = (id, v, sint) => v > .02 ? this._loop('t-' + id, 'tempo', 't:' + id + (reg[id] ? '' : ':sint'), reg[id] || null, v, reg[id] ? null : sint) : this._ferma('t-' + id);
    strato(m === 'temporale' ? 'temporale' : 'pioggia', pioggia, sintPioggia);
    this._ferma('t-' + (m === 'temporale' ? 'pioggia' : 'temporale'));
    strato('neve', neve, sintVento);
    strato('vento', vento, sintVento);
  }
  /** un lampo (dalle finestre o dal telefono): il tuono arriva dopo, più o meno lontano */
  tuono(ritardo){
    if (!this.attivo || !(this.stato.tempo && this.stato.tempo.acceso)) return;
    const reg = this.stato.registrazioni || {}, quali = ['tuono1', 'tuono2', 'tuono3'].filter(t => reg[t]);
    const t = quali[Math.floor(Math.random() * quali.length)];
    const dopo = ritardo != null ? ritardo : 1 + Math.random() * 1.8;
    this._colpo('t:' + (t || 'tuono:sint'), t ? reg[t] : null, .7 + Math.random() * .3, 'tempo', dopo, t ? null : sintTuono);
  }
  _ogniTanto(){
    if (!this.attivo || !this.ctx) return;
    const sc = this.scena || {}, ora = Date.now(), reg = this.stato.registrazioni || {};
    const vento = sc.vento == null ? (BARD_VENTO[sc.meteo] || 0) : sc.vento;
    if (this.tuoniDaSoli && sc.meteo === 'temporale' && sc.acceso !== false){
      if (!this.prossimoTuono) this.prossimoTuono = ora + 4e3 + Math.random() * 11e3;
      else if (ora > this.prossimoTuono){ this.tuono(); this.prossimoTuono = 0; }
    }
    if (this.stato.tempo && this.stato.tempo.acceso && sc.acceso !== false && vento > .6 && reg.raffica){
      if (!this.prossimaRaffica) this.prossimaRaffica = ora + 15e3 + Math.random() * 30e3;
      else if (ora > this.prossimaRaffica){ this._colpo('t:raffica', reg.raffica, .5 + .4 * Math.random(), 'tempo'); this.prossimaRaffica = 0; }
    }
  }
  /** un effetto a comando */
  effetto({id, url}){ if (this.attivo && url) this._colpo('e:' + id, url, 1, 'effetti'); }

  /* ── la musica: un brano alla volta, lo stream dal deposito ─────────────── */
  _musica(){
    const m = this.stato.musica;
    if (!m || !m.acceso || !m.brani || !m.brani.length){ if (this.el) this.el.pause(); this.branoOra = null; return; }
    const x = this._ctx(); if (!x) return;
    if (!this.el){
      this.el = new Audio(); this.el.crossOrigin = 'anonymous'; this.el.preload = 'auto';
      if (this.idUscita && this.el.setSinkId) this.el.setSinkId(this.idUscita).catch(() => {});
      try { x.createMediaElementSource(this.el).connect(this.canali.musica); } catch(e) { console.warn('[bard] musica', e); }
      this.el.addEventListener('ended', () => this._avanti());
      this.el.addEventListener('error', () => setTimeout(() => this._avanti(), 1500));
    }
    const i = Math.max(0, Math.min(m.brani.length - 1, m.i || 0)), b = m.brani[i];
    if (!this.branoOra || this.branoOra.id !== b.id){
      this.branoOra = {id: b.id, i};
      this.el.src = b.url; this.el.currentTime = 0;
      this.quandoCambia({musica: {i, id: b.id, titolo: b.titolo}});
    }
    if (this.el.paused) this.el.play().catch(e => console.warn('[bard] la musica non parte:', e.message));
  }
  _avanti(){
    const m = this.stato.musica; if (!m || !m.brani || !m.brani.length) return;
    const n = m.brani.length, ora = this.branoOra ? this.branoOra.i : -1;
    m.i = m.casuale && n > 1 ? (ora + 1 + Math.floor(Math.random() * (n - 1))) % n : (ora + 1) % n;
    this.branoOra = null; this._musica();
  }
}

/* ── i suoni fatti qui, se la registrazione non c'è ancora ───────────────── */
function rumoreBianco(x, sec = 3){
  const b = x.createBuffer(1, x.sampleRate * sec, x.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function sintPioggia(x, uscita){
  const s = x.createBufferSource(); s.buffer = rumoreBianco(x); s.loop = true;
  const hp = x.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
  const g = x.createGain(); g.gain.value = .35;
  s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(uscita); s.start(); return s;
}
function sintVento(x, uscita){
  const s = x.createBufferSource(); s.buffer = rumoreBianco(x, 4); s.loop = true;
  const bp = x.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .8;
  const lfo = x.createOscillator(), prof = x.createGain(); lfo.frequency.value = .09; prof.gain.value = 260;
  lfo.connect(prof); prof.connect(bp.frequency); lfo.start();
  const g = x.createGain(); g.gain.value = .5;
  s.connect(bp); bp.connect(g); g.connect(uscita); s.start();
  const stop = s.stop.bind(s); s.stop = t => { stop(t); try { lfo.stop(t); } catch(e) {} };
  return s;
}
function sintTuono(x, uscita, quando){
  const s = x.createBufferSource(); s.buffer = rumoreBianco(x, 5);
  const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const g = x.createGain(); g.gain.setValueAtTime(0, quando); g.gain.linearRampToValueAtTime(1.4, quando + .08);
  g.gain.exponentialRampToValueAtTime(.4, quando + .9); g.gain.exponentialRampToValueAtTime(.001, quando + 4.5);
  s.connect(lp); lp.connect(g); g.connect(uscita); s.start(quando); s.stop(quando + 5);
}

/* ── la libreria di Bard nel deposito della stanza: tutto nel nome del file ──
   bard-<tipo>__<id>__<titolo>.<est>    tipo (accanto ai paesaggi, nella cartella della libreria): tempo | sottofondo | musica | effetto
   per il tempo l'id è quello della registrazione (pioggia, temporale, vento, neve, tuono1-3, raffica) */
const BARD_TIPI = ['tempo', 'sottofondo', 'musica', 'effetto'];
const BARD_TEMPO = {pioggia:'Pioggia', temporale:'Temporale', vento:'Vento', neve:'Neve', tuono1:'Tuono 1', tuono2:'Tuono 2', tuono3:'Tuono 3', raffica:'Raffica'};
const BARD_NOME = /^bard-(tempo|sottofondo|musica|effetto)__([a-z0-9-]+)__([a-z0-9-]*)\.(mp3|m4a|aac|ogg|oga|webm|wav|flac)$/;
function bardSlug(t, max = 60){ return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, ''); }
function bardNomeFile(tipo, id, titolo, est = 'mp3'){ return `bard-${tipo}__${bardSlug(id, 40) || Date.now().toString(36)}__${bardSlug(titolo)}.${est}`; }
function bardDaNome(nome){
  const m = String(nome).match(BARD_NOME); if (!m) return null;
  const [, tipo, id, s] = m;
  const titolo = tipo === 'tempo' && BARD_TEMPO[id] ? BARD_TEMPO[id] : (s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) || 'Senza nome');
  return {tipo, id, titolo, file: nome};
}
const BARD_MIME = {mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', ogg:'audio/ogg', oga:'audio/ogg', webm:'audio/webm', wav:'audio/wav', flac:'audio/flac'};

if (typeof module !== 'undefined') module.exports = {LettoreBard, BARD_PRED, BARD_TEMPO, bardNomeFile, bardDaNome, bardSlug, BARD_MIME};
