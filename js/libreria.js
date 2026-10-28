/* Libreria dei paesaggi creati con l'AI.
   Le immagini stanno nel deposito di DMaster su Supabase (bucket pubblico «dmaster-media»),
   nella cartella finestre/<cartella>/, dove <cartella> e' ricavata dalla chiave della casa
   ma non la rivela (chi vede la cartella non puo' comandare le finestre).
   Niente elenco a parte: tutto quello che serve sta nel nome dei file,
     <id>_<stile>_<nome-del-paesaggio>_<ora>.jpg     es. lq3x9a_pittorico_valle-col-castello_giorno.jpg
   cosi' la libreria si ricostruisce da qualsiasi telefono (e un domani da DMaster). */
const DEPOSITO = 'dmaster-media';
const ORE_IMMAGINI = ['giorno', 'alba', 'tramonto', 'notte'];

async function cartellaDi(casa){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finestre:' + casa));
  return Array.from(new Uint8Array(b)).slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}
let _deposito = null;
function clientDeposito(){
  return _deposito || (_deposito = supabase.createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA, {auth:{persistSession:false}}));
}
function urlPubblico(percorso){ return SUPABASE_URL + '/storage/v1/object/public/' + DEPOSITO + '/' + percorso; }

function slug(testo){
  return String(testo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'paesaggio';
}
function nomeFile(id, stile, nome, ora){ return `${id}_${stile}_${slug(nome)}_${ora}.jpg`; }

/* elenco dei paesaggi, il piu' recente per primo:
   [{id, stile, nome, immagini:{giorno, alba, tramonto, notte}}] */
async function leggiLibreria(casa){
  const cartella = await cartellaDi(casa);
  const {data, error} = await clientDeposito().storage.from(DEPOSITO)
    .list('finestre/' + cartella, {limit:1000, sortBy:{column:'name', order:'desc'}});
  if (error) throw new Error('Lettura della libreria non riuscita: ' + error.message);
  const per = new Map();
  for (const f of data || []){
    const m = f.name.match(/^([a-z0-9]+)_([a-z_]+?)_([a-z0-9-]+)_(giorno|alba|tramonto|notte)\.jpg$/);
    if (!m) continue;
    const [, id, stile, s, ora] = m;
    if (!per.has(id)) per.set(id, {id, stile, nome: s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), immagini:{}});
    per.get(id).immagini[ora] = urlPubblico('finestre/' + cartella + '/' + f.name);
  }
  return [...per.values()].filter(p => p.immagini.giorno).sort((a, b) => a.id < b.id ? 1 : -1);
}

async function caricaImmagine(casa, nome, blob){
  const cartella = await cartellaDi(casa);
  const percorso = 'finestre/' + cartella + '/' + nome;
  const {error} = await clientDeposito().storage.from(DEPOSITO)
    .upload(percorso, blob, {upsert:true, contentType:'image/jpeg', cacheControl:'31536000'});
  if (error) throw new Error('Caricamento dell\'immagine non riuscito: ' + error.message);
  return urlPubblico(percorso);
}

async function togliPaesaggio(casa, p){
  const cartella = await cartellaDi(casa);
  const nomi = Object.values(p.immagini).map(u => 'finestre/' + cartella + '/' + decodeURIComponent(u.split('/').pop()));
  const {error} = await clientDeposito().storage.from(DEPOSITO).remove(nomi);
  if (error) throw new Error('Non sono riuscito a toglierlo: ' + error.message);
}
