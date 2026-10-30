/* ═══════════════════════════════════════════════════════════════════════════
   libreria.js — i paesaggi della casa.
   Stanno nel deposito di DMaster su Supabase (bucket pubblico «dmaster-media»), nella
   cartella finestre/<cartella>/, ricavata dalla chiave della casa ma che non la rivela.
   Non c'è un elenco a parte: tutto sta nel nome dei file, così la libreria si ricostruisce
   da qualsiasi telefono (e un domani da DMaster):

     <id>_<tipo>_<nome>@<parole.chiave>_<parte>.<est>   (Supabase non accetta «~» nei nomi)
       tipo   painterly | inked | classic_oil (dipinti AI) · foto · video (YouTube)
       parte  giorno | alba | tramonto | notte        (.jpg)  le luci del giorno
              profondita                               (.png)  la mappa di profondità
              anim-giorno | anim-notte …               (.mp4)  il breve video in loop
              yt-<id in esadecimale>                   (.jpg)  segnaposto di un video YouTube
   ═══════════════════════════════════════════════════════════════════════════ */
const DEPOSITO = 'dmaster-media';
const ORE_IMMAGINI = ['giorno', 'alba', 'tramonto', 'notte'];
const TIPI = {painterly:'Pittorico', inked:'A china', classic_oil:'Olio classico', foto:'Foto', video:'Video'};

async function cartellaDi(casa){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finestre:' + casa));
  return Array.from(new Uint8Array(b)).slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}
let _deposito = null;
function clientDeposito(){ return _deposito || (_deposito = supabase.createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA, {auth:{persistSession:false}})); }
function urlPubblico(percorso){ return SUPABASE_URL + '/storage/v1/object/public/' + DEPOSITO + '/' + percorso.split('/').map(encodeURIComponent).join('/'); }

function slug(testo, max = 48){
  return String(testo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}
const VUOTE = new Set('il lo la i gli le un uno una di a da in con su per tra fra e o ed che del della dei delle degli al alla ai alle nel nella nei nelle sul sulla sui sulle col coi come piu poco molto anche non si suo sua suoi sue sopra sotto dietro davanti verso fino lontano vicino the of and with a an in on at to from'.split(' '));
/* parole chiave da una descrizione: le parole che contano, senza articoli e preposizioni */
function paroleChiave(...testi){
  const visto = new Set(), fuori = [];
  for (const t of testi) for (const p of slug(t, 400).split('-')){
    if (p.length < 3 || VUOTE.has(p) || /^\d+$/.test(p) || visto.has(p)) continue;
    visto.add(p); fuori.push(p);
  }
  return fuori.slice(0, 10);
}
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ytInHex = id => [...id].map(c => ALFABETO.indexOf(c).toString(16).padStart(2, '0')).join('');
const hexInYt = h => h.match(/../g).map(x => ALFABETO[parseInt(x, 16)]).join('');

function nomeFile(p, parte, est = 'jpg'){
  /* l'inquadratura scelta viaggia come parola chiave speciale «fx37» (37% da sinistra) */
  const parole = (p.parole || []).filter(x => !/^fx\d+$/.test(x));
  if (p.fuoco && p.fuoco.x != null && Math.abs(p.fuoco.x - .5) > .005) parole.push('fx' + Math.round(p.fuoco.x * 100));
  const kw = parole.map(x => slug(x, 20)).filter(Boolean).join('.');
  return `${p.id}_${p.tipo}_${slug(p.nome) || 'paesaggio'}${kw ? '@' + kw : ''}_${parte}.${est}`;
}
const MODELLO_NOME = /^([a-z0-9]+)_(painterly|inked|classic_oil|foto|video)_([a-z0-9-]+)(?:@([a-z0-9.-]+))?_(giorno|alba|tramonto|notte|profondita|anim-(?:giorno|alba|tramonto|notte)|yt-[0-9a-f]{22})\.(jpg|png|mp4)$/;

/* l'elenco dei paesaggi, il più recente per primo:
   [{id, tipo, nome, parole[], immagini:{giorno, alba, tramonto, notte, profondita}, animati:{giorno…}, yt, file[]}] */
async function leggiLibreria(casa){
  const cartella = await cartellaDi(casa);
  const {data, error} = await clientDeposito().storage.from(DEPOSITO)
    .list('finestre/' + cartella, {limit:1000, sortBy:{column:'name', order:'desc'}});
  if (error) throw new Error('Lettura della libreria non riuscita: ' + error.message);
  const per = new Map();
  for (const f of data || []){
    const m = f.name.match(MODELLO_NOME); if (!m) continue;
    const [, id, tipo, s, kw, parte] = m;
    if (!per.has(id)){
      const tutte = kw ? kw.split('.') : [], fx = tutte.find(x => /^fx\d+$/.test(x));
      per.set(id, {id, tipo, nome: s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()),
        parole: tutte.filter(x => x !== fx), fuoco: fx ? {x: Math.min(100, +fx.slice(2)) / 100} : null,
        immagini:{}, animati:{}, yt:null, file:[], creato: parseInt(id, 36) || 0});
    }
    const p = per.get(id), url = urlPubblico('finestre/' + cartella + '/' + f.name);
    p.file.push(f.name);
    /* il video può essere riscritto (cucito dopo: pi/cuci-animazione.py): l'indirizzo porta la sua data, così nessuno tiene il vecchio */
    if (parte.startsWith('anim-')) p.animati[parte.slice(5)] = url + '?v=' + (Date.parse(f.updated_at || f.created_at || '') || 0).toString(36);
    else if (parte.startsWith('yt-')) p.yt = hexInYt(parte.slice(3));
    else p.immagini[parte] = url;
  }
  return [...per.values()].filter(p => p.immagini.giorno || p.yt).sort((a, b) => b.creato - a.creato);
}

/* cerca: tutte le parole devono comparire nel nome, nelle parole chiave o nel tipo (senza accenti) */
function filtraLibreria(elenco, testo, tipo){
  const parole = slug(testo, 200).split('-').filter(Boolean);
  return elenco.filter(p => {
    if (tipo === 'dipinti' && !['painterly','inked','classic_oil'].includes(p.tipo)) return false;
    if (tipo === 'foto' && p.tipo !== 'foto') return false;
    if (tipo === 'video' && p.tipo !== 'video') return false;
    if (tipo === 'animati' && !Object.keys(p.animati).length) return false;
    if (!parole.length) return true;
    const dove = slug([p.nome, ...(p.parole || []), TIPI[p.tipo] || ''].join(' '), 600);
    return parole.every(w => dove.includes(w));
  });
}

async function carica(casa, p, parte, blob, est){
  const cartella = await cartellaDi(casa);
  const tipo = est === 'png' ? 'image/png' : est === 'mp4' ? 'video/mp4' : 'image/jpeg';
  const nome = nomeFile(p, parte, est);
  const {error} = await clientDeposito().storage.from(DEPOSITO)
    .upload('finestre/' + cartella + '/' + nome, blob, {upsert:true, contentType:tipo, cacheControl:'31536000'});
  if (error) throw new Error('Caricamento non riuscito: ' + error.message);
  (p.file || (p.file = [])).push(nome);
  return urlPubblico('finestre/' + cartella + '/' + nome);
}
const caricaLuce = (casa, p, ora, blob) => carica(casa, p, ora, blob, 'jpg');
const caricaProfondita = (casa, p, blob) => carica(casa, p, 'profondita', blob, 'png');
const caricaAnimazione = (casa, p, ora, blob) => carica(casa, p, 'anim-' + ora, blob, 'mp4');

/* un video di YouTube nella libreria: un segnaposto minuscolo col nome giusto */
async function salvaVideoYT(casa, {id, nome, parole}){
  const p = {id: Date.now().toString(36), tipo:'video', nome, parole: parole || paroleChiave(nome), file:[]};
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .5));
  await carica(casa, p, 'yt-' + ytInHex(id), blob, 'jpg');
  p.yt = id; p.immagini = {}; p.animati = {};
  return p;
}

/* rinomina (nome e parole chiave): sposta tutti i file del paesaggio */
async function rinominaPaesaggio(casa, p, nome, parole, fuoco = p.fuoco){
  const cartella = await cartellaDi(casa), dep = clientDeposito().storage.from(DEPOSITO);
  const nuovo = Object.assign({}, p, {nome, parole, fuoco});
  const nuoviFile = [];
  for (const f of p.file){
    const m = f.match(MODELLO_NOME); if (!m) continue;
    const dest = nomeFile(nuovo, m[5], m[6]);
    nuoviFile.push(dest);
    if (dest === f) continue;
    const {error} = await dep.move('finestre/' + cartella + '/' + f, 'finestre/' + cartella + '/' + dest);
    if (error) throw new Error('Non sono riuscito a rinominarlo: ' + error.message);
  }
  /* aggiorna il paesaggio in memoria: nomi dei file e indirizzi */
  Object.assign(p, {nome, parole, fuoco, file: nuoviFile});
  const url = n => urlPubblico('finestre/' + cartella + '/' + n);
  p.immagini = {}; p.animati = {};
  for (const n of nuoviFile){ const m = n.match(MODELLO_NOME); if (!m) continue; const parte = m[5];
    if (parte.startsWith('anim-')) p.animati[parte.slice(5)] = url(n); else if (!parte.startsWith('yt-')) p.immagini[parte] = url(n); }
  return p;
}

async function togliPaesaggio(casa, p){
  const cartella = await cartellaDi(casa);
  const {error} = await clientDeposito().storage.from(DEPOSITO).remove(p.file.map(f => 'finestre/' + cartella + '/' + f));
  if (error) throw new Error('Non sono riuscito a toglierlo: ' + error.message);
}

/* la scena che serve alle finestre per mostrare un paesaggio */
function scenaDi(p){
  if (p.yt) return {yt:p.yt, t:0, immagini:null, animati:null, paesaggio:p.id, fuoco:null};
  return {yt:'', immagini:Object.assign({}, p.immagini), animati:Object.keys(p.animati).length ? Object.assign({}, p.animati) : null, paesaggio:p.id, fuoco:p.fuoco || null};
}
