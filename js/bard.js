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
  musica:null, volMusica:.5, volEffetti:.8, vita:{acceso:true, volume:.55}, suoniVita:{}};

/* ═══ 13/11 · I SUONI DEL PAESAGGIO (Maurizio: «abbiamo sviluppato pesantemente Illusionist, mentre Bard è primordiale»)
   Come la vita del paesaggio di Illusionist (js/vita.js), ma da sentire: partono da soli e seguono quello che si vede.
   · L'ORA: uccelli all'alba e di giorno, grilli al tramonto e di notte, la civetta e il lupo di notte;
   · IL TEMPO: con pioggia e temporale gli uccelli tacciono, con la neve resta quasi solo l'acqua; con la nebbia meno;
   · IL PAESAGGIO: le parole del suo nome (…@castello.valle.fiume.colline.boschi) dicono se c'è un fiume, il mare, una
     città, un'abbazia, un bosco; il fiume si sente solo dove c'è, le campane solo dove c'è un campanile;
   · due modi: «letto» = un tappeto in loop (22 s senza giunte, come i sottofondi); «colpo» = un verso ogni tanto, a
     intervalli casuali, ogni volta un po' a destra o a sinistra e un po' più acuto o più grave (così non si ripete uguale).
   Le registrazioni le fa l'AI una volta sola (ElevenLabs, «Prepara i suoni» nell'app): file «bard-vita__<id>__…» nella stanza.
   ogni: [minimo, massimo] secondi fra un colpo e l'altro. */
const BARD_VITA = [
  {id:'uccelli-alba', nome:'Uccelli all\'alba', med:'uccello', modo:'letto', ore:['alba'], vol:.55,
   prompt:'Dawn chorus in a quiet European countryside: many songbirds singing together, blackbirds and robins, no wind, no people, no music'},
  {id:'uccelli-giorno', nome:'Uccelli di giorno', med:'uccello', modo:'letto', ore:['giorno'], vol:.32,
   prompt:'Sparse songbirds in a calm sunny meadow, occasional chirps and short songs far apart, gentle, no wind, no people, no music'},
  {id:'cuculo', nome:'Cuculo', med:'uccello', modo:'colpo', ore:['alba', 'giorno'], vol:.35, ogni:[90, 260], parole:/bosc|forest|collin|vall|selv|querc/,
   prompt:'A single distant cuckoo calling four times in the woods, nothing else'},
  {id:'rapace', nome:'Rapace', med:'uccello', modo:'colpo', ore:['giorno'], vol:.32, ogni:[80, 240], parole:/vall|mont|castell|collin|rup|picch|torr/,
   prompt:'A single distant hawk cry echoing over a wide valley, nothing else'},
  {id:'grilli', nome:'Grilli', med:'grillo', modo:'letto', ore:['tramonto', 'notte'], vol:.42,
   prompt:'Crickets chirping steadily on a calm warm night in the countryside, no other animals, no wind, no music'},
  {id:'civetta', nome:'Civetta', med:'civetta', modo:'colpo', ore:['notte'], vol:.4, ogni:[45, 140],
   prompt:'A tawny owl hooting twice in a distant forest at night, nothing else'},
  {id:'lupo', nome:'Lupo', med:'ringhio', modo:'colpo', ore:['notte'], vol:.28, ogni:[300, 900], parole:/bosc|forest|mont|selv|nev|pin/,
   prompt:'A lone wolf howling very far away in the mountains at night, long echo, nothing else'},
  {id:'rane', nome:'Rane', med:'onda', modo:'letto', ore:['tramonto', 'notte'], vol:.28, parole:/fium|lag|palud|stagn|torrent|canal|ruscell/,
   prompt:'Frogs croaking softly near a quiet river bank at night, steady, no music'},
  {id:'fiume', nome:'Fiume', med:'onda', modo:'letto', vol:.34, parole:/fium|torrent|ruscell|cascat/, ancheNeve:true,
   prompt:'A gentle river flowing over stones, steady water heard from a short distance, no birds, no wind, no music'},
  {id:'mare', nome:'Mare', med:'onda', modo:'letto', vol:.4, parole:/mare|cost|port|spiagg|scogl|golf|baia|isol/, ancheNeve:true,
   prompt:'Calm sea waves washing on a pebble shore heard from a distance, steady, no gulls, no music'},
  {id:'gabbiani', nome:'Gabbiani', med:'uccello', modo:'colpo', ore:['alba', 'giorno', 'tramonto'], vol:.3, ogni:[35, 110], parole:/mare|port|cost|spiagg|scogl|baia/,
   prompt:'A few seagulls calling in the distance over the sea, nothing else'},
  {id:'fronde', nome:'Fronde al vento', med:'albero', modo:'letto', vol:.3, parole:/bosc|forest|alber|selv|querc|pin|cipress|oliv|faggi|castagn/, colVento:true,
   prompt:'Wind gently rustling the leaves of a large forest, soft and continuous, no birds, no music'},
  {id:'citta', nome:'Città lontana', med:'mercato', modo:'letto', ore:['giorno'], vol:.22, parole:/citt|borg|villagg|mercat|torri|paese|porto/,
   prompt:'Distant medieval town heard from far away outside the walls: faint voices, a blacksmith hammering, cart wheels, very soft and distant, no music'},
  {id:'campane', nome:'Campane', med:'campana', modo:'colpo', ore:['alba', 'giorno', 'tramonto'], vol:.42, ogni:[240, 720], parole:/abbazi|monaster|chies|campanil|citt|borg|villagg|cattedral|convent|pieve/, ancheNeve:true,
   prompt:'A distant medieval church bell tolling slowly five times across a valley, natural reverb, nothing else'},
  {id:'cani', nome:'Cani lontani', med:'ringhio', modo:'colpo', ore:['tramonto', 'notte'], vol:.25, ogni:[100, 320], parole:/citt|borg|villagg|fattori|campagn|cascin|paese/,
   prompt:'A dog barking a few times far away in a village at night, nothing else'},
  {id:'pecore', nome:'Pecore', med:'campana', modo:'colpo', ore:['giorno'], vol:.28, ogni:[70, 220], parole:/campagn|pascol|collin|prat|fattori|cascin|coltiv/,
   prompt:'Sheep bleating and a cowbell far away in hilly pastures, nothing else'},
  /* quando nelle finestre passa lo stormo (l'effetto di Illusionist) */
  {id:'stormo', nome:'Stormo', med:'stormo', modo:'effetto', vol:.55,
   prompt:'A flock of small birds flying past overhead, many wings flapping and chirping, passing by and fading away'},
];
const BARD_VITA_ID = Object.fromEntries(BARD_VITA.map(v => [v.id, v]));
/* le parole di un paesaggio: dal nome del file della sua immagine (…_painterly_valle-col-castello@castello.valle.fiume_giorno.jpg) */
function bardParole(sc){
  const im = sc && sc.immagini; if (!im) return '';
  const u = im.giorno || im['est-giorno'] || Object.values(im).find(x => typeof x === 'string') || '';
  let n = ''; try { n = decodeURIComponent(String(u).split('?')[0].split('/').pop()); } catch(e) { n = String(u); }
  return n.toLowerCase().replace(/^[a-z0-9]+_(?:painterly|inked|classic_oil|foto|video)_/, '').replace(/_[a-z-]+\.(?:jpg|png)$/, '').replace(/[^a-z]+/g, ' ');
}
/* quanto si sente ogni suono del paesaggio adesso (0 = niente) */
function bardVitaAdesso(sc, ora){
  const out = {}; if (!sc || sc.acceso === false || sc.yt) return out;
  const m = sc.meteo || 'sereno', k = sc.intensita == null ? .75 : sc.intensita, parole = bardParole(sc);
  const vento = sc.vento == null ? (BARD_VENTO[m] || .15) : sc.vento;
  for (const v of BARD_VITA){
    if (v.modo === 'effetto') continue;
    if (v.ore && !v.ore.includes(ora)) continue;
    if (v.parole && !v.parole.test(parole)) continue;
    let f = 1;
    const animale = !['fiume', 'mare', 'fronde', 'citta', 'campane'].includes(v.id);
    if (m === 'pioggia') f = animale ? (v.id === 'rane' ? .8 : 0) : .7;
    else if (m === 'temporale') f = animale ? 0 : .5;
    else if (m === 'neve') f = v.ancheNeve ? .6 : 0;
    else if (m === 'nebbia') f = animale ? .6 * (1 - .4 * k) : .8;
    else if (m === 'nuvoloso') f = animale ? .8 : 1;
    if (v.colVento) f *= Math.min(1.6, .35 + 1.3 * vento);
    if (f > .02) out[v.id] = v.vol * f;
  }
  return out;
}
/* ⚠ 4/11 · I LAMPI DEL TEMPORALE (Maurizio: «devono essere più casuali, non ogni X secondi sempre»).
   Un temporale vero ha fasi: minuti agitati con lampi ravvicinati (a volte due o tre di fila), poi pause
   lunghe; lampi lontani e deboli col tuono tardi e basso, lampi vicini forti col tuono quasi subito.
   La sequenza è pseudo-casuale ma dipende solo dall'orologio: TV, finestrelle e telefono calcolano gli
   stessi lampi negli stessi istanti, senza parlarsi (così il tuono suona una volta sola, giusto). */
function bardRng(seme){ let s = seme >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const BARD_FINESTRA_LAMPI = 600000;   /* la sequenza si calcola a blocchi di 10 minuti */
const _bardLampi = new Map();
function bardLampi(blocco){
  if (_bardLampi.has(blocco)) return _bardLampi.get(blocco);
  const r = bardRng(blocco * 2654435761 + 97), inizio = blocco * BARD_FINESTRA_LAMPI, fine = inizio + BARD_FINESTRA_LAMPI, ev = [];
  let t = inizio + r() * 6000, fase = 0, attivita = r();
  while (t < fine){
    if (t > fase){ attivita = Math.pow(r(), .8); fase = t + 50000 + r() * 130000; }      /* ogni 1-3 minuti il temporale cambia umore */
    const media = 45000 - 37000 * attivita;                                                  /* da un lampo ogni 45 s a uno ogni 8 s, in media */
    t += Math.max(1500, -Math.log(1 - r()) * media);                                         /* intervalli esponenziali: niente ritmo */
    if (t >= fine) break;
    const lontano = r() < .35, forza = lontano ? .25 + r() * .3 : .7 + r() * .5;
    const lampo = {t: Math.round(t), forza, x: .08 + r() * .84, impulsi: 1 + Math.floor(r() * (lontano ? 2 : 4)), seme: Math.floor(r() * 1e9),
      tuono: lontano ? 4 + r() * 6 : .4 + r() * 2.6, volTuono: lontano ? .3 + r() * .25 : .7 + r() * .3};
    ev.push(lampo);
    if (!lontano && r() < .3){ const t2 = t + 400 + r() * 2200; ev.push(Object.assign({}, lampo, {t: Math.round(t2), forza: forza * (.6 + r() * .5), x: Math.min(.92, Math.max(.08, lampo.x + (r() - .5) * .3)), seme: Math.floor(r() * 1e9), tuono: lampo.tuono + .3, volTuono: lampo.volTuono * .8})); t = t2; }
  }
  if (_bardLampi.size > 6) _bardLampi.delete(_bardLampi.keys().next().value);
  _bardLampi.set(blocco, ev);
  return ev;
}
/** i lampi fra `da` e `a` (ms dell'orologio), con l'intensità del temporale (0..1): meno intenso = se ne saltano un po' */
function bardLampiFra(da, a, intensita = .75){
  const out = [];
  for (let b = Math.floor(da / BARD_FINESTRA_LAMPI); b <= Math.floor(a / BARD_FINESTRA_LAMPI); b++)
    for (const l of bardLampi(b)) if (l.t > da && l.t <= a && (l.seme % 1000) / 1000 < .45 + .55 * intensita) out.push(l);
  return out;
}

/* ⚠ 4/11 · LE REGISTRAZIONI DEL TEMPO, PER TUTTI. Le registrazioni AI di DMaster (ElevenLabs, 22 s in loop per i
   fondi) stanno anche nel deposito pubblico delle finestre: le usa chiunque, anche senza la stanza privata
   (le registrazioni della stanza, se ci sono, vengono prima). Il deposito pubblico accetta solo immagini e video:
   i file sono mp3 caricati come «video/mp4», ma si leggono con decodeAudioData, che guarda il contenuto. */
const BARD_PUBBLICO = 'https://olcfvghjfzyazogfsjbk.supabase.co/storage/v1/object/public/dmaster-media/finestre/suoni/tempo-';
const bardRegistrazione = (reg, id) => (reg && reg[id]) || (BARD_TEMPO_IDS.includes(id) ? BARD_PUBBLICO + id + '.mp3' : null);
const BARD_TEMPO_IDS = ['pioggia', 'temporale', 'vento', 'neve', 'tuono1', 'tuono2', 'tuono3', 'raffica'];
/* le registrazioni hanno volumi molto diversi (il temporale è 15 dB più forte della pioggia): si pareggiano qui */
const BARD_GUADAGNO = {pioggia:1.4, temporale:.3, vento:.5, neve:1.4, tuono1:.55, tuono2:.55, tuono3:.8, raffica:1.3};

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
    this.sintetico = false;   /* true: solo i suoni fatti qui (per le prove) */
    setInterval(() => this._ogniTanto(), 1000);
  }
  /* ── l'audio ─────────────────────────────────────────────────────────────── */
  _ctx(){
    if (!this.ctx){
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      const x = this.ctx = new C();
      this.master = x.createGain(); this.master.connect(x.destination);
      this.canali = {};
      for (const k of ['tempo', 'sottofondo', 'musica', 'effetti', 'vita']){ const g = x.createGain(); g.gain.value = 0; g.connect(this.master); this.canali[k] = g; }
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
  async _loop(posto, canale, chiave, url, volume, sintetico, sintetico0 = null){
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
    } catch(e) {
      console.warn('[bard]', chiave, e.message);
      /* registrazione non scaricata (rete?): il suono fatto qui, intanto */
      if (this.strati[posto] === voce && url && sintetico0){ try { voce.src = sintetico0(x, voce.g); voce.chiave = chiave + ':sint'; this._rampa(voce.g, volume, 2.5); return; } catch(e2) {} }
      if (this.strati[posto] === voce) delete this.strati[posto];
    }
  }
  _ferma(posto){ const ora = this.strati[posto]; if (!ora) return; this._rampa(ora.g, 0, 2); const s = ora.src; setTimeout(() => { try { s && s.stop(); } catch(e) {} }, 2200); delete this.strati[posto]; }
  async _colpo(chiave, url, volume = 1, canale = 'effetti', dopo = 0, sintetico, pan = 0, rate = 1){
    const x = this._ctx(); if (!x) return;
    try {
      const g = x.createGain(); g.gain.value = volume;
      if (pan && x.createStereoPanner){ const p = x.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.canali[canale]); } else g.connect(this.canali[canale]);
      if (url){ const b = await this._carica(chiave, url); const s = x.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; s.connect(g); s.start(x.currentTime + dopo); }
      else if (sintetico) sintetico(x, g, x.currentTime + dopo);
    } catch(e) { console.warn('[bard] effetto', chiave, e.message); }
  }

  /* ── lo stato ────────────────────────────────────────────────────────────── */
  applica(stato){ this.stato = Object.assign({}, BARD_PRED, stato || {}); this._aggiorna(); }
  suScena(scena){ this.scena = scena; this.vitaAdesso = null; this._aggiorna(); }
  imposta({qui, muto}){ if (qui != null) this.qui = !!qui; if (muto != null) this.muto = !!muto; this._aggiorna(); }
  _aggiorna(){
    const s = this.stato, on = this.attivo;
    if (on) this._ctx();
    if (!this.ctx) return;
    this._rampa(this.canali.tempo, on && s.tempo && s.tempo.acceso ? s.tempo.volume : 0);
    this._rampa(this.canali.sottofondo, on ? s.volSottofondo : 0);
    this._rampa(this.canali.musica, on ? s.volMusica : 0);
    this._rampa(this.canali.effetti, on ? s.volEffetti : 0, .2);
    this._rampa(this.canali.vita, on && s.vita && s.vita.acceso ? (s.vita.volume == null ? .55 : s.vita.volume) : 0);
    /* spento (o non tocca a lui): i loop si fermano dopo la dissolvenza, così non consumano */
    if (!on){ setTimeout(() => { if (!this.attivo){ Object.keys(this.strati).forEach(k => this._ferma(k)); if (this.el) this.el.pause(); } }, 1800); return; }
    this._tempo();
    this._vita();
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
    /* il vento cresce piano: «Calmo» quasi non si sente, «Forte» si sente bene (4/11: prima era lineare e troppo alto) */
    /* (col temporale la registrazione ha già le sue raffiche: il vento a parte si tiene più basso) */
    const vento = !acceso ? 0 : Math.pow((sc.vento == null ? (BARD_VENTO[m] || .15) : sc.vento) * (m === 'nebbia' ? .6 : 1), 1.7) * .7 * (m === 'temporale' ? .5 : 1);
    const strato = (id, v, sint) => {
      const url = this.sintetico ? null : bardRegistrazione(reg, id);
      return v > .02 ? this._loop('t-' + id, 'tempo', 't:' + id + (url ? '' : ':sint'), url, url ? v * (BARD_GUADAGNO[id] || 1) : v, url ? null : sint, sint) : this._ferma('t-' + id);
    };
    strato(m === 'temporale' ? 'temporale' : 'pioggia', pioggia, sintPioggia);
    this._ferma('t-' + (m === 'temporale' ? 'pioggia' : 'temporale'));
    strato('neve', neve, sintVento);
    strato('vento', vento, sintVento);
    /* col temporale i tuoni si scaricano prima, così arrivano in tempo dopo il lampo */
    if (acceso && m === 'temporale' && !this.sintetico && this.ctx) for (const t of ['tuono1', 'tuono2', 'tuono3']){ const u = bardRegistrazione(reg, t); if (u) this._carica('t:' + t, u).catch(() => {}); }
  }
  /** un lampo (dalle finestre o dal telefono): il tuono arriva dopo, più o meno lontano */
  tuono(ritardo, volume){
    if (!this.attivo || !(this.stato.tempo && this.stato.tempo.acceso)) return;
    const reg = this.stato.registrazioni || {};
    const dopo = ritardo != null ? ritardo : 1 + Math.random() * 1.8;
    /* lontano: più basso e più cupo (i bassi arrivano, gli schiocchi no); vicino: lo schiocco o il rombo */
    const vol = volume != null ? volume : .7 + Math.random() * .3;
    const t = vol < .6 ? 'tuono3' : (dopo < 1.2 && Math.random() < .6 ? 'tuono1' : 'tuono2');
    const url = this.sintetico ? null : bardRegistrazione(reg, t);
    this._colpo('t:' + (url ? t : 'tuono:sint'), url, url ? vol * BARD_GUADAGNO[t] : vol, 'tempo', dopo, url ? null : (x, g, q) => sintTuono(x, g, q, vol < .6));
  }
  /** 8/11 · effetto «raffica di vento» dal telefono: la registrazione se c'è (se no niente: il soffio sintetico basta) */
  raffica(){
    if (!this.attivo || !(this.stato.tempo && this.stato.tempo.acceso)) return;
    const url = this.sintetico ? null : bardRegistrazione(this.stato.registrazioni || {}, 'raffica');
    if (url) this._colpo('t:raffica', url, .8 * BARD_GUADAGNO.raffica, 'tempo');
  }
  /* ── i suoni del paesaggio ───────────────────────────────────────────────── */
  _oraScena(){ const o = (this.scena || {}).ora; return !o || o === 'vera' ? (typeof oraVera === 'function' ? oraVera() : 'giorno') : o; }
  _vita(){
    const s = this.stato, reg = s.suoniVita || {}, acceso = s.vita && s.vita.acceso;
    const ora = this._oraScena();
    this.vitaAdesso = acceso ? bardVitaAdesso(this.scena, ora) : {};
    for (const v of BARD_VITA){
      if (v.modo !== 'letto') continue;
      const vol = this.vitaAdesso[v.id], url = reg[v.id];
      if (vol && url) this._loop('v-' + v.id, 'vita', 'v:' + v.id, url, vol); else this._ferma('v-' + v.id);
    }
    this.vitaFirma = JSON.stringify(this.vitaAdesso) + ora;
  }
  /** un verso del paesaggio, adesso (anche per lo stormo che passa nelle finestre) */
  colpoVita(id, volume){
    const v = BARD_VITA_ID[id], url = (this.stato.suoniVita || {})[id];
    if (!this.attivo || !v || !url || !(this.stato.vita && this.stato.vita.acceso)) return false;
    this._colpo('v:' + id, url, volume != null ? volume : v.vol, 'vita', 0, null, (Math.random() * 2 - 1) * .6, .93 + Math.random() * .14);
    return true;
  }
  _ogniTanto(){
    if (!this.attivo || !this.ctx) return;
    /* i suoni del paesaggio: l'ora vera cambia da sola; i colpi arrivano a intervalli casuali */
    { const ora = this._oraScena();
      if (!this.vitaAdesso || this.vitaOra !== ora){ this.vitaOra = ora; this._vita(); }
      const adesso = Date.now(), prossimi = this.prossimiColpi || (this.prossimiColpi = {});
      for (const v of BARD_VITA){
        if (v.modo !== 'colpo') continue;
        const vol = this.vitaAdesso[v.id];
        if (!vol || !(this.stato.suoniVita || {})[v.id]){ delete prossimi[v.id]; continue; }
        const [a, b] = v.ogni || [60, 180];
        if (!prossimi[v.id]){ prossimi[v.id] = adesso + (a * .3 + Math.random() * (b - a * .3)) * 1000; continue; }
        if (adesso > prossimi[v.id]){ this.colpoVita(v.id, vol * (.7 + .5 * Math.random())); prossimi[v.id] = adesso + (a + Math.random() * (b - a)) * 1000; }
      }
    }
    const sc = this.scena || {}, ora = Date.now(), reg = this.stato.registrazioni || {};
    const vento = sc.vento == null ? (BARD_VENTO[sc.meteo] || 0) : sc.vento;
    /* sul telefono (senza finestre) i tuoni seguono gli stessi lampi delle finestre */
    if (this.tuoniDaSoli && sc.meteo === 'temporale' && sc.acceso !== false){
      const da = this.ultimoControllo || ora; this.ultimoControllo = ora;
      for (const l of bardLampiFra(da, ora, sc.intensita == null ? .75 : sc.intensita)) this.tuono(l.tuono, l.volTuono);
    } else this.ultimoControllo = 0;
    const raffica = this.sintetico ? null : bardRegistrazione(reg, 'raffica');
    if (this.stato.tempo && this.stato.tempo.acceso && sc.acceso !== false && vento > .6 && raffica){
      if (!this.prossimaRaffica) this.prossimaRaffica = ora + 15e3 + Math.random() * 40e3;
      else if (ora > this.prossimaRaffica){ this._colpo('t:raffica', raffica, (.4 + .4 * Math.random()) * BARD_GUADAGNO.raffica, 'tempo'); this.prossimaRaffica = 0; }
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
/* ⚠ 4/11: la pioggia fatta qui era rumore bianco filtrato: un soffio continuo che si scambiava per vento
   (Maurizio: «il rumore del vento anche al minimo è troppo forte»). Ora: tante gocce che cadono a caso, ognuna
   un piccolo «tic» smorzato con la sua nota, sopra un fruscio basso e morbido; e molto più piano */
function pioggiaGocce(x, sec = 8){
  const n = x.sampleRate * sec, b = x.createBuffer(2, n, x.sampleRate);
  for (let ch = 0; ch < 2; ch++){
    const d = b.getChannelData(ch);
    let v = 0, w = 0;
    for (let i = 0; i < n; i++){ v = v * .985 + (Math.random() * 2 - 1) * .02; w = w * .6 + v * .4; d[i] = (v - w) * 1.6; }   /* fruscio rosa-marrone, senza i bassi */
    const gocce = Math.round(sec * 900);
    for (let k = 0; k < gocce; k++){
      const i0 = Math.floor(Math.random() * n), amp = Math.pow(Math.random(), 3) * .5, f = 1500 + Math.random() * 5000, dec = .0006 + Math.random() * .0025;
      const len = Math.floor(dec * 5 * x.sampleRate), om = 2 * Math.PI * f / x.sampleRate;
      for (let j = 0; j < len; j++){ const ii = (i0 + j) % n; d[ii] += Math.sin(om * j) * amp * Math.exp(-j / (dec * x.sampleRate)); }
    }
    for (let i = 0; i < 2000; i++){ const k = i / 2000, j = n - 2000 + i; d[j] = d[j] * (1 - k) + d[i] * k; }
  }
  return b;
}
function sintPioggia(x, uscita){
  const s = x.createBufferSource(); s.buffer = pioggiaGocce(x); s.loop = true;
  const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
  const g = x.createGain(); g.gain.value = .22;
  s.connect(lp); lp.connect(g); g.connect(uscita); s.start(0, Math.random() * 7); return s;
}
/* rumore «marrone» (ogni campione parte dal precedente): il soffio cupo dell'aria, non il fruscio di una radio */
function rumoreMarrone(x, sec = 6){
  const b = x.createBuffer(1, x.sampleRate * sec, x.sampleRate), d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < d.length; i++){ v = (v + (Math.random() * 2 - 1) * .02) * .998; d[i] = v * 3.2; }
  /* il giro si chiude senza scatto: le ultime 2000 si sfumano nelle prime */
  for (let i = 0; i < 2000; i++){ const k = i / 2000, j = d.length - 2000 + i; d[j] = d[j] * (1 - k) + d[i] * k; }
  return b;
}
/* ⚠ 4/11 · IL VENTO (Maurizio: «anche al minimo è troppo forte e comunque poco realistico»). Prima: rumore bianco
   filtrato con un'onda lenta sempre uguale — un fruscio. Ora: un soffio cupo (rumore marrone) che sale e scende a
   raffiche irregolari, e solo nelle raffiche più forti un ululato leggero che cambia nota; molto più basso. */
function sintVento(x, uscita){
  const s = x.createBufferSource(); s.buffer = rumoreMarrone(x); s.loop = true;
  const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = .5;
  const corpo = x.createGain(); corpo.gain.value = .25;
  const bp = x.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 7;
  const ulu = x.createGain(); ulu.gain.value = 0;
  s.connect(lp); lp.connect(corpo); corpo.connect(uscita);
  s.connect(bp); bp.connect(ulu); ulu.connect(uscita);
  s.start(0, Math.random() * 5);
  /* le raffiche: ogni 1,5-5 s un nuovo «quanto soffia», raggiunto piano; ogni tanto una raffica vera */
  let raffica = .4;
  const giro = () => {
    const t = x.currentTime, r = Math.random();
    raffica = Math.max(.12, Math.min(1, raffica * .55 + (r < .12 ? .85 + Math.random() * .15 : Math.random() * .6) * .45 + .1));
    const dur = 1.5 + Math.random() * 3.5, tc = dur / 3;
    corpo.gain.setTargetAtTime(.1 + .3 * raffica, t, tc);
    lp.frequency.setTargetAtTime(220 + 420 * raffica, t, tc);
    ulu.gain.setTargetAtTime(raffica > .7 ? (raffica - .7) * .35 : 0, t, tc);
    bp.frequency.setTargetAtTime(380 + 520 * raffica + Math.random() * 120, t, tc * 1.4);
    voce.prossimo = setTimeout(giro, dur * 1000);
  };
  const voce = {prossimo: 0, stop(t){ clearTimeout(voce.prossimo); try { s.stop(t); } catch(e) {} }};
  giro();
  return voce;
}
function sintTuono(x, uscita, quando, lontano = false){
  const s = x.createBufferSource(); s.buffer = rumoreBianco(x, 7);
  const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lontano ? 90 : 170;
  const g = x.createGain(), dur = lontano ? 6.5 : 4.5;
  /* vicino: lo schiocco e poi il rotolare; lontano: solo un brontolio che sale piano */
  g.gain.setValueAtTime(0, quando); g.gain.linearRampToValueAtTime(lontano ? .7 : 1.4, quando + (lontano ? .9 : .08));
  g.gain.exponentialRampToValueAtTime(lontano ? .35 : .4, quando + (lontano ? 2.2 : .9)); g.gain.exponentialRampToValueAtTime(.001, quando + dur);
  s.connect(lp); lp.connect(g); g.connect(uscita); s.start(quando); s.stop(quando + dur + .5);
}

/* ── la libreria di Bard nel deposito della stanza: tutto nel nome del file ──
   bard-<tipo>__<id>__<titolo>.<est>    tipo (accanto ai paesaggi, nella cartella della libreria): tempo | sottofondo | musica | effetto
   per il tempo l'id è quello della registrazione (pioggia, temporale, vento, neve, tuono1-3, raffica) */
const BARD_TIPI = ['tempo', 'sottofondo', 'musica', 'effetto', 'vita'];
const BARD_TEMPO = {pioggia:'Pioggia', temporale:'Temporale', vento:'Vento', neve:'Neve', tuono1:'Tuono 1', tuono2:'Tuono 2', tuono3:'Tuono 3', raffica:'Raffica'};
const BARD_NOME = /^bard-(tempo|sottofondo|musica|effetto|vita)__([a-z0-9-]+)__([a-z0-9-]*)\.(mp3|m4a|aac|ogg|oga|webm|wav|flac)$/;
function bardSlug(t, max = 60){ return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, ''); }
function bardNomeFile(tipo, id, titolo, est = 'mp3'){ return `bard-${tipo}__${bardSlug(id, 40) || Date.now().toString(36)}__${bardSlug(titolo)}.${est}`; }
function bardDaNome(nome){
  const m = String(nome).match(BARD_NOME); if (!m) return null;
  const [, tipo, id, s] = m;
  const titolo = tipo === 'tempo' && BARD_TEMPO[id] ? BARD_TEMPO[id] : tipo === 'vita' && BARD_VITA_ID[id] ? BARD_VITA_ID[id].nome : (s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) || 'Senza nome');
  return {tipo, id, titolo, file: nome};
}
const BARD_MIME = {mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', ogg:'audio/ogg', oga:'audio/ogg', webm:'audio/webm', wav:'audio/wav', flac:'audio/flac'};

if (typeof module !== 'undefined') module.exports = {LettoreBard, BARD_PRED, BARD_TEMPO, BARD_VITA, bardVitaAdesso, bardParole, bardNomeFile, bardDaNome, bardSlug, BARD_MIME};
