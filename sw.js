/* sw.js — la memoria delle pagine per quando la rete cade (1/11/2026).
   Se il Wi-Fi cade e una pagina si ricarica (un riavvio del Raspberry o del G10, «Ricarica finestre», la ricarica
   automatica ogni 20 giorni), le finestre e il TV devono ripartire lo stesso, con l'ultimo paesaggio e l'ultima veduta.
   Regola: sempre prima la rete (così ogni modifica arriva subito); se la rete non risponde, la copia tenuta qui.
     · pagine e programmi (html, js, css, font): copia per indirizzo;
     · immagini e suoni del deposito (Supabase Storage, indirizzi firmati): copia per percorso, senza il gettone
       (il gettone cambia, il file no); al massimo 400 voci, si buttano le più vecchie;
     · le richieste a pezzi (video e musica in streaming, «Range») passano e basta.
   Niente comandi né accessi: il canale e l'account vanno sempre in rete. */
const VERSIONE = 'atm-2';
const PAGINE = VERSIONE + '-pagine', DEPOSITO = VERSIONE + '-deposito', MAX_DEPOSITO = 400;

/* pagina e programmi delle finestre e del TV: si tengono subito, così anche il primo riavvio senza rete riparte */
const SUBITO = ['finestra/', 'finestra/index.html', 'js/supabase.js', 'js/canale.js', 'js/accesso.js', 'js/qrcode.js', 'js/vista.js',
  'js/inseguitore.js', 'js/uccelli.js', 'js/vita.js', 'js/bard.js', 'js/icone.js'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(PAGINE).then(c => Promise.all(SUBITO.map(f => c.add(new URL(f, self.registration.scope)).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    /* 20/11: «finestre-file-…» sono i file salvati sul dispositivo da js/vista.js (memoriaLocale): non sono di questa memoria */
    for (const k of await caches.keys()) if (!k.startsWith(VERSIONE) && !k.startsWith('finestre-file')) await caches.delete(k);
    /* 20/11: i video tenuti qui prima (anche 30–50 MB l'uno) ora li tiene la pagina: via */
    try { const d = await caches.open(DEPOSITO); for (const k of await d.keys()) if (/\.mp4$/i.test(new URL(k.url).pathname)) await d.delete(k); } catch(e) {}
    await self.clients.claim();
  })());
});

const delDeposito = u => /\/storage\/v1\/object\/(sign|public)\//.test(u.pathname);
const chiaveDeposito = u => new Request(u.origin + u.pathname.replace('/object/sign/', '/object/public/'));
const daTenere = u => (u.origin === self.location.origin) || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);

async function potaDeposito(cache){
  const k = await cache.keys();
  for (let i = 0; i < k.length - MAX_DEPOSITO; i++) await cache.delete(k[i]);
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  const deposito = delDeposito(u);
  if (!deposito && !daTenere(u)) return;            /* Supabase (canale, account), YouTube, AI: sempre in rete */
  /* 20/11: i file del deposito con la versione («v=») li tiene la pagina (js/vista.js, «I FILE SALVATI SUL DISPOSITIVO»),
     e i video da 30–50 MB qui sarebbero stati una seconda copia */
  if (deposito && /[?&]v=[^&]/.test(u.search)) return;
  e.respondWith((async () => {
    const cache = await caches.open(deposito ? DEPOSITO : PAGINE);
    const chiave = deposito ? chiaveDeposito(u) : r;
    try {
      /* 5/11: pagine e programmi sempre ricontrollati col server (la cache del browser di GitHub Pages dura 10 minuti:
         il Raspberry ripartito subito dopo una modifica prendeva ancora la versione vecchia) */
      const risposta = deposito ? await fetch(r) : await fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'});
      if (risposta.ok && risposta.status === 200 && (risposta.type === 'basic' || risposta.type === 'cors')){
        const copia = risposta.clone();
        e.waitUntil(cache.put(chiave, copia).then(() => deposito && potaDeposito(cache)).catch(() => {}));
      }
      return risposta;
    } catch(err) {
      const tenuta = await cache.match(chiave, {ignoreSearch: !deposito});
      if (tenuta) return tenuta;
      throw err;
    }
  })());
});
