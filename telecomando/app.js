/* ═══════════════════════════════════════════════════════════════════════════
   DMaster Atmosphere — l'app sul telefono (powered by DMaster Stage).
   Due parti: Bard (musiche e suoni della stanza, in arrivo) e Illusionist (le finestre).
   Illusionist:
   Quattro schede: Finestre (anteprima dal vivo e comandi) · Paesaggi (libreria, foto dal web,
   YouTube) · Crea (paesaggi dipinti dall'AI, con le luci del giorno e l'animazione) · Impostazioni.
   Parla con le finestre sul canale della casa (js/canale.js); la libreria sta nel deposito (js/libreria.js).
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const leggi = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; } };
const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
const euro = n => (n < .1 ? n.toFixed(3) : n.toFixed(2)).replace('.', ',') + ' $';
const VERSIONE = '3.1';

/* ── la casa ──────────────────────────────────────────────────────────────── */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const q = new URLSearchParams(location.search);
/* la testata del marchio: DMaster Atmosphere, con le sue due parti; Bard arriva dopo */
const MARCHIO = `<div class="marchio"><div class="marchio-nome"><span>DMaster</span> Atmosphere</div>
  <div class="marchio-firma">powered by DMaster Stage</div>
  <div class="marchio-parti"><span class="parte spenta" title="Musiche e suoni della stanza: in arrivo">Bard <em>presto</em></span><span class="parte attiva">Illusionist</span></div></div>
<div class="in-mano-avviso" id="inMano" hidden><b>In mano a DMaster</b> La Serata comanda finestre e atmosfera: qui le guardi soltanto. Quando chiudi DMaster tornano a questo telefono da sole.</div>`;
/* il vecchio link (?casa=…): resta finché il proprietario non lo chiude; una casa nuova non ce l'ha, si entra con l'email */
let casa = (String(q.get('casa') || '').match(UUID) || String(leggi('finestre-casa', '') || '').match(UUID) || [null])[0];
/* aperto dal QR di uno schermo («…/telecomando/?abbina=123456»): dopo l'accesso chiede di aggiungerlo */
let codiceArrivato = Accesso.codiceDa(location.href) || sessionStorage.getItem('atm-codice-arrivato') || null;
if (codiceArrivato) sessionStorage.setItem('atm-codice-arrivato', codiceArrivato);
if (casa) scrivi('finestre-casa', casa);
/* il codice della casa resta nell'indirizzo (così «Aggiungi alla schermata Home» se lo porta dietro); quello dello schermo no */
history.replaceState(null, '', location.pathname + (casa ? '?casa=' + casa : '') + location.hash);

/* ── impostazioni ─────────────────────────────────────────────────────────── */
const IMP_PRED = {modello:'openai:gpt-image-2', qualita:'alta', chiavi:{openai:'', google:'', pexels:''},
  video:{modello:'omni-720p', secondi:8}, stile:'painterly', luci:{alba:true, tramonto:true, notte:true}, anima:false, elementi:['alberi','acqua','fumo'], cielo:true, tv:true};
const imp = Object.assign({}, IMP_PRED, leggi('finestre-impostazioni', {}));
imp.chiavi = Object.assign({}, IMP_PRED.chiavi, imp.chiavi || {});
imp.video = Object.assign({}, IMP_PRED.video, imp.video || {});
if (!MODELLI_VIDEO.find(m => m.id === imp.video.modello)) imp.video.modello = 'omni-720p';
if (!imp.chiavi.openai && leggi('finestre-chiave-openai', '')) imp.chiavi.openai = leggi('finestre-chiave-openai', '');   /* dalla versione di prima */
if (!MODELLI_VIDEO.length) imp.anima = false;
const salvaImp = () => scrivi('finestre-impostazioni', imp);

/* ── la scena e i fori ───────────────────────────────────────────────────── */
const SCENA_PRED = {acceso:true, yt:'', t:0, immagini:null, animati:null, paesaggio:'', fuoco:null, ora:'vera', meteo:'sereno',
  intensita:.75, vento:null, fps:60, prospettivaViva:false, movimento:true, luceGiorno:70, luceNotte:30, prospettiva:true, zoom:1, vx:0};
let scena = Object.assign({}, SCENA_PRED, leggi('finestre-scena', {}));
/* le finestre della casa: una o due, ognuna sul suo schermo (sono a due metri l'una dall'altra) */
function normalizzaFori(a){
  if (a && a.finestre) return {n: a.n === 2 ? 2 : 1, finestre: Object.assign({}, a.finestre)};
  if (a && a.fori && a.fori.length === 1) return {n:1, finestre:{sinistra:a.fori[0]}};   /* formato di prima */
  return {n:1, finestre:{}};
}
let assetto = normalizzaFori(leggi('finestre-fori', null));
let schermi = leggi('finestre-schermi', {});
const schermoDi = lato => schermi[lato] || schermi.sinistra || {w:1080, h:1920};
let schermo = schermoDi('sinistra');
let collegate = 0, mostraBordi = false, rimanda = false;
/* DMaster al comando: quando DMaster Stage è aperto manda un battito ogni 10 secondi; finché
   il battito c'è (30 secondi di tolleranza) le finestre ascoltano solo lui e qui i comandi sono fermi.
   Quando DMaster si chiude, o tace, il comando torna da solo a questo telefono. */
let dmasterFino = 0;
const comandaDM = () => Date.now() < dmasterFino;
function foroPredefinito(sch){ const H = .9, W = H * sch.h * 2 / 5 / sch.w; return {x:(1 - W) / 2, y:(1 - H) / 2, w:W, h:H}; }
function assettoOPredefinito(){
  return {n: assetto.n === 2 ? 2 : 1, finestre:{
    sinistra: assetto.finestre.sinistra || foroPredefinito(schermoDi('sinistra')),
    destra: assetto.finestre.destra || foroPredefinito(schermoDi('destra'))}};
}

/* ── canale con le finestre ──────────────────────────────────────────────── */
const gestoreCanale = {
  suMessaggio(evento, d){
    if (evento === 'dmaster'){ dmasterFino = d.attivo ? Date.now() + 30000 : 0; aggiornaComando(); return; }
    if (evento !== 'eccomi') return;
    collegate = Date.now();
    if (d.comando === 'dmaster') dmasterFino = Math.max(dmasterFino, Date.now() + 25000);
    if (comandaDM() && d.scena){   /* comanda DMaster: qui si guarda e basta, la scena è la sua */
      scena = Object.assign({}, SCENA_PRED, d.scena); delete scena.da; scrivi('finestre-scena', scena); postaAnteprima({tipo:'scena', scena});
      aggiornaComando(); aggiornaSpia(); impaginaAnteprima(); if (scheda === 'finestre') aggiornaFinestre(); return;
    }
    if (d.assetto && (d.assetto.finestre || d.assetto.fori)){ const a = normalizzaFori(d.assetto); if (d.assetto.finestre || !leggi('finestre-fori', null)){ assetto = a; scrivi('finestre-fori', assetto); } }
    if (d.schermo){ schermi[d.lato || 'sinistra'] = d.schermo; scrivi('finestre-schermi', schermi); schermo = schermoDi('sinistra'); }
    if (!leggi('finestre-scena', null) && d.scena){ scena = Object.assign({}, SCENA_PRED, d.scena); scrivi('finestre-scena', scena); }
    else if (rimanda){ rimanda = false; canale.manda('scena', scena); canale.manda('fori', Object.assign({mostra: mostraBordi}, assettoOPredefinito())); }   /* dopo «Ricarica», la scena di questo telefono */
    else if (d.scena && diversa(d.scena, scena)) canale.manda('scena', scena);   /* la finestra mostra altro (es. rimasta spenta): vale quello che dice il telefono */
    aggiornaSpia(); impaginaAnteprima(); if (scheda === 'finestre') aggiornaFinestre(); if (scheda === 'impostazioni') disegnaScheda();
  },
  suStato(ok){ aggiornaSpia(); if (ok) canale.manda('chi'); }
};
/* due canali: quello del vecchio link (finché è aperto) e quello privato della casa «atm:<casa>» (js/accesso.js);
   i messaggi partono su tutti e due */
let vecchio = casa ? apriCanale(casa, gestoreCanale) : null, canalePrivato = null;
const canale = {
  manda(evento, dati){ const a = vecchio ? vecchio.manda(evento, dati) : false, b = canalePrivato ? canalePrivato.manda(evento, dati) : false; return a || b; },
  get pronto(){ return !!((vecchio && vecchio.pronto) || (canalePrivato && canalePrivato.pronto)); }
};
{ /* mentre comanda DMaster, verso le finestre parte solo la domanda «chi c'è?» */
  const mandaDavvero = canale.manda.bind(canale);
  canale.manda = (evento, dati) => { if (evento !== 'chi' && comandaDM()){ avvisoInMano(); return false; } return mandaDavvero(evento, dati); };
}
let ultimoAvvisoInMano = 0;
function avvisoInMano(){ if (Date.now() - ultimoAvvisoInMano > 2500){ ultimoAvvisoInMano = Date.now(); avviso('Le finestre sono in mano a DMaster', true); } }
function aggiornaComando(){
  const dm = comandaDM();
  document.body.classList.toggle('in-mano', dm);
  const f = document.getElementById('inMano'); if (f) f.hidden = !dm;
}
setInterval(aggiornaComando, 4000);
setInterval(() => { if (canale.pronto) canale.manda('chi'); aggiornaSpia(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && canale.pronto) canale.manda('chi'); });
function aggiornaSpia(){
  const viva = canale.pronto && Date.now() - collegate < 45000;
  document.querySelectorAll('.spia').forEach(s => { s.classList.toggle('viva', viva); s.querySelector('span').textContent = !canale.pronto ? 'collegamento…' : viva ? 'in onda' : 'non raggiungibili'; });
}

let invio = null;
function mandaScena(subito = true){
  scrivi('finestre-scena', scena);
  postaAnteprima({tipo:'scena', scena});
  clearTimeout(invio);
  if (subito) canale.manda('scena', scena); else invio = setTimeout(() => canale.manda('scena', scena), 110);
}
function diversa(a, b){ return ['acceso', 'paesaggio', 'ora', 'meteo', 'yt'].some(k => (a[k] ?? '') !== (b[k] ?? '')); }
function cambia(parte, subito = true){ if (comandaDM()){ avvisoInMano(); return; } Object.assign(scena, parte); mandaScena(subito); if (scheda === 'finestre') aggiornaFinestre(); }
let invioFori = null;
function mandaFori(){
  scrivi('finestre-fori', assetto); impaginaAnteprima();
  clearTimeout(invioFori);
  invioFori = setTimeout(() => canale.manda('fori', Object.assign({mostra: mostraBordi}, assettoOPredefinito())), 90);
}

/* ── account e casa privata (js/accesso.js) ─────────────────────────────────
   Il telefono entra con l'email (codice di 6 cifre, una volta sola: poi resta); la casa del vecchio link
   diventa del suo account; schermi, DMaster e il computer che rifinisce si abbinano col codice che mostrano. */
let account = null, casaPrivata = null, membri = [], accessoStato = 'controllo', emailInAttesa = leggi('atm-email-attesa', '');
async function avviaAccesso(){
  try {
    account = await Accesso.conAccount();
    if (account){
      const case_ = await Accesso.mieCase();
      casaPrivata = (casa && case_.find(c => c.chiave_vecchia === casa)) || (!casa ? case_[0] : null) || null;
      /* un account nuovo, senza vecchio link: la sua casa si crea da sola */
      if (!casaPrivata && !casa){ const id = await Accesso.nuovaCasa('Stanza'); casaPrivata = (await Accesso.mieCase()).find(c => c.id === id); }
      if (casaPrivata){
        if (casaPrivata.vecchio_chiuso) dimenticaVecchio();
        const n = casa ? (await Accesso.elenco(casaPrivata.id)).length : 1;
        if (n && !CASA_PRIVATA){ CASA_PRIVATA = casaPrivata.id; libreriaStato = 'da caricare'; if (scheda === 'paesaggi') disegnaPaesaggi(); else caricaLibreria(); }
        if (!canalePrivato) canalePrivato = Accesso.canale(casaPrivata.id, gestoreCanale);
        membri = await Accesso.membri(casaPrivata.id).catch(() => []);
      }
    }
    accessoStato = 'ok';
  } catch(e) { accessoStato = e.message; }
  if (scheda === 'impostazioni') disegnaImpostazioni();
  if (!account && (!casa || !leggi('atm-benvenuto-visto', false))) apriBenvenuto();
  else if (account && casa && !casaPrivata && !leggi('atm-benvenuto-visto', false)) apriBenvenuto();
  else if (account && casaPrivata && codiceArrivato){ const c = codiceArrivato; codiceArrivato = null; sessionStorage.removeItem('atm-codice-arrivato'); confermaAggiunta(c); }
}
/* il vecchio link è chiuso: niente più canale né chiave nell'indirizzo */
function dimenticaVecchio(){
  if (vecchio){ vecchio.chiudi && vecchio.chiudi(); vecchio = null; }
  casa = null; scrivi('finestre-casa', ''); history.replaceState(null, '', location.pathname + location.hash);
}

/* ── benvenuto: il percorso guidato (entra → la tua casa → aggiungi gli schermi) ── */
function apriBenvenuto(){
  const passi = ['Entra', 'La tua stanza', 'Gli schermi'], ora = !account ? 0 : (casa && !casaPrivata) ? 1 : 2;
  const testaPassi = `<div class="passi-guida">${passi.map((t, i) => `<span class="${i < ora ? 'fatto' : i === ora ? 'ora' : ''}">${i < ora ? icona('spunta', 14) : i + 1} ${t}</span>`).join('')}</div>`;
  let corpo;
  if (ora === 0) corpo = emailInAttesa
    ? `<h3>Controlla la posta</h3><p class="nota">Ti ho mandato un codice a <b>${esc(emailInAttesa)}</b>: l'oggetto è «Accesso DMaster: codice …».</p>
       <label class="campo"><span>Codice</span><input id="accCodice" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
       <button class="btn oro piena" data-fai="accEntra">${icona('spunta', 18)}Entra</button><button class="btn piena" style="margin-top:8px" data-fai="accAltra">Usa un'altra email</button>`
    : `<h3>Benvenuto in DMaster Atmosphere</h3><p class="nota">Entra con la tua email: ti arriva un codice di 6 cifre, niente password. Si fa una volta sola su questo telefono. È lo stesso account di DMaster.</p>
       <label class="campo"><span>Email</span><input id="accEmail" type="email" autocomplete="email" inputmode="email" placeholder="nome@esempio.it" value="${esc(leggi('atm-email', ''))}"></label>
       <button class="btn oro piena" data-fai="accCodiceEmail">${icona('posta', 18)}Mandami il codice</button>
       ${casa ? '<button class="btn piena" style="margin-top:8px" data-fai="benvenutoDopo">Più tardi</button>' : ''}`;
  else if (ora === 1) corpo = `<h3>La tua stanza</h3><p class="nota">Le finestre di questa stanza usano ancora il vecchio link: chi ce l'ha le comanda e vede le immagini. Collegale al tuo account: copio le immagini nella parte privata (meglio col Wi-Fi), e da lì le vede solo chi aggiungi tu. Le finestre continuano a funzionare intanto.</p>
       <button class="btn oro piena" data-fai="accReclama">${icona('chiave', 18)}Collega la stanza al mio account</button><div id="lavoroFoglio"></div>`;
  else corpo = `<h3>Gli schermi della stanza</h3><p class="nota">Ogni schermo (finestre, TV) mostra un QR la prima volta che si accende. Inquadralo e conferma: una volta per schermo, poi resta.</p>
       <button class="btn oro piena" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi schermo</button>
       ${vecchio ? `<button class="btn piena" style="margin-top:8px" data-fai="accMostraCodici">${icona('schermo', 18)}Mostra il QR sugli schermi accesi</button>` : ''}
       <p class="nota">Nella stanza: ${membri.filter(m => m.ruolo !== 'proprietario').map(m => esc(m.nome || m.ruolo)).join(', ') || 'ancora nessuno schermo'}.</p>
       <button class="btn piena" data-fai="benvenutoFine">Fatto</button>`;
  apriFoglio(`<div class="benvenuto">${testaPassi}${corpo}</div>`);
  foglioAperto = 'benvenuto';
}

/* ── aggiungi uno schermo: inquadra il QR (fotocamera) o scrivi il codice ─────── */
let flussoCamera = null;
function fermaCamera(){ if (flussoCamera){ flussoCamera.getTracks().forEach(t => t.stop()); flussoCamera = null; } }
function caricaLettoreQR(){ return window.jsQR ? Promise.resolve() : new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '../js/jsqr.js?v=1'; sc.onload = ok; sc.onerror = () => no(new Error('lettore QR non caricato')); document.head.appendChild(sc); }); }
async function apriAggiungi(){
  if (!casaPrivata){ apriBenvenuto(); return; }
  apriFoglio(`<div class="benvenuto"><h3>Aggiungi schermo</h3>
    <div class="mirino"><video id="qrVideo" playsinline muted></video><i></i><span id="qrStato">Accendo la fotocamera…</span></div>
    <label class="campo" style="margin-top:12px"><span>Oppure scrivi le 6 cifre</span><input id="qrCodice" inputmode="numeric" maxlength="7" placeholder="302 680"></label>
    <button class="btn oro piena" data-fai="codiceScritto">${icona('freccia', 18)}Continua</button></div>`);
  foglioAperto = 'aggiungi';
  try {
    await caricaLettoreQR();
    flussoCamera = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment', width:{ideal:1280}}, audio:false});
    const v = $('#qrVideo'); if (!v){ fermaCamera(); return; }
    v.srcObject = flussoCamera; await v.play();
    $('#qrStato').textContent = 'Inquadra il QR sullo schermo';
    const c = document.createElement('canvas'), x = c.getContext('2d', {willReadFrequently:true});
    const giro = () => {
      if (!flussoCamera || foglioAperto !== 'aggiungi') { fermaCamera(); return; }
      if (v.videoWidth){
        const k = Math.min(1, 640 / v.videoWidth); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        x.drawImage(v, 0, 0, c.width, c.height);
        const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, {inversionAttempts:'dontInvert'});
        const cod = r && Accesso.codiceDa(r.data);
        if (cod){ fermaCamera(); navigator.vibrate && navigator.vibrate(40); confermaAggiunta(cod); return; }
      }
      requestAnimationFrame(giro);
    };
    requestAnimationFrame(giro);
  } catch(e) {
    fermaCamera();
    const st = $('#qrStato'); if (st) st.textContent = 'Fotocamera non disponibile: scrivi le 6 cifre qui sotto.';
  }
}
async function confermaAggiunta(codice){
  if (!account){ codiceArrivato = codice; sessionStorage.setItem('atm-codice-arrivato', codice); apriBenvenuto(); return; }
  if (!casaPrivata){ apriBenvenuto(); return; }
  let chi = null;
  try { chi = await Accesso.vediCodice(codice); } catch(e) { avviso(e.message, true); apriAggiungi(); return; }
  const nome = chi ? (chi.nome || (chi.ruolo === 'lavoratore' ? 'Computer della rifinitura' : 'Schermo')) : 'lo schermo con codice ' + codice.slice(0, 3) + ' ' + codice.slice(3);
  apriFoglio(`<div class="benvenuto" style="text-align:center">${icona(chi && chi.ruolo === 'lavoratore' ? 'schermo' : 'tv', 34)}
    <h3>Aggiungere «${esc(nome)}» alla tua stanza?</h3>
    <p class="nota">${chi && chi.ruolo === 'lavoratore' ? 'Potrà leggere e sistemare le animazioni della stanza.' : 'Vedrà i tuoi paesaggi e seguirà i comandi di questo telefono e di DMaster.'}</p>
    <button class="btn oro piena" data-fai="aggiungiOra" data-v="${esc(codice)}">${icona('spunta', 18)}Aggiungi</button>
    <button class="btn piena" style="margin-top:8px" data-fai="chiudiFoglio">Annulla</button></div>`);
  foglioAperto = 'conferma';
}
/* dal vecchio deposito pubblico al privato: copia quello che manca o che è stato riscritto (si può rifare) */
async function copiaNelPrivato(L){
  const cartella = await cartellaDi(casa);
  const {data: vecchi, error} = await clientDeposito().storage.from(DEPOSITO).list('finestre/' + cartella, {limit:1000});
  if (error) throw new Error('Vecchio deposito non letto: ' + error.message);
  const nuovi = Object.fromEntries((await Accesso.elenco(casaPrivata.id)).map(f => [f.name, f]));
  const daCopiare = (vecchi || []).filter(f => !/^zz-|-incorso\.png$/.test(f.name) && (!nuovi[f.name] || Date.parse(f.updated_at || 0) > Date.parse(nuovi[f.name].updated_at || 0)));
  let fatti = 0;
  for (const f of daCopiare){
    passo('copia', 'ora', `Copio le immagini nel deposito privato: ${fatti + 1} di ${daCopiare.length}…`); L.av = fatti / daCopiare.length * 100;
    const r = await fetch(urlPubblico('finestre/' + cartella + '/' + f.name) + '?copia=' + Date.now());
    if (!r.ok) throw new Error('Non riesco a leggere ' + f.name + ' (' + r.status + ')');
    const blob = await r.blob();
    await Accesso.carica(casaPrivata.id, f.name, blob, (f.metadata && f.metadata.mimetype) || blob.type || 'application/octet-stream');
    fatti++;
  }
  L.av = null;
  passo('copia', 'fatto', daCopiare.length ? `Copiati ${fatti} file nel deposito privato` : 'Il deposito privato era già aggiornato');
}

/* ── problemi di credito o di chiave: un avviso che resta finché non si risolve ── */
let problema = leggi('finestre-problema', null);
function segnala(e){
  if (e.tipo !== 'credito' && e.tipo !== 'chiave') return;
  problema = {tipo:e.tipo, chi:e.chi || '', testo:e.message, quando:Date.now()}; scrivi('finestre-problema', problema);
  avviso(e.message, true); mostraProblema();
}
function risolto(chi){ if (problema && (!chi || (problema.chi || '').startsWith(chi))){ problema = null; scrivi('finestre-problema', null); mostraProblema(); } }
function mostraProblema(){
  document.querySelectorAll('.problema').forEach(el => {
    el.hidden = !problema;
    if (!problema) return;
    const link = (problema.chi || '').startsWith('OpenAI') ? 'https://platform.openai.com/settings/organization/billing/overview' : 'https://aistudio.google.com/usage';
    el.innerHTML = `${icona('avviso', 20)}<div><b>${problema.tipo === 'credito' ? 'Credito esaurito' : 'Chiave da controllare'}</b><span>${esc(problema.testo)}</span>
      <div class="azioni" style="margin-top:8px"><a class="btn piccolo" href="${link}" target="_blank" rel="noopener">${icona('catena', 16)}${problema.tipo === 'credito' ? 'Ricarica' : 'Apri'}</a><button class="btn piccolo" data-fai="chiudiProblema">${icona('chiudi', 16)}Ho risolto</button></div></div>`;
  });
}

/* ── avvisi e foglio ─────────────────────────────────────────────────────── */
let avvisoT = null;
function avviso(testo, male = false){
  const a = $('#avviso'); a.className = 'avviso su' + (male ? ' male' : '');
  a.innerHTML = icona(male ? 'avviso' : 'spunta', 18) + '<span>' + esc(testo) + '</span>';
  clearTimeout(avvisoT); avvisoT = setTimeout(() => a.classList.remove('su'), male ? 5200 : 2600);
}
function apriFoglio(html, dopo){ $('#foglioDentro').innerHTML = html; $('#foglio').classList.add('aperto'); $('#velo').classList.add('aperto'); dopo && dopo($('#foglioDentro')); }
function chiudiFoglio(){ $('#foglio').classList.remove('aperto'); $('#velo').classList.remove('aperto'); if (foglioAperto === 'benvenuto') scrivi('atm-benvenuto-visto', true); foglioAperto = null; fermaCamera(); }
let foglioAperto = null;
$('#velo').onclick = chiudiFoglio;
$('#chiudiFoglio').innerHTML = icona('chiudi', 18);

/* ── pezzi di interfaccia ────────────────────────────────────────────────── */
const testa = (ic, titolo, sotto, spia = true) => `<header class="testa"><div><h1>${icona(ic, 22)}${esc(titolo)}</h1><p>${esc(sotto)}</p></div>${spia ? '<span class="spia"><i></i><span>…</span></span>' : ''}</header>`;
const titolo = (ic, testo, piccolo = '') => `<h2 class="titolo">${icona(ic, 16)}${esc(testo)}${piccolo ? '<small>' + esc(piccolo) + '</small>' : ''}</h2>`;
const scelta = (fai, v, ic, testo, acceso) => `<button class="scelta" data-fai="${fai}" data-v="${esc(v)}" aria-pressed="${!!acceso}">${icona(ic, 22)}<span>${esc(testo)}</span></button>`;
const cursore = (id, ic, testo, min, max, val, uscita, passo = 1) => `<div class="cursore">${icona(ic, 18)}<label for="${id}">${esc(testo)}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${passo}" value="${val}"><output id="${id}-o">${esc(uscita)}</output></div>`;
const interruttore = (fai, ic, testo, sotto, acceso) => `<div class="interruttore" role="switch" tabindex="0" data-fai="${fai}" aria-checked="${!!acceso}">${icona(ic, 20)}<span><b>${esc(testo)}</b>${sotto ? '<small>' + esc(sotto) + '</small>' : ''}</span><i class="levetta"></i></div>`;
function riempi(r){ const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
function legaCursore(id, fn){ const r = document.getElementById(id); if (!r) return; riempi(r); r.oninput = () => { riempi(r); fn(+r.value, document.getElementById(id + '-o')); }; return r; }

/* ═════════════════════════════ SCHEDE ═════════════════════════════════════ */
const SCHEDE = [['finestre','bifora','Finestre'], ['paesaggi','quadro','Paesaggi'], ['crea','scintilla','Crea'], ['impostazioni','manopole','Impostazioni']];
let scheda = (location.hash.slice(1) in {finestre:1, paesaggi:1, crea:1, impostazioni:1}) ? location.hash.slice(1) : 'finestre';
$('#barra').innerHTML = SCHEDE.map(([id, ic, nome]) => `<button data-scheda="${id}">${icona(ic, 22)}<span>${nome}</span></button>`).join('');
$('#barra').onclick = e => { const b = e.target.closest('[data-scheda]'); if (b) vai(b.dataset.scheda); };
const app = $('#app');
app.innerHTML = MARCHIO + SCHEDE.map(([id]) => `<section class="scheda" id="s-${id}"></section>`).join('');
function vai(id){
  if (scheda === 'impostazioni' && id !== 'impostazioni' && mostraBordi){ mostraBordi = false; canale.manda('fori', Object.assign({mostra:false}, assettoOPredefinito())); }
  scheda = id; history.replaceState(null, '', location.pathname + location.search + '#' + id);
  disegnaScheda(); scrollTo(0, 0);
}
function disegnaScheda(){
  document.querySelectorAll('.scheda').forEach(s => s.classList.toggle('attiva', s.id === 's-' + scheda));
  document.querySelectorAll('#barra button').forEach(b => b.setAttribute('aria-current', b.dataset.scheda === scheda ? 'page' : 'false'));
  ({finestre: disegnaFinestre, paesaggi: disegnaPaesaggi, crea: disegnaCrea, impostazioni: disegnaImpostazioni})[scheda]();
  aggiornaSpia();
}

/* ═══════════ FINESTRE: anteprima dal vivo e comandi ═════════════════════ */
const ORE = [['vera','orologio','Come fuori'], ['alba','alba','Alba'], ['giorno','sole','Giorno'], ['tramonto','tramonto','Tramonto'], ['notte','luna','Notte']];
const METEO = [['sereno','sole','Sereno'], ['nuvoloso','nuvola','Nuvoloso'], ['nebbia','nebbia','Nebbia'], ['pioggia','pioggia','Pioggia'], ['temporale','fulmine','Temporale'], ['neve','fiocco','Neve']];
const FLUIDITA = [[60,'Massima','60 al secondo'], [50,'Bilanciata','50, schermo a 50 Hz'], [30,'Silenziosa','30, metà lavoro'], [45,'45','prova']];
const NOME_ORA = {vera:'come fuori', alba:'alba', giorno:'giorno', tramonto:'tramonto', notte:'notte'};
let anteprimaPronta = false, anteprimaFrame = null;
function postaAnteprima(m){ if (anteprimaFrame && anteprimaPronta) anteprimaFrame.contentWindow.postMessage(m, '*'); }
function forieAnteprima(){
  /* l'anteprima mostra le finestre nella loro forma vera; se sono due, una accanto all'altra con un po' di muro in mezzo */
  const a = assettoOPredefinito(), f = a.finestre.sinistra, sch = schermoDi('sinistra');
  const asp = (f.w * sch.w) / (f.h * sch.h);
  if (a.n === 1) return {aspetto: asp, fori:[{x:0, y:0, w:1, h:1}], modo:'doppia'};
  const muro = asp * .45, tot = 2 * asp + muro;
  return {aspetto: tot, fori:[{x:0, y:0, w:asp / tot, h:1}, {x:(asp + muro) / tot, y:0, w:asp / tot, h:1}], modo:'doppia'};
}
function impaginaAnteprima(){
  const box = $('#anteprima'); if (!box) return;
  const fa = forieAnteprima();
  box.style.aspectRatio = String(fa.aspetto);
  postaAnteprima({tipo:'fori', fori:fa.fori, modo:fa.modo});
}
function disegnaFinestre(){
  const s = $('#s-finestre');
  if (!s.dataset.fatto){
    s.dataset.fatto = 1;
    s.innerHTML = testa('bifora', 'Illusionist', 'Le finestre della stanza medievale') + `
      <div class="vivo">
        <div class="anteprima" id="anteprima"><iframe id="anteprimaFrame" title="Anteprima delle finestre" src="../finestra/?anteprima=1"></iframe>
          <div class="etich"><b id="nomeInOnda">—</b><small id="sottoInOnda"></small></div></div>
        <div class="rapide">
          <button class="btn" data-fai="accendi" id="btnAccendi">${icona('accensione', 20)}<span>Accese</span></button>
          <button class="btn" data-fai="lampo">${icona('fulmine', 20)}<span>Lampo</span></button>
          <button class="btn" data-fai="vaiPaesaggi">${icona('quadro', 20)}<span>Paesaggi</span><small>cambia</small></button>
          <button class="btn" data-fai="vaiCrea">${icona('scintilla', 20)}<span>Crea</span><small>con l'AI</small></button>
        </div>
      </div>
      <div class="sezione">${titolo('orologio', 'Ora')}<div class="scelte c5" id="sceltaOra">${ORE.map(([v, ic, t]) => scelta('ora', v, ic, t)).join('')}</div></div>
      <div class="sezione">${titolo('nuvola', 'Tempo')}<div class="scelte c3" id="sceltaMeteo">${METEO.map(([v, ic, t]) => scelta('meteo', v, ic, t)).join('')}</div>
        <div class="pannello" style="margin-top:10px">
          ${cursore('intensita', 'goccia', 'Intensità', 0, 100, Math.round(scena.intensita * 100), Math.round(scena.intensita * 100) + '%')}
          ${cursore('vento', 'vento', 'Vento', 0, 100, scena.vento == null ? 30 : Math.round(scena.vento * 100), scena.vento == null ? 'auto' : Math.round(scena.vento * 100) + '%')}
          <div class="pillole" style="margin-top:2px"><button class="pillola" data-fai="ventoAuto" id="ventoAuto">${icona('vento', 16)}Vento secondo il tempo</button></div>
        </div></div>
      <div class="sezione">${titolo('porta', 'Vista')}
        <p class="nota" id="notaModo" style="margin-top:0"></p>
        <div class="pannello" style="margin-top:10px;padding:2px 14px">
          ${interruttore('movimento', 'nuvola', 'Movimento', 'Nuvole che scorrono e alberi al vento, anche sulle immagini ferme', scena.movimento)}
          ${interruttore('prospettiva', 'occhio', 'Prospettiva', 'Le due finestre vedono il paesaggio da punti appena diversi', scena.prospettiva)}
          ${interruttore('prospettivaViva', 'persona', 'Prospettiva viva', 'Per un ospite: le finestre seguono chi si muove nella stanza (serve il sensore). Con più persone resta ferma.', scena.prospettivaViva)}
        </div></div>
      <div class="sezione">${titolo('film', 'Fluidità', 'immagini al secondo')}
        <div class="scelte c4" id="sceltaFps">${FLUIDITA.map(([v, t, sotto]) => `<button class="scelta" data-fai="fps" data-v="${v}" aria-pressed="false"><b style="font:600 18px var(--display)">${v}</b><span>${esc(t)}</span></button>`).join('')}</div>
        <p class="nota">Meno immagini al secondo = meno lavoro per il computer, ventola più tranquilla. 50 è regolare solo se lo schermo è impostato a 50 Hz; 45 su uno schermo a 60 Hz dà piccoli scatti sulla pioggia. Uno schermo può avere la sua con <b>&amp;fps=</b> nel suo indirizzo.</p></div>
      <div class="sezione">${titolo('luce', 'Luce dello schermo', 'bassa, più bassa di notte')}
        <div class="pannello">${cursore('luceGiorno', 'sole', 'Di giorno', 5, 100, scena.luceGiorno, scena.luceGiorno + '%')}${cursore('luceNotte', 'luna', 'Di notte', 2, 100, scena.luceNotte, scena.luceNotte + '%')}</div></div>`;
    anteprimaFrame = $('#anteprimaFrame');
    anteprimaFrame.onload = () => { anteprimaPronta = true; impaginaAnteprima(); postaAnteprima({tipo:'scena', scena}); };
    legaCursore('intensita', (v, o) => { o.textContent = v + '%'; cambia({intensita: v / 100}, false); });
    legaCursore('vento', (v, o) => { o.textContent = v + '%'; cambia({vento: v / 100}, false); });
    legaCursore('luceGiorno', (v, o) => { o.textContent = v + '%'; cambia({luceGiorno: v}, false); });
    legaCursore('luceNotte', (v, o) => { o.textContent = v + '%'; cambia({luceNotte: v}, false); });
    impaginaAnteprima();
  }
  aggiornaFinestre();
}
function aggiornaFinestre(){
  const s = $('#s-finestre'); if (!s.dataset.fatto) return;
  s.querySelectorAll('[data-fai="ora"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.ora)));
  s.querySelectorAll('[data-fai="meteo"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.meteo)));
  s.querySelectorAll('[data-fai="fps"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === (scena.fps || 60))));
  const a = assettoOPredefinito();
  $('#notaModo').textContent = a.n < 2 ? 'Una finestra. Quando arriverà il secondo schermo, la seconda finestra si aggiunge nelle Impostazioni.'
    : 'Due finestre, una per schermo: lo stesso paesaggio, ognuna con la sua prospettiva, come due finestre vere sulla stessa parete.';
  $('#btnAccendi').innerHTML = icona('accensione', 20) + '<span>' + (scena.acceso ? 'Accese' : 'Spente') + '</span><small>' + (scena.acceso ? 'spegni' : 'accendi') + '</small>';
  $('#btnAccendi').classList.toggle('oro', !!scena.acceso);
  $('#ventoAuto').setAttribute('aria-pressed', String(scena.vento == null));
  $('#vento-o').textContent = scena.vento == null ? 'auto' : Math.round(scena.vento * 100) + '%';
  s.querySelector('[data-fai="movimento"]').setAttribute('aria-checked', String(scena.movimento !== false));
  s.querySelector('[data-fai="prospettiva"]').setAttribute('aria-checked', String(scena.prospettiva !== false));
  s.querySelector('[data-fai="prospettivaViva"]').setAttribute('aria-checked', String(!!scena.prospettivaViva));
  const p = libreria.find(x => x.id === scena.paesaggio);
  $('#nomeInOnda').textContent = p ? p.nome : scena.yt ? 'Video di YouTube' : scena.immagini ? 'Paesaggio' : 'Nessun paesaggio';
  $('#sottoInOnda').textContent = [p ? TIPI[p.tipo] : '', NOME_ORA[scena.ora], (METEO.find(m => m[0] === scena.meteo) || [,,''])[2].toLowerCase()].filter(Boolean).join(' · ');
}

/* ═══════════ PAESAGGI: libreria, foto dal web, YouTube ══════════════════ */
let libreria = [], libreriaStato = 'da caricare', vistaPaesaggi = 'miei', filtroTesto = '', filtroTipo = 'tutti', risultatiWeb = [], cercaWebTesto = '', cercaWebStato = '';
/* la profondità si calcola da sola, in sottofondo, per ogni paesaggio che non ce l'ha:
   uno alla volta, solo quando non c'è un altro lavoro in corso, una prova sola per sessione */
const provatiProfondita = new Set();
let profonditaInCorso = false;
async function profonditaInSottofondo(){
  if (profonditaInCorso) return;
  profonditaInCorso = true;
  try {
    for (;;){
      if (lavoro && !lavoro.finito){ setTimeout(() => { profonditaInCorso = false; profonditaInSottofondo(); }, 15000); return; }
      const p = libreria.find(x => !x.yt && x.immagini.giorno && !x.immagini.profondita && !provatiProfondita.has(x.id));
      if (!p) break;
      provatiProfondita.add(p.id);
      try {
        const foto = await (await fetch(p.immagini.giorno)).blob();
        const png = await calcolaProfondita(foto);
        p.immagini.profondita = await caricaProfondita(casa, p, png);
        aggiornaInLibreria(p);
        if (foglioAperto === p.id) apriPaesaggio(p);
      } catch(e) { console.warn('profondità non calcolata per', p.nome, e); }
    }
  } finally { profonditaInCorso = false; }
}

async function caricaLibreria(){
  if (!casa && !CASA_PRIVATA){ libreriaStato = 'Entra con la tua email (Impostazioni → Account e stanza) per vedere i paesaggi della tua stanza.'; if (scheda === 'paesaggi') disegnaPaesaggi(); return; }
  libreriaStato = 'carico';
  try { libreria = await leggiLibreria(casa); libreriaStato = 'ok'; setTimeout(profonditaInSottofondo, 1500); }
  catch(e) { libreriaStato = e.message; }
  if (scheda === 'paesaggi') disegnaPaesaggi(); if (scheda === 'finestre') aggiornaFinestre();
}
const cartaPaesaggio = p => {
  const inOnda = scena.paesaggio === p.id;
  const img = p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno;
  const pos = p.fuoco ? `object-position:${Math.round(p.fuoco.x * 100)}% 50%` : '';
  const segni = [p.yt ? icona('scena', 12) : '', Object.keys(p.animati).length ? icona('anima', 12) : '', ['alba','tramonto','notte'].every(o => p.immagini[o]) ? icona('luna', 12) : ''].join('');
  return `<button class="carta" data-fai="apri" data-v="${p.id}" aria-pressed="${inOnda}">
    <img loading="lazy" alt="" src="${esc(img)}" style="${pos}">${inOnda ? '<span class="inonda"><i></i>IN ONDA</span>' : ''}
    <span class="su"><b>${esc(p.nome)}</b><small>${segni}${esc(TIPI[p.tipo] || '')}</small></span></button>`;
};
function disegnaPaesaggi(){
  if (libreriaStato === 'da caricare') caricaLibreria();
  const s = $('#s-paesaggi');
  const filtri = [['tutti','Tutti'], ['dipinti','Dipinti'], ['foto','Foto'], ['video','Video'], ['animati','Animati']];
  let corpo = '';
  if (vistaPaesaggi === 'miei'){
    const elenco = filtraLibreria(libreria, filtroTesto, filtroTipo === 'tutti' ? null : filtroTipo);
    corpo = `<div class="cerca">${icona('lente', 18)}<input id="cercaMiei" type="search" placeholder="Cerca: castello, nebbia, mare…" value="${esc(filtroTesto)}" autocomplete="off"></div>
      <div class="pillole">${filtri.map(([v, t]) => `<button class="pillola" data-fai="filtro" data-v="${v}" aria-pressed="${filtroTipo === v}">${t}</button>`).join('')}</div>
      <div class="griglia" style="margin-top:14px">${libreriaStato === 'carico' && !libreria.length ? '<p class="vuoto">Carico la libreria…</p>'
        : libreriaStato !== 'ok' && libreriaStato !== 'carico' ? `<p class="vuoto">${esc(libreriaStato)}</p>`
        : elenco.length ? elenco.map(cartaPaesaggio).join('') : `<p class="vuoto">${libreria.length ? 'Nessun paesaggio con queste parole.' : 'La libreria è vuota: crea un paesaggio con l\'AI o aggiungi una foto dal web.'}</p>`}</div>`;
  } else if (vistaPaesaggi === 'web'){
    corpo = `<form id="formWeb" class="cerca">${icona('lente', 18)}<input id="cercaWeb" type="search" placeholder="Cerca foto vere: castello medievale, colline toscane…" value="${esc(cercaWebTesto)}" autocomplete="off"></form>
      <p class="nota">Foto libere da Wikimedia Commons${imp.chiavi.pexels ? ' e Pexels' : ' (con una chiave Pexels gratuita, nelle Impostazioni, ne trovi di più belle e verticali)'}. Le verticali vengono prima.</p>
      <div class="griglia" style="margin-top:12px">${cercaWebStato === 'cerco' ? '<p class="vuoto">Cerco…</p>' : cercaWebStato && cercaWebStato !== 'ok' ? `<p class="vuoto">${esc(cercaWebStato)}</p>`
        : risultatiWeb.map((f, i) => `<button class="carta" data-fai="apriWeb" data-v="${i}"><img loading="lazy" alt="" src="${esc(f.miniatura)}"><span class="su"><b>${esc(f.titolo.slice(0, 40))}</b><small>${esc(f.fonte)}${f.verticale ? '' : ' · orizzontale'}</small></span></button>`).join('')}</div>`;
  } else {
    corpo = `<div class="pannello">
      <label class="campo"><span>Link di YouTube</span><input id="ytLink" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label>
      <label class="campo"><span>Nome</span><input id="ytNome" maxlength="40" placeholder="Es. Foresta sotto la pioggia"></label>
      <label class="campo"><span>Parole chiave</span><input id="ytParole" placeholder="foresta, pioggia, notte"></label>
      <button class="btn oro piena" data-fai="salvaYT">${icona('piu', 18)}Aggiungi alla libreria</button>
      <p class="nota">Il video gira muto e in loop, ritagliato sui fori; il tempo (pioggia, lampi, nebbia) ci va sopra. Cerca su YouTube «window view 4K» o «vertical landscape» per i più adatti.</p></div>`;
  }
  s.innerHTML = testa('quadro', 'Paesaggi', 'La libreria della stanza') + `
    <div class="segmenti" style="margin-bottom:14px">
      <button data-fai="vistaP" data-v="miei" aria-pressed="${vistaPaesaggi === 'miei'}">${icona('quadro', 16)}I miei</button>
      <button data-fai="vistaP" data-v="web" aria-pressed="${vistaPaesaggi === 'web'}">${icona('mondo', 16)}Dal web</button>
      <button data-fai="vistaP" data-v="yt" aria-pressed="${vistaPaesaggi === 'yt'}">${icona('scena', 16)}YouTube</button></div>` + corpo;
  const cm = $('#cercaMiei');
  if (cm){ cm.oninput = () => { filtroTesto = cm.value; const g = s.querySelector('.griglia'); const el = filtraLibreria(libreria, filtroTesto, filtroTipo === 'tutti' ? null : filtroTipo);
    g.innerHTML = el.length ? el.map(cartaPaesaggio).join('') : '<p class="vuoto">Nessun paesaggio con queste parole.</p>'; }; }
  const fw = $('#formWeb');
  if (fw) fw.onsubmit = async e => { e.preventDefault(); cercaWebTesto = $('#cercaWeb').value.trim(); if (!cercaWebTesto) return; $('#cercaWeb').blur();
    cercaWebStato = 'cerco'; disegnaPaesaggi();
    try { risultatiWeb = await cercaFoto(cercaWebTesto, imp.chiavi.pexels); cercaWebStato = risultatiWeb.length ? 'ok' : 'Nessuna foto trovata: prova altre parole.'; }
    catch(e2) { cercaWebStato = e2.message; }
    disegnaPaesaggi(); };
  aggiornaSpia();
}

/* il dettaglio di un paesaggio */
function apriPaesaggio(p){
  foglioAperto = p.id;
  const ora = ['giorno','alba','tramonto','notte'];
  const mancano = p.yt ? [] : ['alba','tramonto','notte'].filter(o => !p.immagini[o]);
  const fx = p.fuoco ? p.fuoco.x : .5;
  const img = p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno;
  apriFoglio(`
    <div class="dettaglio">
      <div class="grande"><img id="dettImg" alt="" src="${esc(img)}" style="object-position:${Math.round(fx * 100)}% 50%"></div>
      <div class="info">
        <h3>${esc(p.nome)}</h3>
        <p class="nota" style="margin:0">${esc(TIPI[p.tipo] || '')}${Object.keys(p.animati).length ? ' · animato' : ''}${p.immagini.profondita ? ' · con profondità' : ''}</p>
        <div class="pillole">${(p.parole || []).map(w => `<span class="pillola" style="cursor:default">${icona('etichetta', 14)}${esc(w)}</span>`).join('') || '<span class="nota">nessuna parola chiave</span>'}</div>
        ${p.yt ? '' : `<div class="luci">${ora.map(o => p.immagini[o] ? `<button data-fai="vediLuce" data-v="${o}" aria-pressed="${o === 'giorno'}"><img alt="" src="${esc(p.immagini[o])}" style="object-position:${Math.round(fx * 100)}% 50%"><span>${NOME_ORA[o].toUpperCase()}</span></button>` : `<span class="manca" title="manca">${icona(o === 'notte' ? 'luna' : o === 'giorno' ? 'sole' : o, 16)}</span>`).join('')}</div>`}
      </div>
    </div>
    ${p.yt ? '' : `<div class="pannello vista-tv" style="margin-top:12px;padding:10px 14px">${titolo('tv', 'Verso est · il TV')}
      ${p.immagini['est-giorno'] ? `<img alt="" src="${esc(p.immagini['est-giorno'])}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block">` : '<p class="nota" style="margin:0 0 8px">Questo paesaggio non ha ancora la vista per il TV: il TV mostra la stessa delle finestrelle, allargata.</p>'}
      <label class="campo" style="margin-top:10px"><span>Che cosa si vede verso est</span><input id="tvDesc" placeholder="Vuoto: lo sceglie l'AI"></label>
      <button class="btn piena" data-fai="vistaTv" data-v="${p.id}">${icona('tv', 18)}${p.immagini['est-giorno'] ? 'Rifai la vista TV' : 'Crea la vista TV'}</button></div>`}
    <button class="btn oro piena" style="margin-top:14px" data-fai="mostra" data-v="${p.id}">${icona('play', 18)}Mostra alle finestre</button>
    ${p.yt ? '' : `<div class="pannello" style="margin-top:12px;padding:6px 14px">${cursore('inquadra', 'mirino', 'Inquadratura', 0, 100, Math.round(fx * 100), fx === .5 ? 'centro' : Math.round(fx * 100) + '%')}
      <p class="nota" style="margin:0 0 6px">Se l'immagine è più larga del foro, scegli quale parte si vede. Le finestre la seguono dal vivo.</p></div>`}
    <div class="azioni">
      ${p.yt || !MODELLI_VIDEO.length ? '' : `<button class="btn" data-fai="anima" data-v="${p.id}">${icona('anima', 18)}Anima</button>`}
      ${p.yt ? '' : `<button class="btn" data-fai="cieli" data-v="${p.id}">${icona('nuvola', 18)}${['giorno','alba','tramonto','notte'].some(o => p.immagini['cielo-' + o]) ? 'Rifai il cielo' : 'Cielo che scorre'}</button>`}
      ${mancano.length ? `<button class="btn" data-fai="luci" data-v="${p.id}">${icona('alba', 18)}Luci (${mancano.length})</button>` : ''}
      ${p.yt ? '' : `<button class="btn" data-fai="riadatta" data-v="${p.id}">${icona('mirino', 18)}Riadatta</button>`}
      ${p.yt ? '' : `<button class="btn" data-fai="profondita" data-v="${p.id}">${icona('livelli', 18)}${p.immagini.profondita ? 'Rifai profondità' : 'Profondità'}</button>`}
      <button class="btn" data-fai="modifica" data-v="${p.id}">${icona('matita', 18)}Modifica</button>
      <button class="btn pericolo" data-fai="elimina" data-v="${p.id}">${icona('cestino', 18)}Elimina</button>
    </div>
    <div id="lavoroFoglio"></div>`, el => {
      let tFuoco = null;
      legaCursore('inquadra', (v, o) => {
        o.textContent = v === 50 ? 'centro' : v + '%';
        el.querySelectorAll('img').forEach(i => i.style.objectPosition = v + '% 50%');
        p.fuoco = {x: v / 100};
        if (scena.paesaggio === p.id) cambia({fuoco: p.fuoco}, false);
        clearTimeout(tFuoco); tFuoco = setTimeout(() => rinominaPaesaggio(casa, p, p.nome, p.parole, p.fuoco).then(() => { if (scheda === 'paesaggi') disegnaPaesaggi(); }).catch(e => avviso(e.message, true)), 1600);
      });
    });
}

function mostraPaesaggio(p){
  cambia(Object.assign(scenaDi(p), {acceso:true}));
  avviso('In onda: ' + p.nome);
  if (scheda === 'paesaggi') disegnaPaesaggi();
}

/* foto dal web: dettaglio e aggiunta */
function apriWeb(f){
  apriFoglio(`
    <div class="dettaglio"><div class="grande"><img alt="" src="${esc(f.miniatura)}"></div>
      <div class="info"><h3>${esc(f.titolo.slice(0, 60))}</h3>
        <p class="nota" style="margin:0">${esc(f.fonte)} · ${f.w}×${f.h}${f.verticale ? '' : ' · orizzontale: la finestra ne mostra una striscia'}</p>
        <p class="credito">${esc(f.autore || '')}${f.licenza ? ' · ' + esc(f.licenza) : ''}</p>
        <label class="campo"><span>Nome</span><input id="webNome" maxlength="40" value="${esc(f.titolo.slice(0, 40))}"></label>
        <label class="campo"><span>Parole chiave</span><input id="webParole" value="${esc(paroleChiave(cercaWebTesto, f.titolo).join(', '))}"></label>
      </div></div>
    <button class="btn oro piena" style="margin-top:12px" data-fai="aggiungiWeb">${icona('importa', 18)}Aggiungi alla libreria</button>
    <p class="nota">La salvo nel deposito della stanza e calcolo la sua profondità sul telefono (la prima volta scarica il modello, ~25 MB). Le altre luci del giorno le puoi poi creare con l'AI.</p>
    <div id="lavoroFoglio"></div>`);
  foglioAperto = f;
}

/* ═══════════ CREA: paesaggi dipinti con l'AI ═════════════════════════════ */
const STILI = [
  {id:'painterly', nome:'Pittorico', nota:'Realismo cinematografico. Il più vicino a una finestra vera.',
   tela:'radial-gradient(60% 50% at 70% 30%,#ffd98a 0,#e8a04a 25%,transparent 60%),linear-gradient(180deg,#5d7fb0 0,#d89a5e 55%,#3c4a2a 56%,#1f2a17 100%)',
   prefisso:'Cinematic painterly fantasy art, photorealistic detail, warm palette with golden hour lighting, dramatic atmosphere, hyperrealistic textures, oil-painted highlights'},
  {id:'classic_oil', nome:'Olio classico', nota:'Pennellate visibili, ambra e oro. Si vede che è un dipinto.',
   tela:'repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 3px,transparent 3px 7px),linear-gradient(180deg,#8a6a3a 0,#e0b060 45%,#5a3d1e 58%,#2a1c0e 100%)',
   prefisso:'Classic oil painting on canvas, visible impasto brushstrokes, rich amber and gold palette, romantic landscape composition, evocative of Frank Frazetta and Caspar David Friedrich'},
  {id:'inked', nome:'A china', nota:'Xilografia gotica con accenti rossi. Per le serate a tema.',
   tela:'radial-gradient(18% 14% at 72% 30%,#b3261e 0,#b3261e 60%,transparent 62%),repeating-linear-gradient(45deg,#1a1a1a 0 1.5px,#e9e2d0 1.5px 4px)',
   prefisso:'Dark ink illustration in the style of woodcut engraving, dense crosshatching, monochrome with red accents, gothic etched line art, evocative of Berserk and Gustave Doré'}
];
/* [nome, vista nord (le finestrelle), vista est (il TV): un altro soggetto della stessa terra] */
const IDEE = [
  ['Valle col castello', 'Una valle verde con un castello medievale su una collina, un fiume che serpeggia, colline e boschi fino all\'orizzonte', 'Un villaggio di case di pietra lungo lo stesso fiume, con un mulino ad acqua e un ponte di pietra ad arco'],
  ['Campagna romana', 'Campagna laziale con i resti di un acquedotto romano, pini marittimi, pecore lontane, colli all\'orizzonte', 'Le rovine di una villa romana tra gli ulivi, colonne spezzate e un piccolo tempio su un poggio'],
  ['Borgo sul lago', 'Un borgo medievale di pietra sulla riva di un lago tra le montagne, tetti di coppi, un campanile, fumo dai camini', 'Un castello su un isolotto dello stesso lago, legato alla riva da un lungo ponte di legno, barche di pescatori'],
  ['Foresta antica', 'Una foresta di querce e faggi secolari, un ruscello tra le rocce, luce che filtra tra i rami', 'Una radura nella stessa foresta con un antico cerchio di pietre e una cascata che scende da una rupe muschiosa'],
  ['Scogliera sul mare', 'Una costa rocciosa sul mare aperto, una torre di avvistamento sul promontorio, onde che si infrangono', 'Un porto di pescatori nella baia vicina, case di pietra, barche a vela latina e un faro sul molo'],
  ['Montagne innevate', 'Picchi innevati sopra una valle alpina, un villaggio di legno con il fumo dai camini, abeti', 'Un monastero arroccato su una rupe sopra la stessa valle, un ghiacciaio e un sentiero che sale tra gli abeti'],
  ['Abbazia nella nebbia', 'Un\'abbazia romanica su un colle, cipressi, colline che sfumano nella nebbia del mattino', 'Un borgo fortificato su un colle vicino, con le mura, una porta e una torre, vigneti sui pendii'],
  ['Città dalle torri', 'Una città medievale con molte torri di pietra su una collina, campagna coltivata intorno, strade bianche', 'Un castello con un lago ai suoi piedi e un mulino a vento sulla collina, campi di grano']
];
const LUCI = {
  giorno:'Time of day: clear daytime, soft natural daylight from a high sun.',
  alba:'Change only the time of day to dawn: the sun just rising at the horizon, warm pink and orange light, long soft shadows, light mist in the valleys.',
  tramonto:'Change only the time of day to sunset: low golden-orange sun near the horizon, warm glowing sky, long shadows, deepening blue on the opposite side.',
  notte:'Change only the time of day to night: a clear night lit by moonlight, deep blue tones, stars visible, very dark but readable shapes; if there are buildings, a few windows glow with warm candlelight.'
};
const ELEMENTI = [['nuvole','nuvola','Nuvole','clouds slowly drifting across the sky'], ['alberi','albero','Alberi','tree leaves and branches swaying softly in a light breeze'],
  ['acqua','onda','Acqua','the river and water flowing and glittering naturally'], ['fumo','fiamma','Fumo','thin smoke rising slowly from the chimneys'],
];
/* ⚠ 30/10: nebbia e uccelli non si chiedono più all'AI. Nel video la nebbia nasce a metà e al giro sparisce,
   e gli uccelli compaiono in mezzo al cielo dal nulla (Maurizio: «compaiono e scompaiono dal nulla»).
   Li disegna la finestra: gli uccelli entrano da un bordo ed escono dall'altro, la nebbia è quella del meteo. */
const ELEMENTI_FINESTRA = 'Uccelli e nebbia li disegna la finestra (gli uccelli col bel tempo, la nebbia dal meteo): così non compaiono e spariscono a ogni giro.';
function promptBase(descrizione, stile){
  const s = STILI.find(x => x.id === stile) || STILI[0];
  return `${s.prefisso}.
A very tall and narrow vertical view (portrait format, 2 wide by 5 high, like a slit window) of the landscape seen from a high window of a medieval house, looking out at: ${descrizione}.
The picture IS the view itself: no window frame, no walls, no curtains, no sill, nothing of the room in the foreground.
Compose for this narrow vertical frame: the main subject is fully visible and centered in the width, never cut by the left or right edge; a generous sky in the upper part, the landscape descending toward the viewer in the lower part; natural eye-level perspective, believable scale and deep atmospheric distance with several layers (near, middle, far).
No people in the foreground, no text, no signature, no watermark, no border, no vignette.
${LUCI.giorno}`;
}
/* ⚠ 30/10 · DUE VISTE (Maurizio, 29/10: finestrelle verso nord, TV verso est, due soggetti diversi; «mai due soli né
   due lune: al massimo compaiono in una sola delle due viste»). Quando il paesaggio ha anche la vista per il TV, il sole
   sta dove starebbe davvero: all'alba sorge a est (nel TV; a nord se ne vede solo il chiarore, da destra), al tramonto
   cala a ovest (alle spalle del TV e a sinistra delle finestrelle: nessuna delle due lo vede); la luna resta a nord. */
const LUCI_NORD_TV = {
  alba:'Change only the time of day to dawn: the sun is rising out of frame to the right (east), so the sun disc itself is NOT visible; warm pink and orange light comes from the right, long soft shadows, light mist in the valleys.',
  tramonto:'Change only the time of day to sunset: the sun is setting out of frame to the left (west), so the sun disc itself is NOT visible; warm golden-orange light from the left, glowing sky on the left side, deepening blue on the right.'
};
const LUCI_EST = {
  giorno:'Clear daytime, soft natural daylight; the sun disc is not visible in this view.',
  alba:'Change only the time of day to dawn: the sun just rising at the horizon, slightly off-centre, warm pink and orange light, long soft shadows toward the viewer, light mist in the valleys.',
  albaSenzaSole:'Change only the time of day to dawn: a warm pink and orange glow at the horizon, long soft shadows, light mist in the valleys; the sun disc itself is not visible.',
  tramonto:'Change only the time of day to sunset: the sun is setting behind the viewer (west), so no sun disc is visible; the land and the buildings glow warm orange-pink in the last light, long shadows stretch away from the viewer toward the horizon, the sky above the horizon is pink and violet.',
  notte:'Change only the time of day to night: a clear night with soft moonlight coming from the left, but no moon disc visible in this view; deep blue tones, stars visible, very dark but readable shapes; if there are buildings, a few windows glow with warm candlelight.'
};
const promptLuce = (ora, conTv = false) => `Same exact view and composition as the input image: every hill, building, tree and river stays in the same place, same framing, same style. ${(conTv && LUCI_NORD_TV[ora]) || LUCI[ora]} Do not add a window frame, text or borders.`;
const promptLuceEst = (ora, conSole) => `Same exact view and composition as the input image: every hill, building, tree and river stays in the same place, same wide framing, same style. ${LUCI_EST[ora === 'alba' && !conSole ? 'albaSenzaSole' : ora]} Do not add a window frame, text or borders.`;
const promptEst = desc => `The input image is the view from a high window of a medieval house looking NORTH. Paint the view from the same house looking EAST, 90 degrees to the right of it, as one wide landscape picture (16:9, like a large window).
It is the same land seen in another direction: same region, same kind of terrain, vegetation and architecture, same weather, same time of day, same painting style, palette and level of detail, and the horizon at the same height. The main subject of the input image is NOT in this view (it stays far to the left, out of frame).
The main subject of this view, fully visible and centered in the width: ${desc || 'a different landmark that belongs to this same land (for example a village, a bridge on a river, a monastery or a distant castle), chosen to complement the input view'}.
A generous sky in the upper part, the land descending toward the viewer in the lower part, natural eye-level perspective, deep atmospheric distance with several layers (near, middle, far).
The picture IS the view itself: no window frame, no walls, no curtains, nothing of the room. No people in the foreground, no text, no signature, no watermark, no border, no vignette.
${LUCI_EST.giorno}`;
/* ⚠ 30/10 · CIELO CHE SCORRE. Maurizio: «le nuvole quando reinizia il loop si spostano pesantemente».
   Nuvole che vanno sempre da una parte non possono stare in un video breve che gira (alla fine sono altrove).
   Per questo il cielo è un'immagine panoramica a parte, che si ripete senza cuciture e la finestra fa scorrere
   all'infinito dietro torri e colline (anche da una trifora all'altra). Niente sole né luna: scorrerebbero. */
const promptCielo = `Paint ONLY the sky of this image, as one very wide panoramic strip of sky. Same painting style, same light, same colors and the same kind of clouds as the sky in the image. No ground, no hills, no mountains, no buildings, no trees, no horizon line, no sun, no moon, no stars, no birds, no text, no frame, no border. Clouds spread across the whole width, varied in size and shape, with open sky between them. The bottom of the strip is the pale, hazy sky just above the horizon, the same color as the image right above the hills; the top is the deeper color of the top of the image's sky. Even lighting across the whole width, so the strip can repeat side by side.`;
const promptRiadatta = `Recompose this exact landscape into a very tall and narrow vertical frame (2 wide by 5 high, like a slit window): same place, same style, same light. The main subject (for example the castle or the village) must be fully visible and centered in the width, never cut by the edges. Extend the sky above and the foreground below naturally. No window frame, no text, no borders.`;
const promptAnima = (el, sec) => `[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image1] A single continuous, unbroken shot of about ${sec} seconds, no scene cuts, of exactly this landscape. Locked-off static camera on a tripod: the camera does not move at all (no pan, no tilt, no zoom, no dolly, no shake). Gentle, natural, real-time motion only: ${el.map(e => (ELEMENTI.find(x => x[0] === e) || [])[3]).filter(Boolean).join('; ')}. Buildings, towers, rocks, mountains, fields and the ground stay perfectly still and identical in every frame, with no shimmering. Everything that moves keeps the same slow speed and direction for the whole clip. No birds, no mist or fog appearing, growing or fading, no new clouds popping in, no light change. Same framing, light and colors as the image for the whole clip. No people, no animals, no text, no dialogue, no music. Use this image as the first frame and the last frame.`;

/* un lavoro lungo alla volta (creare, animare, aggiungere luci): i passi si vedono dove serve */
let lavoro = null;
function passo(id, cls, testo){
  if (!lavoro) return;
  const p = lavoro.passi.find(x => x.id === id);
  if (p){ p.cls = cls; p.testo = testo; } else lavoro.passi.push({id, cls, testo});
  disegnaLavoro();
}
function disegnaLavoro(){
  const posti = [$('#lavoroCrea'), $('#lavoroFoglio')].filter(Boolean);
  const html = !lavoro ? '' : `
    ${lavoro.errore ? `<div class="errore-box">${esc(lavoro.errore)}</div>` : ''}
    ${problema && lavoro.finito ? '<div class="problema"></div>' : ''}
    <ul class="passi">${lavoro.passi.map(p => `<li class="${p.cls}">${icona(p.cls === 'fatto' ? 'spunta' : p.cls === 'errore' ? 'chiudi' : p.cls === 'ora' ? 'ricarica' : 'orologio', 16)}<span>${esc(p.testo)}</span></li>`).join('')}</ul>
    ${lavoro.av != null ? `<div class="barra-av"><i style="width:${Math.round(lavoro.av)}%"></i></div>` : ''}
    ${Object.keys(lavoro.anteprime).length ? `<div class="anteprime">${['giorno','alba','tramonto','notte'].filter(o => lavoro.anteprime[o]).map(o => `<figure><img alt="" src="${esc(lavoro.anteprime[o].url)}" style="opacity:${lavoro.anteprime[o].bozza ? .55 : 1}"><figcaption>${NOME_ORA[o]}</figcaption></figure>`).join('')}</div>` : ''}
    ${['giorno','alba','tramonto','notte'].some(o => lavoro.anteprime['est-' + o]) ? `<div class="anteprime tv">${['giorno','alba','tramonto','notte'].filter(o => lavoro.anteprime['est-' + o]).map(o => `<figure><img alt="" src="${esc(lavoro.anteprime['est-' + o].url)}" style="opacity:${lavoro.anteprime['est-' + o].bozza ? .55 : 1}"><figcaption>TV · ${NOME_ORA[o]}</figcaption></figure>`).join('')}</div>` : ''}
    ${lavoro.fatto && lavoro.p ? `<div class="azioni"><button class="btn oro" data-fai="mostra" data-v="${lavoro.p.id}">${icona('play', 18)}Mostra</button><button class="btn" data-fai="apri" data-v="${lavoro.p.id}">${icona('quadro', 18)}Apri</button></div>` : ''}`;
  posti.forEach(el => el.innerHTML = html);
  if (problema) mostraProblema();
}
async function conLavoro(nome, fn){
  if (lavoro && !lavoro.finito){ avviso('C\'è già un lavoro in corso: aspetta che finisca.', true); return; }
  lavoro = {nome, passi:[], anteprime:{}, av:null, errore:null, fatto:false, finito:false, p:null};
  disegnaLavoro();
  let blocco = null; try { blocco = await navigator.wakeLock?.request('screen'); } catch(e) {}
  try { await fn(lavoro); lavoro.fatto = true; }
  catch(e) { lavoro.errore = e.message; segnala(e); }
  finally { lavoro.finito = true; lavoro.av = null; try { blocco && blocco.release(); } catch(e) {} disegnaLavoro(); setTimeout(profonditaInSottofondo, 3000); }
}
const misuraDi = async blob => { const b = await createImageBitmap(blob); return {w:b.width, h:b.height, openai: Math.abs(b.width / b.height - .4) < .03 ? '832x2080' : '1024x1536'}; };

/* le altre luci: della vista nord (le finestrelle) o, con o.est, della vista est (il TV) */
async function faiLuci(p, foto, ore, misura, o = {}){
  let reti = 0;
  const pre = o.est ? 'est-' : '', eti = ora => (o.est ? 'TV · ' : '') + NOME_ORA[ora][0].toUpperCase() + NOME_ORA[ora].slice(1);
  for (const ora of ore){
    const k = pre + ora;
    passo(k, 'ora', eti(ora) + ': stessa vista, altra luce…');
    try {
      const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt: o.est ? promptLuceEst(ora, o.conSole) : promptLuce(ora, o.conTv), foto, misura: o.est ? 'tv' : misura,
        bozza: b64 => { lavoro.anteprime[k] = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
      const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
      p.immagini[k] = o.est ? await caricaEst(casa, p, ora, jpg) : await caricaLuce(casa, p, ora, jpg);
      risolto(Ai.modello(imp.modello).fornitore === 'google' ? 'Google' : 'OpenAI');
      lavoro.anteprime[k] = {url:p.immagini[k]}; passo(k, 'fatto', eti(ora));
    } catch(e) {
      if (e.tipo === 'rete'){
        lavoro.errore = e.message; reti++;
        passo(k, 'errore', eti(ora) + ': connessione interrotta');
        if (reti >= 2){ ore.slice(ore.indexOf(ora) + 1).forEach(o2 => passo(pre + o2, '', eti(o2) + ': non provata')); break; }   /* la rete non regge: inutile insistere */
        continue;
      }
      passo(k, 'errore', eti(ora) + ': ' + e.message);
      if (e.tipo === 'credito' || e.tipo === 'chiave'){                 /* inutile provare le altre: si fermano qui */
        ore.slice(ore.indexOf(ora) + 1).forEach(o2 => passo(pre + o2, '', eti(o2) + ': non provata'));
        segnala(e); break;
      }
    }
  }
}
/* il cielo panoramico: uno per ogni luce che il paesaggio ha, dipinto guardando il cielo di quella luce,
   poi cucito ai lati (gli ultimi due decimi sfumano nei primi) perché ripetendosi non si veda la giunta */
async function cucitoAiLati(blob){
  const b = await createImageBitmap(blob), W = b.width, H = b.height, o = Math.round(W * .22), L = W - o;
  const c = document.createElement('canvas'); c.width = L; c.height = H; const x = c.getContext('2d');
  x.drawImage(b, 0, 0, L, H, 0, 0, L, H);                                   /* la parte centrale così com'è */
  const t = document.createElement('canvas'); t.width = o; t.height = H; const tx = t.getContext('2d');
  tx.drawImage(b, L, 0, o, H, 0, 0, o, H);                                  /* la coda… */
  const g = tx.createLinearGradient(0, 0, o, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, 0, o, H);
  x.drawImage(t, 0, 0);                                                      /* …sfuma nell'inizio */
  return await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
}
async function faiCieli(p){
  const ore = ['giorno','alba','tramonto','notte'].filter(o => p.immagini[o]);
  for (const ora of ore){
    const k = 'cielo-' + ora, nomeOra = NOME_ORA[ora][0].toUpperCase() + NOME_ORA[ora].slice(1);
    passo(k, 'ora', `Cielo che scorre · ${nomeOra.toLowerCase()}: lo dipingo largo…`);
    try {
      const foto = await (await fetch(p.immagini[ora])).blob();
      const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptCielo, foto, misura:'orizzontale',
        bozza: b64 => { lavoro.anteprime[k] = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
      const jpg = await cucitoAiLati(b64aBlob(r.b64, r.mime));
      p.immagini[k] = await caricaCielo(casa, p, ora, jpg);
      lavoro.anteprime[k] = {url:p.immagini[k]}; passo(k, 'fatto', 'Cielo che scorre · ' + nomeOra.toLowerCase());
    } catch(e) {
      passo(k, 'errore', 'Cielo · ' + NOME_ORA[ora] + ': ' + e.message);
      if (e.tipo === 'credito' || e.tipo === 'chiave'){ segnala(e); break; }
    }
  }
}
async function faiProfondita(p, foto, est = false){
  const k = est ? 'est-prof' : 'prof', eti = est ? 'TV · profondità' : 'Profondità';
  passo(k, 'ora', eti + ': la calcolo sul telefono…');
  try {
    const png = await calcolaProfondita(foto, pc => passo(k, 'ora', eti + ': scarico il modello ' + pc + '%'));
    if (est) p.immagini['est-profondita'] = await caricaEst(casa, p, 'profondita', png);
    else p.immagini.profondita = await caricaProfondita(casa, p, png);
    passo(k, 'fatto', eti);
  } catch(e) { passo(k, 'errore', eti + ' non calcolata (la finestra fa da sé): ' + e.message); }
}
/* la vista per il TV (verso est): dipinta guardando quella nord, così è la stessa terra con la stessa luce e lo
   stesso stile; poi le stesse luci del giorno che ha la vista nord e la sua profondità. Il cielo che scorre è lo
   stesso delle finestrelle (è lo stesso cielo). Il mini PC la porta al 4K vero (pi/cuci-animazione.py) */
async function faiVistaEst(p, fotoNord, descrizione, conSole){
  passo('est-giorno', 'ora', 'TV · vista verso est: la dipingo…');
  const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptEst(descrizione), foto:fotoNord, misura:'tv',
    bozza: b64 => { lavoro.anteprime['est-giorno'] = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
  const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
  p.immagini['est-giorno'] = await caricaEst(casa, p, 'giorno', jpg);
  lavoro.anteprime['est-giorno'] = {url:p.immagini['est-giorno']}; passo('est-giorno', 'fatto', 'TV · vista verso est');
  aggiornaInLibreria(p);
  await faiLuci(p, jpg, ['alba','tramonto','notte'].filter(o => p.immagini[o]), null, {est:true, conSole});
  aggiornaInLibreria(p);
  await faiProfondita(p, jpg, true);
}
async function faiAnimazione(p, foto, ora, elementi){
  const mv = MODELLI_VIDEO.find(m => m.id === imp.video.modello) || MODELLI_VIDEO[0];
  passo('anim', 'ora', `Animazione con ${mv.nome}: in coda…`); lavoro.av = 0;
  const mp4 = await Ai.anima({chiave:imp.chiavi.google, modello:mv.id, foto, fuoco:p.fuoco, prompt:promptAnima(elementi, imp.video.secondi),
    progresso:(pc, st) => { lavoro.av = pc; passo('anim', 'ora', `Animazione con ${mv.nome}: ${st === 'invio' ? 'la mando' : st === 'scarico' ? 'la scarico' : 'la sta girando'}… ${Math.round(pc)}%`); }});
  passo('anim', 'ora', 'Animazione: la salvo…');
  p.animati[ora] = await caricaAnimazione(casa, p, ora, mp4);
  lavoro.av = null; passo('anim', 'fatto', 'Animazione (' + imp.video.secondi + ' s, in loop)');
  /* subito: che cosa resta fermo e che cosa si muove (così le finestre non tremano mai); il video a piena
     qualità lo rifà poi il Raspberry, con calma */
  passo('fermo', 'ora', 'Animazione: separo quello che si muove da quello che sta fermo…');
  try {
    const r = await Fermo.analizza(mp4, pc => passo('fermo', 'ora', `Animazione: separo quello che si muove da quello che sta fermo… ${Math.round(pc)}%`));
    p.immagini['fermo-' + ora] = await caricaFermo(casa, p, ora, r.fermo);
    p.immagini['maschera-' + ora] = await caricaMaschera(casa, p, ora, r.maschera);
    passo('fermo', 'fatto', `Paesaggio fermo, ${r.parteViva > .01 ? 'vivo dove si muove davvero (' + Math.round(r.parteViva * 100) + '%)' : 'nessuna parte viva oltre al cielo'}`);
  } catch(e) { passo('fermo', 'errore', 'Separazione non riuscita (la farà il Raspberry): ' + e.message); }
}
function aggiornaInLibreria(p){
  const i = libreria.findIndex(x => x.id === p.id);
  if (i >= 0) libreria[i] = p; else libreria.unshift(p);
  if (scena.paesaggio === p.id){ Object.assign(scena, scenaDi(p)); mandaScena(); }
}

async function crea(){
  const nome = ($('#creaNome').value.trim() || $('#creaDesc').value.trim().split(/[,.]/)[0].slice(0, 40) || 'Paesaggio');
  const descrizione = $('#creaDesc').value.trim();
  if (!descrizione){ avviso('Scrivi che cosa si vede, o tocca un\'idea.', true); return; }
  const m = Ai.modello(imp.modello);
  if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave ' + (m.fornitore === 'google' ? 'Google' : 'OpenAI') + ': mettila nelle Impostazioni.', true); return; }
  await conLavoro('crea', async L => {
    const p = {id: Date.now().toString(36), tipo: imp.stile, nome, parole: paroleChiave(nome, descrizione), immagini:{}, animati:{}, file:[], fuoco:null, creato: Date.now()};
    passo('giorno', 'ora', 'Giorno: lo sto dipingendo con ' + m.nome + '…');
    const r = await Ai.crea({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptBase(descrizione, imp.stile),
      bozza: b64 => { L.anteprime.giorno = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
    const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
    p.immagini.giorno = await caricaLuce(casa, p, 'giorno', jpg);
    L.anteprime.giorno = {url:p.immagini.giorno}; passo('giorno', 'fatto', 'Giorno'); L.p = p;
    aggiornaInLibreria(p);
    const misura = m.fornitore === 'openai' ? r.misura : null;
    const conTv = imp.tv !== false, descEst = conTv && $('#creaEst') ? $('#creaEst').value.trim() : '';
    await faiLuci(p, jpg, ['alba','tramonto','notte'].filter(o => imp.luci[o]), misura, {conTv});
    aggiornaInLibreria(p);
    await faiProfondita(p, jpg); aggiornaInLibreria(p);
    if (conTv){ try { await faiVistaEst(p, jpg, descEst, true); aggiornaInLibreria(p); } catch(e) { passo('est-giorno', 'errore', 'TV · vista verso est: ' + e.message); segnala(e); } }
    if (imp.cielo !== false){ await faiCieli(p); aggiornaInLibreria(p); }
    if (imp.anima){ try { await faiAnimazione(p, jpg, 'giorno', imp.elementi); aggiornaInLibreria(p); } catch(e) { passo('anim', 'errore', 'Animazione: ' + e.message); segnala(e); } }
  });
}

function disegnaCrea(){
  const s = $('#s-crea'); const m = Ai.modello(imp.modello), mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0] || {nome:'', euroSecondo:0};
  const nLuci = ['alba','tramonto','notte'].filter(o => imp.luci[o]).length;
  const unaVista = (m.costo[imp.qualita] || m.costo.alta) * (1 + nLuci * 1.15);
  const costo = unaVista * (imp.cielo !== false ? 2 : 1) + (imp.tv !== false ? unaVista * 1.3 : 0) + (imp.anima ? mv.euroSecondo * imp.video.secondi : 0);
  const desc = $('#creaDesc') ? $('#creaDesc').value : '', nome = $('#creaNome') ? $('#creaNome').value : '', descEst = $('#creaEst') ? $('#creaEst').value : '';
  s.innerHTML = testa('scintilla', 'Crea', 'Un paesaggio nuovo, dipinto dall\'AI') + `<div class="problema" hidden></div>
    <div class="pannello" style="display:flex;align-items:center;gap:12px">${icona('tavolozza', 22)}<div style="flex:1;min-width:0"><b style="font:500 12.5px var(--display);letter-spacing:.1em;text-transform:uppercase">${esc(m.nome)}</b><div class="nota" style="margin:0">qualità ${esc(imp.qualita)}${imp.chiavi[m.fornitore] ? '' : ' · manca la chiave'}</div></div><button class="btn piccolo" data-fai="vaiImp">Cambia</button></div>
    <div class="sezione">${titolo('tavolozza', 'Stile', 'quelli di DMaster')}
      <div class="stili">${STILI.map(st => `<button class="stile" data-fai="stile" data-v="${st.id}" aria-pressed="${imp.stile === st.id}"><div class="tela" style="background:${st.tela}"></div><b>${st.nome}</b><small>${st.nota}</small></button>`).join('')}</div></div>
    <div class="sezione">${titolo('occhio', 'Che cosa si vede')}
      <label class="campo"><span>Nome</span><input id="creaNome" maxlength="40" placeholder="Es. Valle col castello" value="${esc(nome)}"></label>
      <label class="campo"><span>Descrizione</span><textarea id="creaDesc" placeholder="Descrivi il paesaggio fuori dalla finestra, anche in poche parole.">${esc(desc)}</textarea></label>
      <div class="pillole">${IDEE.map(([n], i) => `<button class="pillola" data-fai="idea" data-v="${i}">${esc(n)}</button>`).join('')}</div></div>
    <div class="sezione">${titolo('tv', 'Verso est · il TV', 'un altro soggetto, stessa terra')}
      <div class="pannello" style="padding:2px 14px">${interruttore('tvToggle', 'tv', 'Vista per il TV', 'Larga 16:9, portata al 4K dal mini PC · stessa ora, stesso tempo, stesso cielo delle finestrelle', imp.tv !== false)}</div>
      ${imp.tv !== false ? `<label class="campo" style="margin-top:12px"><span>Che cosa si vede verso est</span><textarea id="creaEst" placeholder="Il secondo soggetto, al centro del TV (es. un villaggio sul fiume). Vuoto: lo sceglie l'AI.">${esc(descEst)}</textarea></label>
      <p class="nota">Il sole sta dove starebbe davvero: all'alba sorge nel TV, al tramonto non si vede in nessuna delle due viste, la luna solo nelle finestrelle.</p>` : ''}</div>
    <div class="sezione">${titolo('alba', 'Le luci del giorno')}
      <div class="scelte c4">${['giorno','alba','tramonto','notte'].map(o => `<button class="scelta" data-fai="luce" data-v="${o}" aria-pressed="${o === 'giorno' || !!imp.luci[o]}" ${o === 'giorno' ? 'disabled style="opacity:1"' : ''}>${icona(o === 'giorno' ? 'sole' : o === 'notte' ? 'luna' : o, 22)}<span>${NOME_ORA[o]}</span></button>`).join('')}</div>
      <p class="nota">Alba, tramonto e notte sono lo stesso paesaggio con un'altra luce: quando cambia l'ora, le finestre sfumano dall'una all'altra senza cambiare vista.</p></div>
    <div class="sezione">${titolo('nuvola', 'Cielo che scorre')}
      <div class="pannello" style="padding:2px 14px">${interruttore('cieloToggle', 'nuvola', 'Cielo panoramico', 'Le nuvole scorrono senza fine dietro il paesaggio, mai un salto · un\'immagine in più per luce', imp.cielo !== false)}</div></div>
    ${MODELLI_VIDEO.length ? `<div class="sezione">${titolo('anima', 'Movimento vero')}
      <div class="pannello" style="padding:2px 14px">${interruttore('animaToggle', 'anima', 'Animalo con ' + mv.nome, `${imp.video.secondi} secondi in loop · ≈ ${euro(mv.euroSecondo * imp.video.secondi)}`, imp.anima)}
        ${imp.anima ? `<div class="pillole" style="margin:0 0 12px">${ELEMENTI.map(([v, ic, t]) => `<button class="pillola" data-fai="elemento" data-v="${v}" aria-pressed="${imp.elementi.includes(v)}">${icona(ic, 15)}${t}</button>`).join('')}</div>` : ''}</div></div>`
      : `<div class="sezione">${titolo('nuvola', 'Movimento')}<p class="nota" style="margin-top:0">Le finestre muovono da sé nuvole e alberi su ogni paesaggio. I video brevi in loop fatti dall'AI arrivano appena è pronto il nuovo modello di Google.</p></div>`}
    <div class="sezione">
      <button class="btn oro piena" data-fai="crea" ${lavoro && !lavoro.finito ? 'disabled' : ''}>${icona('scintilla', 18)}Crea · ≈ ${euro(costo)}</button>
      <p class="nota">Ci vogliono 1-3 minuti${imp.anima ? ' più qualche minuto per l\'animazione' : ''}: tieni il telefono acceso su questa pagina.</p>
      <div id="lavoroCrea"></div></div>`;
  disegnaLavoro(); aggiornaSpia(); mostraProblema();
}

/* ═══════════ IMPOSTAZIONI ════════════════════════════════════════════════ */
function campoChiave(id, nome, segnaposto, valore, nota){
  return `<label class="campo"><span>${esc(nome)}</span><div class="chiave"><input id="${id}" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(segnaposto)}" value="${esc(valore)}"><button type="button" data-fai="vediChiave" data-v="${id}" aria-label="Mostra">${icona('occhio', 18)}</button></div></label>${nota ? '<p class="nota" style="margin-top:-4px">' + nota + '</p>' : ''}`;
}
function disegnaImpostazioni(){
  const s = $('#s-impostazioni'), a = assettoOPredefinito();
  const nomi = a.n === 2 ? ['sinistra', 'destra'] : ['sinistra'];
  const fori = nomi.map(nm => { const f = a.finestre[nm], sc = schermoDi(nm), t = a.n === 2 ? 'Finestra ' + nm : 'La finestra';
    return `<div class="pannello" style="margin-top:10px"><div class="titolo" style="margin-bottom:4px">${icona('monofora', 15)}${t}<small>schermo ${sc.w}×${sc.h}</small></div>
      ${cursore('fx' + nm, 'destra', 'Da sinistra', 0, 100, (f.x * 100).toFixed(1), (f.x * 100).toFixed(1) + '%', .1)}
      ${cursore('fy' + nm, 'giu', 'Dall\'alto', 0, 100, (f.y * 100).toFixed(1), (f.y * 100).toFixed(1) + '%', .1)}
      ${cursore('fw' + nm, 'mirino', 'Larghezza', 2, 100, (f.w * 100).toFixed(1), (f.w * 100).toFixed(1) + '%', .1)}
      ${cursore('fh' + nm, 'mirino', 'Altezza', 2, 100, (f.h * 100).toFixed(1), (f.h * 100).toFixed(1) + '%', .1)}</div>`; }).join('');
  const linkPi = new URL('../finestra/' + (casa ? '?casa=' + casa : ''), location.href).href, linkTel = location.origin + location.pathname + (casa ? '?casa=' + casa : '');
  const ruoli = {proprietario:'Tu (proprietario)', comando:'DMaster', schermo:'Schermo', lavoratore:'Rifinitura dei video'};
  const sezAccount = `<div class="sezione">${titolo('persona', 'Account e stanza', account ? (account.email || '') : 'non sei entrato')}
    <div class="pannello">${accessoStato === 'controllo' ? '<p class="nota" style="margin:0">Controllo l\'accesso…</p>'
      : !account ? `<p class="nota" style="margin-top:0">Entra con la tua email (un codice, niente password): la stanza diventa tua e le immagini private.</p>
          <button class="btn oro piena" data-fai="apriBenvenuto">${icona('posta', 18)}Entra</button>`
      : !casaPrivata ? `<p class="nota" style="margin-top:0">Questa stanza usa ancora il vecchio link.</p><button class="btn oro piena" data-fai="apriBenvenuto">${icona('chiave', 18)}Collega la stanza al mio account</button>`
      : `<ul class="membri">${membri.map(m => `<li><span><b>${esc(m.ruolo === 'proprietario' ? (account.email || 'Tu') : (m.nome || ruoli[m.ruolo] || m.ruolo))}</b><small>${esc(ruoli[m.ruolo] || m.ruolo)}</small></span>${m.ruolo === 'proprietario' ? '' : `<span class="azioni-riga"><button class="btn piccolo" data-fai="accRinomina" data-v="${esc(m.utente)}">Rinomina</button><button class="btn piccolo pericolo" data-fai="accTogli" data-v="${esc(m.utente)}">Togli</button></span>`}</li>`).join('')}</ul>
          <button class="btn oro piena" style="margin-top:12px" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi schermo</button>
          ${vecchio ? `<div class="azioni"><button class="btn" data-fai="accMostraCodici">${icona('schermo', 18)}Mostra il QR sugli schermi accesi</button><button class="btn" data-fai="accCopia">${icona('ricarica', 18)}Ricopia le immagini</button></div>
          <div class="vecchio-link"><b>${icona('avviso', 16)}Vecchio link ancora aperto</b><span>Chi ha il vecchio link comanda le finestre e vede le immagini. Quando tutti gli schermi (e DMaster) sono nella stanza, chiudilo.</span>
            <button class="btn piccolo pericolo" data-fai="accChiudiVecchio">Chiudi il vecchio link</button></div>` : '<p class="nota">Stanza privata: la vedono solo i membri qui sopra.</p>'}`}
      ${account ? `<div class="azioni"><button class="btn piccolo" data-fai="accEsci">Esci da questo telefono</button><button class="btn piccolo" data-fai="accEsciOvunque">Esci da tutti i dispositivi</button></div>` : ''}
      <div id="lavoroFoglio"></div></div></div>`;
  s.innerHTML = testa('manopole', 'Impostazioni', 'Modelli, chiavi e finestre') + `<div class="problema" hidden></div>${sezAccount}
    <div class="sezione">${titolo('tavolozza', 'AI per le immagini')}
      <div class="scelte">${MODELLI_IMMAGINE.map(m => `<button class="scelta riga" data-fai="modello" data-v="${m.id}" aria-pressed="${imp.modello === m.id}">${icona(m.fornitore === 'google' ? 'mondo' : 'scintilla', 22)}<span><b>${esc(m.nome)}</b><small>${esc(m.note)}</small></span><span class="prezzo">≈ ${euro(m.costo[imp.qualita] || m.costo.alta)}</span></button>`).join('')}</div>
      <div class="segmenti" style="margin-top:10px">${['alta','media','bassa'].map(v => `<button data-fai="qualita" data-v="${v}" aria-pressed="${imp.qualita === v}">Qualità ${v}</button>`).join('')}</div>
      <p class="nota">Prezzi indicativi per un'immagine; le luci del giorno costano un po' di più (c'è anche l'immagine in ingresso).</p></div>
    <div class="sezione">${titolo('anima', 'AI per le animazioni')}
      ${MODELLI_VIDEO.length ? `<div class="scelte">${MODELLI_VIDEO.map(m => `<button class="scelta riga" data-fai="modelloVideo" data-v="${m.id}" aria-pressed="${imp.video.modello === m.id}">${icona('anima', 22)}<span><b>${esc(m.nome)}</b><small>${esc(m.note)}</small></span><span class="prezzo">${euro(m.euroSecondo)}/s</span></button>`).join('')}</div>
      <div class="segmenti" style="margin-top:10px">${[4, 6, 8, 10].map(v => `<button data-fai="secondi" data-v="${v}" aria-pressed="${imp.video.secondi === v}">${v} secondi</button>`).join('')}</div>`
      : `<p class="nota" style="margin-top:0">OpenAI ha spento l'API di Sora (24 settembre 2026) e Google le Veo «preview» (22 ottobre). Il successore è Gemini Omni Flash di Google: lo collego appena verificato. Userà la chiave Google qui sotto.</p>`}</div>
    <div class="sezione">${titolo('chiave', 'Chiavi', 'restano su questo telefono')}
      <div class="pannello">
        ${campoChiave('kOpenai', 'OpenAI', 'sk-…', imp.chiavi.openai, 'La stessa di DMaster. Per GPT Image.')}
        ${campoChiave('kGoogle', 'Google (Gemini)', 'AIza…', imp.chiavi.google, 'Per Nano Banana e per le animazioni (Gemini Omni). Si crea gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>.')}
        ${campoChiave('kPexels', 'Pexels (facoltativa)', 'chiave Pexels', imp.chiavi.pexels, 'Foto vere gratuite e verticali. Si chiede su <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a>.')}
      </div></div>
    <div class="sezione">${titolo('porta', 'Le finestre')}
      <div class="segmenti">${[1, 2].map(n => `<button data-fai="nFinestre" data-v="${n}" aria-pressed="${a.n === n}">${icona(n === 1 ? 'monofora' : 'bifora', 18)}${n === 1 ? 'Una finestra' : 'Due finestre'}</button>`).join('')}</div>
      <p class="nota">Ogni finestra ha il suo schermo. Qui allinei il foro di ciascuna sul suo schermo, in percento.</p>
      <div class="pannello" style="margin-top:10px;padding:2px 14px">${interruttore('bordi', 'mirino', 'Mostra i bordi sulle finestre', 'Una cornice tratteggiata per allineare ogni foro al traforo', mostraBordi)}</div>
      ${fori}
      <div class="pannello" style="margin-top:10px">
        ${cursore('zoom', 'lente', 'Ingrandisci', 100, 200, Math.round(scena.zoom * 100), Math.round(scena.zoom * 100) + '%')}
        ${cursore('vx', 'destra', 'Sposta', -30, 30, Math.round(scena.vx * 100), Math.round(scena.vx * 100))}</div>
      <div class="pannello" style="margin-top:10px"><div class="titolo" style="margin-bottom:4px">${icona('persona', 15)}Prova la prospettiva viva</div>
        ${cursore('provaX', 'destra', 'Dove sei', -100, 100, 0, 'centro')}
        ${cursore('provaZ', 'mirino', 'Quanto vicino', -100, 100, 0, '0')}
        <p class="nota" style="margin:0 0 6px">Fai finta di muoverti nella stanza: le finestre (e l'anteprima) reagiscono come col sensore. Dopo qualche secondo tornano ferme.</p></div>
      <p class="nota">Con lo schermo girato in verticale il foro è alto e stretto. ${a.n === 2 && !schermi.destra ? 'La finestra destra non ha ancora risposto: si collega quando c\'è il secondo schermo.' : ''}</p></div>
    <div class="sezione">${titolo('catena', 'Collegamento')}
      <div class="pannello">
        <p class="nota" style="margin-top:0">Indirizzo da aprire sul Raspberry:</p><code class="link">${esc(linkPi)}</code>
        <div class="azioni"><button class="btn" data-fai="copia" data-v="${esc(linkTel)}">${icona('copie', 18)}Link per un altro telefono</button><button class="btn" data-fai="ricaricaFinestre">${icona('ricarica', 18)}Ricarica finestre</button></div>
      </div>
      <p class="nota">DMaster Atmosphere ${VERSIONE} · Illusionist · powered by DMaster Stage. Le immagini stanno nel deposito di DMaster.</p></div>`;
  for (const [id, k] of [['kOpenai','openai'], ['kGoogle','google'], ['kPexels','pexels']]){ const el = document.getElementById(id); el.oninput = () => { imp.chiavi[k] = el.value.trim(); salvaImp(); if (problema && problema.tipo === 'chiave') risolto(); }; }
  nomi.forEach(nm => {
    const lega = (id, chiave) => legaCursore(id + nm, (v, o) => { o.textContent = v.toFixed(1) + '%'; assetto = assettoOPredefinito(); assetto.finestre[nm][chiave] = v / 100; mandaFori(); });
    lega('fx', 'x'); lega('fy', 'y'); lega('fw', 'w'); lega('fh', 'h');
  });
  legaCursore('zoom', (v, o) => { o.textContent = v + '%'; cambia({zoom: v / 100}, false); });
  legaCursore('vx', (v, o) => { o.textContent = v; cambia({vx: v / 100}, false); });
  let tOcchio = null;
  const occhio = () => { const x = +$('#provaX').value / 100, z = +$('#provaZ').value / 100;
    postaAnteprima({tipo:'occhio', x, z}); clearTimeout(tOcchio); tOcchio = setTimeout(() => canale.manda('occhio', {x, z}), 60); };
  legaCursore('provaX', (v, o) => { o.textContent = v === 0 ? 'centro' : (v < 0 ? 'sinistra ' : 'destra ') + Math.abs(v); occhio(); });
  legaCursore('provaZ', (v, o) => { o.textContent = v; occhio(); });
  aggiornaSpia(); mostraProblema();
}

/* ═══════════ AZIONI (un solo ascoltatore per tutto) ══════════════════════ */
const BLOCCATE_DA_DM = new Set(['ora', 'meteo', 'fps', 'accendi', 'lampo', 'ventoAuto', 'movimento', 'prospettiva', 'prospettivaViva', 'mostra', 'vediLuce', 'nFinestre', 'bordi', 'ricaricaFinestre', 'riadatta']);
const AZIONI = {
  chiudiProblema: () => risolto(),
  chiudiFoglio: () => chiudiFoglio(),
  ora: v => cambia({ora:v}),
  meteo: v => cambia({meteo:v}),
  fps: v => cambia({fps:+v}),
  accendi: () => cambia({acceso: !scena.acceso}),
  lampo: () => { if (canale.manda('lampo')) avviso('Lampo!'); postaAnteprima({tipo:'lampo'}); },
  vaiPaesaggi: () => vai('paesaggi'), vaiCrea: () => vai('crea'), vaiImp: () => vai('impostazioni'),
  ventoAuto: () => cambia({vento: scena.vento == null ? .3 : null}),
  movimento: () => cambia({movimento: scena.movimento === false}),
  prospettiva: () => cambia({prospettiva: scena.prospettiva === false}),
  prospettivaViva: () => cambia({prospettivaViva: !scena.prospettivaViva}),
  vistaP: v => { vistaPaesaggi = v; disegnaPaesaggi(); },
  filtro: v => { filtroTipo = v; disegnaPaesaggi(); },
  apri: v => { const p = libreria.find(x => x.id === v); if (p) apriPaesaggio(p); },
  apriWeb: v => apriWeb(risultatiWeb[+v]),
  mostra: v => { const p = libreria.find(x => x.id === v); if (p){ mostraPaesaggio(p); chiudiFoglio(); } },
  vediLuce: (v, b) => { const p = libreria.find(x => x.id === foglioAperto); if (!p) return; $('#dettImg').src = p.immagini[v];
    b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (scena.paesaggio === p.id) cambia({ora: v}); },
  modifica: v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    apriFoglio(`<h3 style="font:500 16px var(--display);letter-spacing:.12em;text-transform:uppercase;margin:4px 0 8px">Modifica</h3>
      <label class="campo"><span>Nome</span><input id="modNome" maxlength="40" value="${esc(p.nome)}"></label>
      <label class="campo"><span>Parole chiave</span><input id="modParole" value="${esc((p.parole || []).join(', '))}"></label>
      <button class="btn oro piena" data-fai="salvaModifica" data-v="${p.id}">${icona('spunta', 18)}Salva</button>`);
  },
  salvaModifica: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const nome = $('#modNome').value.trim() || p.nome, parole = paroleChiave($('#modParole').value);
    try { await rinominaPaesaggio(casa, p, nome, parole); aggiornaInLibreria(p); chiudiFoglio(); disegnaPaesaggi(); avviso('Salvato'); }
    catch(e) { avviso(e.message, true); }
  },
  elimina: async (v, b) => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.innerHTML = icona('avviso', 18) + 'Sicuro? Tocca ancora'; return; }
    try { await togliPaesaggio(casa, p); libreria = libreria.filter(x => x.id !== p.id); chiudiFoglio(); disegnaPaesaggi(); avviso('Eliminato'); }
    catch(e) { avviso(e.message, true); }
  },
  luci: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni.', true); return; }
    await conLavoro('luci', async L => {
      L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
      const foto = await (await fetch(p.immagini.giorno)).blob(), mis = await misuraDi(foto);
      await faiLuci(p, foto, ['alba','tramonto','notte'].filter(o => !p.immagini[o]), m.fornitore === 'openai' ? mis.openai : null);
      aggiornaInLibreria(p);
    });
  },
  cieli: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni.', true); return; }
    await conLavoro('cieli', async L => {
      L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
      if (!p.immagini.profondita){ const foto = await (await fetch(p.immagini.giorno)).blob(); await faiProfondita(p, foto); }   /* serve a sapere dov'è il cielo */
      await faiCieli(p); aggiornaInLibreria(p);
    });
  },
  riadatta: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni.', true); return; }
    await conLavoro('riadatta', async L => {
      const foto = await (await fetch(p.immagini.giorno)).blob();
      const n = {id: Date.now().toString(36), tipo:p.tipo, nome:(p.nome + ' riadattato').slice(0, 40), parole:p.parole, immagini:{}, animati:{}, file:[], fuoco:null, creato:Date.now()};
      passo('giorno', 'ora', 'Ricompongo la vista nella forma del foro, col soggetto al centro…');
      const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptRiadatta, foto, misura:'832x2080',
        bozza: b64 => { L.anteprime.giorno = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
      const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
      n.immagini.giorno = await caricaLuce(casa, n, 'giorno', jpg); L.anteprime.giorno = {url:n.immagini.giorno}; L.p = n;
      passo('giorno', 'fatto', 'Nuovo paesaggio: «' + n.nome + '»'); aggiornaInLibreria(n);
      await faiProfondita(n, jpg); aggiornaInLibreria(n);
    });
  },
  profondita: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    await conLavoro('profondita', async L => { L.p = p; const foto = await (await fetch(p.immagini.giorno)).blob(); await faiProfondita(p, foto); aggiornaInLibreria(p); });
  },
  anima: v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0];
    const luci = ['giorno','alba','tramonto','notte'].filter(o => p.immagini[o]);
    apriFoglio(`<h3 style="font:500 16px var(--display);letter-spacing:.12em;text-transform:uppercase;margin:4px 0 4px">Anima «${esc(p.nome)}»</h3>
      <p class="nota" style="margin-top:0">${esc(mv.nome)} gira un breve video dall'immagine, con la camera ferma; le finestre lo ripetono in loop sfumando la fine nell'inizio.</p>
      ${titolo('nuvola', 'Che cosa si muove')}<div class="pillole" id="animEl">${ELEMENTI.map(([e, ic, t]) => `<button class="pillola" data-fai="elemento" data-v="${e}" aria-pressed="${imp.elementi.includes(e)}">${icona(ic, 15)}${t}</button>`).join('')}</div><p class="nota">${ELEMENTI_FINESTRA}</p>
      <div class="sezione">${titolo('orologio', 'Quale luce')}<div class="segmenti" id="animLuce">${luci.map((o, i) => `<button data-fai="animLuce" data-v="${o}" aria-pressed="${i === 0}">${NOME_ORA[o]}</button>`).join('')}</div></div>
      <button class="btn oro piena" style="margin-top:14px" data-fai="animaVia" data-v="${p.id}">${icona('anima', 18)}Anima · ${imp.video.secondi} s · ≈ ${euro(mv.euroSecondo * imp.video.secondi)}</button>
      <p class="nota">Modello e durata si cambiano nelle Impostazioni. Ci vogliono alcuni minuti: tieni il telefono acceso.</p>
      <div id="lavoroFoglio"></div>`);
    foglioAperto = p.id;
  },
  animLuce: (v, b) => b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))),
  animaVia: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    if (!imp.chiavi.google){ avviso('Serve la chiave Google (Gemini) nelle Impostazioni.', true); return; }
    const ora = ($('#animLuce [aria-pressed="true"]') || {}).dataset?.v || 'giorno';
    await conLavoro('anima', async L => {
      L.p = p; L.anteprime[ora] = {url:p.immagini[ora]};
      const foto = await (await fetch(p.immagini[ora])).blob();
      await faiAnimazione(p, foto, ora, imp.elementi); aggiornaInLibreria(p);
    });
  },
  elemento: (v, b) => { const i = imp.elementi.indexOf(v); if (i >= 0) imp.elementi.splice(i, 1); else imp.elementi.push(v); salvaImp(); b.setAttribute('aria-pressed', String(i < 0)); },
  aggiungiWeb: async () => {
    const f = foglioAperto; if (!f || !f.grande) return;
    const nome = $('#webNome').value.trim() || 'Foto', parole = paroleChiave($('#webParole').value);
    await conLavoro('web', async L => {
      passo('scarico', 'ora', 'Scarico la foto…');
      const r = await fetch(f.grande); if (!r.ok) throw new Error('Non riesco a scaricare la foto (' + r.status + ').');
      const jpg = await inJpeg(await r.blob());
      const p = {id: Date.now().toString(36), tipo:'foto', nome, parole, immagini:{}, animati:{}, file:[], fuoco:null, creato:Date.now()};
      p.immagini.giorno = await caricaLuce(casa, p, 'giorno', jpg); L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
      passo('scarico', 'fatto', 'Foto salvata nella libreria'); aggiornaInLibreria(p);
      await faiProfondita(p, jpg); aggiornaInLibreria(p);
    });
  },
  salvaYT: async () => {
    const link = $('#ytLink').value.trim();
    const id = (link.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || link.match(/^([\w-]{11})$/) || [])[1];
    if (!id){ avviso('Link di YouTube non riconosciuto.', true); return; }
    const nome = $('#ytNome').value.trim() || 'Video', parole = paroleChiave($('#ytParole').value, nome);
    try { const p = await salvaVideoYT(casa, {id, nome, parole}); libreria.unshift(p); vistaPaesaggi = 'miei'; disegnaPaesaggi(); avviso('Aggiunto: ' + nome); }
    catch(e) { avviso(e.message, true); }
  },
  stile: v => { imp.stile = v; salvaImp(); disegnaCrea(); },
  idea: v => { const [n, d, e] = IDEE[+v]; $('#creaNome').value = n; $('#creaDesc').value = d; if ($('#creaEst')) $('#creaEst').value = e || ''; },
  tvToggle: () => { imp.tv = imp.tv === false; salvaImp(); disegnaCrea(); },
  vistaTv: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni.', true); return; }
    const desc = ($('#tvDesc') || {}).value || '';
    await conLavoro('tv', async L => {
      L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
      const foto = await (await fetch(p.immagini.giorno)).blob();
      /* le luci della vista nord ci sono già, magari col sole: qui all'alba se ne vede solo il chiarore (mai due soli) */
      await faiVistaEst(p, foto, desc.trim(), false); aggiornaInLibreria(p);
    });
  },
  luce: v => { imp.luci[v] = !imp.luci[v]; salvaImp(); disegnaCrea(); },
  animaToggle: () => { imp.anima = !imp.anima; salvaImp(); disegnaCrea(); },
  cieloToggle: () => { imp.cielo = imp.cielo === false; salvaImp(); disegnaCrea(); },
  crea: () => crea(),
  modello: v => { imp.modello = v; salvaImp(); disegnaImpostazioni(); },
  qualita: v => { imp.qualita = v; salvaImp(); disegnaImpostazioni(); },
  modelloVideo: v => { imp.video.modello = v; salvaImp(); disegnaImpostazioni(); },
  secondi: v => { imp.video.secondi = +v; salvaImp(); disegnaImpostazioni(); },
  vediChiave: v => { const el = document.getElementById(v); el.type = el.type === 'password' ? 'text' : 'password'; },
  nFinestre: v => { assetto = assettoOPredefinito(); assetto.n = +v; mandaFori(); disegnaImpostazioni(); if (scheda === 'finestre') aggiornaFinestre(); },
  bordi: () => { mostraBordi = !mostraBordi; canale.manda('fori', Object.assign({mostra: mostraBordi}, assettoOPredefinito())); disegnaImpostazioni(); },
  copia: v => { navigator.clipboard?.writeText(v).then(() => avviso('Link copiato')).catch(() => avviso(v)); },
  accCodiceEmail: async () => {
    const email = ($('#accEmail') || {}).value || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())){ avviso('Scrivi un\'email valida.', true); return; }
    try { await Accesso.chiediCodiceEmail(email); scrivi('atm-email', email.trim()); emailInAttesa = email.trim(); scrivi('atm-email-attesa', emailInAttesa); disegnaImpostazioni(); avviso('Codice mandato: guarda la posta'); }
    catch(e) { avviso(e.message, true); }
  },
  accEntra: async () => {
    const cod = ($('#accCodice') || {}).value || '';
    try { await Accesso.verificaCodiceEmail(emailInAttesa, cod); emailInAttesa = ''; scrivi('atm-email-attesa', ''); avviso('Sei dentro'); chiudiFoglio(); scrivi('atm-benvenuto-visto', false); await avviaAccesso(); if (account && casaPrivata && foglioAperto !== 'conferma') apriBenvenuto(); }
    catch(e) { avviso(e.message, true); }
  },
  accAltra: () => { emailInAttesa = ''; scrivi('atm-email-attesa', ''); if (foglioAperto === 'benvenuto') apriBenvenuto(); else disegnaImpostazioni(); },
  apriBenvenuto: () => apriBenvenuto(),
  benvenutoDopo: () => { scrivi('atm-benvenuto-visto', true); chiudiFoglio(); },
  benvenutoFine: () => { scrivi('atm-benvenuto-visto', true); chiudiFoglio(); if (scheda === 'impostazioni') disegnaImpostazioni(); },
  chiudiFoglio: () => chiudiFoglio(),
  aggiungiSchermo: () => apriAggiungi(),
  codiceScritto: () => { const c = Accesso.codiceDa(($('#qrCodice') || {}).value); if (!c){ avviso('Il codice ha 6 cifre.', true); return; } fermaCamera(); confermaAggiunta(c); },
  aggiungiOra: async v => {
    try {
      const r = await Accesso.abbina(v, casaPrivata.id);
      canale.manda('abbinato', {});
      membri = await Accesso.membri(casaPrivata.id);
      apriFoglio(`<div class="benvenuto" style="text-align:center">${icona('spunta', 34)}<h3>«${esc(r.nome || 'Schermo')}» è nella tua stanza</h3>
        <p class="nota">Fra qualche secondo mostra il paesaggio. Puoi rinominarlo nelle Impostazioni.</p>
        <button class="btn oro piena" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi un altro schermo</button>
        <button class="btn piena" style="margin-top:8px" data-fai="chiudiFoglio">Fatto</button></div>`);
      foglioAperto = 'fatto';
      if (scheda === 'impostazioni') disegnaImpostazioni();
    } catch(e) { avviso(e.message, true); }
  },
  accRinomina: async v => {
    const m = membri.find(x => x.utente === v); const nome = prompt('Nome di questo membro della stanza', m ? m.nome : '');
    if (nome == null || !nome.trim()) return;
    try { await Accesso.rinomina(casaPrivata.id, v, nome.trim()); membri = await Accesso.membri(casaPrivata.id); disegnaImpostazioni(); }
    catch(e) { avviso('Nome non cambiato: ' + e.message, true); }
  },
  accEsciOvunque: async (v, b) => {
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = 'Sicuro? Tocca ancora'; return; }
    await Accesso.esci(true); location.reload();
  },
  accChiudiVecchio: async (v, b) => {
    const fuori = membri.filter(m => m.ruolo === 'schermo').length;
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = `Sicuro? Restano solo i ${fuori} schermi nella stanza`; return; }
    await conLavoro('chiudi', async L => {
      passo('chiudi', 'ora', 'Chiudo il vecchio link…');
      await Accesso.chiudiVecchio(casaPrivata.id);
      canale.manda('vecchioChiuso', {});
      const cartella = await cartellaDi(casa), dep = clientDeposito().storage.from(DEPOSITO);
      const {data} = await dep.list('finestre/' + cartella, {limit:1000});
      const nomi = (data || []).map(f => 'finestre/' + cartella + '/' + f.name);
      for (let i = 0; i < nomi.length; i += 100) await dep.remove(nomi.slice(i, i + 100));
      passo('chiudi', 'fatto', `Vecchio link chiuso, ${nomi.length} immagini tolte dal deposito pubblico`);
      dimenticaVecchio();
    });
    disegnaImpostazioni();
  },
  accEsci: async () => { await Accesso.esci(); location.reload(); },
  accReclama: async () => {
    await conLavoro('reclama', async L => {
      passo('reclama', 'ora', 'Collego la stanza al tuo account…');
      const id = await Accesso.reclama(casa, 'Stanza');
      casaPrivata = (await Accesso.mieCase()).find(c => c.id === id);
      passo('reclama', 'fatto', 'La stanza è tua');
      await copiaNelPrivato(L);
      CASA_PRIVATA = casaPrivata.id; libreriaStato = 'da caricare';
      if (!canalePrivato) canalePrivato = Accesso.canale(casaPrivata.id, gestoreCanale);
      membri = await Accesso.membri(casaPrivata.id);
      await caricaLibreria();
      if (scena.paesaggio){ const p = libreria.find(x => x.id === scena.paesaggio); if (p){ Object.assign(scena, scenaDi(p)); mandaScena(); } }
    });
    disegnaImpostazioni();
    if (casaPrivata) apriBenvenuto();
  },
  accCopia: async () => {
    await conLavoro('copia', async L => { await copiaNelPrivato(L); CASA_PRIVATA = casaPrivata.id; libreriaStato = 'da caricare'; await caricaLibreria(); });
    disegnaImpostazioni();
  },
  accMostraCodici: () => { if (canale.manda('mostraCodice', {})) avviso('Gli schermi accesi mostrano il loro QR per 10 minuti'); else avviso('Nessuno schermo collegato', true); },
  accTogli: async (v, b) => {
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = 'Sicuro?'; return; }
    try { await Accesso.togliMembro(casaPrivata.id, v); membri = await Accesso.membri(casaPrivata.id); disegnaImpostazioni(); avviso('Tolto dalla stanza'); }
    catch(e) { avviso(e.message, true); }
  },
  ricaricaFinestre: () => { if (canale.manda('ricarica')){ rimanda = true; avviso('Le finestre si ricaricano'); } else avviso('Non collegato', true); },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fai]'); if (!b || b.disabled) return;
  if (comandaDM() && BLOCCATE_DA_DM.has(b.dataset.fai)){ e.preventDefault(); avvisoInMano(); return; }
  const f = AZIONI[b.dataset.fai]; if (f){ e.preventDefault(); f(b.dataset.v, b); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="switch"]')){ e.preventDefault(); e.target.click(); } });

/* via */
avviaAccesso().finally(() => { if (libreriaStato === 'da caricare') caricaLibreria(); });
disegnaScheda();
