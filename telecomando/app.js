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
const VERSIONE = '4.1';

/* ── la casa ──────────────────────────────────────────────────────────────── */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const q = new URLSearchParams(location.search);
/* la testata del marchio: DMaster Atmosphere, con le sue due parti; Bard arriva dopo */
const MARCHIO = `<div class="in-mano-avviso" id="inMano" hidden><b>In mano a DMaster</b> La Serata comanda finestre e atmosfera: qui le guardi soltanto. Quando chiudi DMaster tornano a questo telefono da sole.</div>`;
/* il vecchio link (?casa=…): resta finché il proprietario non lo chiude; una casa nuova non ce l'ha, si entra con l'email */
let casa = (String(q.get('casa') || '').match(UUID) || String(leggi('finestre-casa', '') || '').match(UUID) || [null])[0];
/* aperto dal QR di uno schermo («…/telecomando/?abbina=123456»): dopo l'accesso chiede di aggiungerlo */
let codiceArrivato = Accesso.codiceDa(location.href) || sessionStorage.getItem('atm-codice-arrivato') || null;
if (codiceArrivato) sessionStorage.setItem('atm-codice-arrivato', codiceArrivato);
/* aperto dal QR «Collega il telefono» di DMaster: il telefono entra nella stanza senza email */
let invitoArrivato = Accesso.invitoDa(location.href) || sessionStorage.getItem('atm-invito-arrivato') || null;
if (invitoArrivato) sessionStorage.setItem('atm-invito-arrivato', invitoArrivato);
/* aperto dal QR «Entra dal telefono» di DMaster: il telefono entra nello STESSO account, senza email */
let accessoArrivato = Accesso.accessoDa(location.href) || sessionStorage.getItem('atm-accesso-arrivato') || null;
if (accessoArrivato) sessionStorage.setItem('atm-accesso-arrivato', accessoArrivato);
const nomeTelefono = () => /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Telefono Android' : 'Telefono';
if (casa) scrivi('finestre-casa', casa);
/* il codice della casa resta nell'indirizzo (così «Aggiungi alla schermata Home» se lo porta dietro); quello dello schermo no */
/* «code» è del tasto «Entra» dell'email di accesso: lo legge l'accesso (js/accesso.js), poi sparisce anche lui */
history.replaceState(null, '', location.pathname + (casa || q.get('code') ? '?' + [casa ? 'casa=' + casa : '', q.get('code') ? 'code=' + encodeURIComponent(q.get('code')) : ''].filter(Boolean).join('&') : '') + location.hash);

/* ── impostazioni ─────────────────────────────────────────────────────────── */
const IMP_PRED = {modello:'openai:gpt-image-2', qualita:'alta', chiavi:{openai:'', google:'', pexels:'', elevenlabs:''},
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
    if (evento === 'dmaster'){ dmasterFino = d.attivo ? Date.now() + 30000 : 0; serataFino = d.attivo && d.serata ? Date.now() + 30000 : 0; lettore.imposta({muto: inSerata()}); aggiornaComando(); if (scheda === 'bard') aggiornaBard(); return; }
    if (evento === 'bard'){ prendiBard(d); return; }
    if (evento === 'bardOra'){ if (!suonoQui()){ bardOra = d.musica || null; if (scheda === 'bard') aggiornaBard(); } return; }
    if (evento !== 'eccomi') return;
    collegate = Date.now();
    if (d.bard){ bardTvSuona = !!d.bard.suona; if (d.bard.serata) serataFino = Math.max(serataFino, Date.now() + 25000); prendiBard(d.bard.stato); if (!suonoQui() && d.bard.ora) bardOra = d.bard.ora.musica || bardOra; if (scheda === 'bard') aggiornaBard(); }
    if (d.comando === 'dmaster') dmasterFino = Math.max(dmasterFino, Date.now() + 25000);
    if (comandaDM() && d.scena){   /* comanda DMaster: qui si guarda e basta, la scena è la sua */
      scena = Object.assign({}, SCENA_PRED, d.scena); delete scena.da; scrivi('finestre-scena', scena); postaAnteprima({tipo:'scena', scena}); lettore.suScena(scena);
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
  canale.manda = (evento, dati) => { if (evento !== 'chi' && comandaDM() && !(/^bard/.test(evento) && !inSerata())){ avvisoInMano(); return false; } return mandaDavvero(evento, dati); };
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
  lettore.suScena(scena);
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
let account = null, casaPrivata = null, stanze = [], membri = [], accessoStato = 'controllo', emailInAttesa = leggi('atm-email-attesa', '');
/* chi comanda da questo telefono: il proprietario (entrato con l'email) o un telefono collegato da DMaster col QR */
const sonoProprietario = () => !!account && (!casaPrivata || casaPrivata.mioRuolo !== 'comando');
async function avviaAccesso(){
  try {
    if (accessoArrivato){
      const t = accessoArrivato; accessoArrivato = null; sessionStorage.removeItem('atm-accesso-arrivato');
      try { const u = await Accesso.entraColQR(t); avviso('Sei entrato come ' + ((u.user_metadata && u.user_metadata.nome) || u.email)); } catch(e) { avviso(e.message, true); }
    }
    account = await Accesso.conAccount();
    if (q.get('code')) history.replaceState(null, '', location.pathname + (casa ? '?casa=' + casa : '') + location.hash);
    if (account){
      const case_ = await Accesso.mieCase();
      stanze = case_;
      /* la stanza scelta su questo telefono (31/10: un master può averne più d'una, coi paesaggi in comune) */
      const scelta = leggi('atm-stanza', '');
      casaPrivata = (scelta && case_.find(c => c.id === scelta)) || (casa && case_.find(c => c.chiave_vecchia === casa)) || (!casa ? case_[0] : null) || null;
      /* un account nuovo, senza vecchio link: la sua casa si crea da sola */
      if (!casaPrivata && !casa){ const id = await Accesso.nuovaCasa('Stanza'); casaPrivata = (await Accesso.mieCase()).find(c => c.id === id); }
    } else {
      if (invitoArrivato){
        const t = invitoArrivato; invitoArrivato = null; sessionStorage.removeItem('atm-invito-arrivato');
        try { await Accesso.usaInvito(t, nomeTelefono()); avviso('Telefono collegato alla stanza'); } catch(e) { avviso(e.message, true); }
      }
      casaPrivata = await Accesso.stanzaComandata();
    }
    if (casaPrivata){
      {
        if (casaPrivata.vecchio_chiuso) dimenticaVecchio();
        const n = casa ? (await Accesso.elenco(Accesso.libreria(casaPrivata))).length : 1;
        if (n && !CASA_PRIVATA){ CASA_PRIVATA = Accesso.libreria(casaPrivata); libreriaStato = 'da caricare'; if (scheda === 'paesaggi') disegnaPaesaggi(); else caricaLibreria(); }
        if (!canalePrivato) canalePrivato = Accesso.canale(casaPrivata.id, gestoreCanale);
        membri = await Accesso.membri(casaPrivata.id).catch(() => []);
      }
    }
    accessoStato = 'ok';
  } catch(e) { accessoStato = e.message; }
  if (scheda === 'impostazioni') disegnaImpostazioni();
  if (CASA_PRIVATA && bardLibStato !== 'ok'){ bardLibStato = 'da caricare'; if (scheda === 'bard') disegnaBard(); else caricaBard(); }
  if (!account && !casaPrivata && (!casa || !leggi('atm-benvenuto-visto', false))) apriBenvenuto();
  else if (account && casa && !casaPrivata && !leggi('atm-benvenuto-visto', false)) apriBenvenuto();
  else if (casaPrivata && codiceArrivato){ const c = codiceArrivato; codiceArrivato = null; sessionStorage.removeItem('atm-codice-arrivato'); confermaAggiunta(c); }
}
/* il vecchio link è chiuso: niente più canale né chiave nell'indirizzo */
function dimenticaVecchio(){
  if (vecchio){ vecchio.chiudi && vecchio.chiudi(); vecchio = null; }
  casa = null; scrivi('finestre-casa', ''); history.replaceState(null, '', location.pathname + location.hash);
}

/* ── benvenuto: il percorso guidato (entra → la tua casa → aggiungi gli schermi) ── */
function apriBenvenuto(){
  const passi = ['Entra', 'La tua stanza', 'Gli schermi'], ora = !(account || casaPrivata) ? 0 : (casa && !casaPrivata) ? 1 : 2;
  const testaPassi = `<div class="passi-guida">${passi.map((t, i) => `<span class="${i < ora ? 'fatto' : i === ora ? 'ora' : ''}">${i < ora ? icona('spunta', 14) : i + 1} ${t}</span>`).join('')}</div>`;
  let corpo;
  if (ora === 0) corpo = emailInAttesa
    ? `<h3>Controlla la posta</h3><p class="nota">Email mandata a <b>${esc(emailInAttesa)}</b>. Premi «Entra» nell'email, oppure scrivi qui il codice che c'è dentro.</p>
       <label class="campo"><span>Codice</span><input id="accCodice" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
       <button class="btn oro piena" data-fai="accEntra">${icona('spunta', 18)}Entra</button><button class="btn piena" style="margin-top:8px" data-fai="accAltra">Usa un'altra email</button>`
    : `<h3>Benvenuto in DMaster Atmosphere</h3><p class="nota">Hai già fatto l'accesso in DMaster? Lì, in Impostazioni → Account, premi «Entra dal telefono» e inquadra il QR che compare: questo telefono entra nel tuo account, senza email.</p>
       <button class="btn oro piena" data-fai="inquadraInvito">${icona('qr', 18)}Inquadra il QR di DMaster</button>
       <details class="altra-via"><summary>Non hai DMaster qui? Entra con l'email</summary>
         <p class="nota">Ti arriva un'email: aprila su questo telefono e premi «Entra», oppure scrivi qui il codice che c'è dentro. È lo stesso account di DMaster.</p>
         <label class="campo"><span>Email</span><input id="accEmail" type="email" autocomplete="email" inputmode="email" placeholder="nome@esempio.it" value="${esc(leggi('atm-email', ''))}"></label>
         <button class="btn piena" data-fai="accCodiceEmail">${icona('posta', 18)}Mandami il codice</button></details>
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
async function apriAggiungi(perInvito = false){
  if (!casaPrivata && !perInvito){ apriBenvenuto(); return; }
  apriFoglio(`<div class="benvenuto"><h3>${perInvito ? 'Inquadra il QR di DMaster' : 'Aggiungi schermo'}</h3>
    <div class="mirino"><video id="qrVideo" playsinline muted></video><i></i><span id="qrStato">Accendo la fotocamera…</span></div>
    ${perInvito ? '<p class="nota">In DMaster: Impostazioni → Account → «Entra dal telefono».</p>' : `<label class="campo" style="margin-top:12px"><span>Oppure scrivi le 6 cifre</span><input id="qrCodice" inputmode="numeric" maxlength="7" placeholder="302 680"></label>
    <button class="btn oro piena" data-fai="codiceScritto">${icona('freccia', 18)}Continua</button>`}</div>`);
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
        const acc = r && Accesso.accessoDa(r.data);
        if (acc){ fermaCamera(); navigator.vibrate && navigator.vibrate(40); entraColQROra(acc); return; }
        const inv = r && Accesso.invitoDa(r.data), cod = r && !inv && Accesso.codiceDa(r.data);
        if (inv){ fermaCamera(); navigator.vibrate && navigator.vibrate(40); usaInvitoOra(inv); return; }
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
/* il QR «Entra dal telefono» di DMaster: questo telefono entra nel tuo account (lo stesso dell'email) */
async function entraColQROra(token){
  try {
    const u = await Accesso.entraColQR(token);
    await avviaAccesso();
    apriFoglio(`<div class="benvenuto" style="text-align:center">${icona('spunta', 34)}<h3>Sei dentro${u.user_metadata && u.user_metadata.nome ? ', ' + esc(u.user_metadata.nome) : ''}</h3>
      <p class="nota">Questo telefono è entrato nel tuo account, come con l'email: comandi le finestre, crei i paesaggi, aggiungi gli schermi. Se lo perdi: in DMaster, Impostazioni → Account → «Esci da tutti i dispositivi».</p>
      <button class="btn oro piena" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi uno schermo</button>
      <button class="btn piena" style="margin-top:8px" data-fai="benvenutoFine">Fatto</button></div>`);
    foglioAperto = 'fatto';
  } catch(e) { avviso(e.message, true); apriBenvenuto(); }
}
/* il QR di DMaster: questo telefono entra nella stanza come «comando», senza email */
async function usaInvitoOra(token){
  try {
    await Accesso.usaInvito(token, nomeTelefono());
    await avviaAccesso();
    apriFoglio(`<div class="benvenuto" style="text-align:center">${icona('spunta', 34)}<h3>Telefono collegato</h3>
      <p class="nota">Da qui comandi le finestre e aggiungi gli schermi. Non serve altro: il telefono se lo ricorda.</p>
      <button class="btn oro piena" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi uno schermo</button>
      <button class="btn piena" style="margin-top:8px" data-fai="benvenutoFine">Fatto</button></div>`);
    foglioAperto = 'fatto';
  } catch(e) { avviso(e.message, true); apriBenvenuto(); }
}
async function confermaAggiunta(codice){
  if (!casaPrivata){ codiceArrivato = codice; sessionStorage.setItem('atm-codice-arrivato', codice); apriBenvenuto(); return; }
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
  const nuovi = Object.fromEntries((await Accesso.elenco(Accesso.libreria(casaPrivata))).map(f => [f.name, f]));
  const daCopiare = (vecchi || []).filter(f => !/^zz-|-incorso\.png$/.test(f.name) && (!nuovi[f.name] || Date.parse(f.updated_at || 0) > Date.parse(nuovi[f.name].updated_at || 0)));
  let fatti = 0;
  for (const f of daCopiare){
    passo('copia', 'ora', `Copio le immagini nel deposito privato: ${fatti + 1} di ${daCopiare.length}…`); L.av = fatti / daCopiare.length * 100;
    const r = await fetch(urlPubblico('finestre/' + cartella + '/' + f.name) + '?copia=' + Date.now());
    if (!r.ok) throw new Error('Non riesco a leggere ' + f.name + ' (' + r.status + ')');
    const blob = await r.blob();
    await Accesso.carica(Accesso.libreria(casaPrivata), f.name, blob, (f.metadata && f.metadata.mimetype) || blob.type || 'application/octet-stream');
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
  document.querySelectorAll('.problema:not(.fisso)').forEach(el => {
    el.hidden = !problema;
    if (!problema) return;
    const link = (problema.chi || '').startsWith('OpenAI') ? 'https://platform.openai.com/settings/organization/billing/overview' : (problema.chi || '').startsWith('ElevenLabs') ? 'https://elevenlabs.io/app/subscription' : 'https://aistudio.google.com/usage';
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
const aperti = new Set(leggi('atm-gruppi-aperti', ['stanza']));
document.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details[data-ricorda]')) return; if (d.open) aperti.add(d.dataset.ricorda); else aperti.delete(d.dataset.ricorda); scrivi('atm-gruppi-aperti', [...aperti]); }, true);
const gruppo = (id, ic, testo, piccolo, corpo) => `<details class="gruppo" data-ricorda="${id}"${aperti.has(id) ? ' open' : ''}><summary>${icona(ic, 18)}<span>${esc(testo)}</span>${piccolo ? '<small>' + esc(piccolo) + '</small>' : ''}</summary><div class="dentro-gruppo">${corpo}</div></details>`;
function riempi(r){ const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
function legaCursore(id, fn){ const r = document.getElementById(id); if (!r) return; riempi(r); r.oninput = () => { riempi(r); fn(+r.value, document.getElementById(id + '-o')); }; return r; }

/* ═════════════════════════════ SCHEDE ═════════════════════════════════════ */
const SCHEDE = [['finestre','bifora','Finestre'], ['bard','liuto','Bard'], ['paesaggi','quadro','Paesaggi'], ['crea','scintilla','Crea'], ['impostazioni','manopole','Impostazioni']];
let scheda = (location.hash.slice(1) in {finestre:1, bard:1, paesaggi:1, crea:1, impostazioni:1}) ? location.hash.slice(1) : 'finestre';
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
  ({finestre: disegnaFinestre, bard: disegnaBard, paesaggi: disegnaPaesaggi, crea: disegnaCrea, impostazioni: disegnaImpostazioni})[scheda]();
  aggiornaSpia();
}

/* ═══════════ FINESTRE: anteprima dal vivo e comandi ═════════════════════ */
const ORE = [['vera','orologio','Come fuori'], ['alba','alba','Alba'], ['giorno','sole','Giorno'], ['tramonto','tramonto','Tramonto'], ['notte','luna','Notte']];
const METEO = [['sereno','sole','Sereno'], ['nuvoloso','nuvola','Nuvoloso'], ['nebbia','nebbia','Nebbia'], ['pioggia','pioggia','Pioggia'], ['temporale','fulmine','Temporale'], ['neve','fiocco','Neve']];
const FLUIDITA = [[60,'Massima'], [50,'A 50 Hz'], [30,'Silenziosa']];
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
const VENTI = [[null,'Auto'], [.1,'Calmo'], [.4,'Brezza'], [.8,'Forte']];
const ventoVicino = v => v == null ? null : VENTI.slice(1).reduce((m, x) => Math.abs(x[0] - v) < Math.abs(m[0] - v) ? x : m)[0];
function disegnaFinestre(){
  const s = $('#s-finestre');
  if (!s.dataset.fatto){
    s.dataset.fatto = 1;
    s.innerHTML = testa('bifora', 'Finestre', 'Quello che si vede adesso') + `
      <div class="vivo">
        <div class="anteprima" id="anteprima"><iframe id="anteprimaFrame" title="Anteprima delle finestre" src="../finestra/?anteprima=1"></iframe>
          <div class="etich"><b id="nomeInOnda">—</b><small id="sottoInOnda"></small></div></div>
        <div class="rapide">
          <button class="btn" data-fai="accendi" id="btnAccendi">${icona('accensione', 20)}<span>Accese</span></button>
          <button class="btn" data-fai="vaiPaesaggi">${icona('quadro', 20)}<span>Paesaggio</span><small>cambia</small></button>
          <button class="btn" data-fai="lampo">${icona('fulmine', 20)}<span>Lampo</span></button>
        </div>
      </div>
      <div class="sezione">${titolo('orologio', 'Ora')}<div class="scelte c5" id="sceltaOra">${ORE.map(([v, ic, t]) => scelta('ora', v, ic, t)).join('')}</div></div>
      <div class="sezione">${titolo('nuvola', 'Tempo')}<div class="scelte c3" id="sceltaMeteo">${METEO.map(([v, ic, t]) => scelta('meteo', v, ic, t)).join('')}</div>
        <div class="pannello" style="margin-top:10px">
          <div id="rigaIntensita">${cursore('intensita', 'goccia', 'Intensità', 0, 100, Math.round(scena.intensita * 100), Math.round(scena.intensita * 100) + '%')}</div>
          <div class="riga-vento">${icona('vento', 18)}<span>Vento</span><div class="segmenti">${VENTI.map(([v, t]) => `<button data-fai="vento" data-v="${v == null ? '' : v}">${t}</button>`).join('')}</div></div>
        </div></div>`;
    anteprimaFrame = $('#anteprimaFrame');
    anteprimaFrame.onload = () => { anteprimaPronta = true; impaginaAnteprima(); postaAnteprima({tipo:'scena', scena}); };
    legaCursore('intensita', (v, o) => { o.textContent = v + '%'; cambia({intensita: v / 100}, false); });
    impaginaAnteprima();
  }
  aggiornaFinestre();
}
function aggiornaFinestre(){
  const s = $('#s-finestre'); if (!s.dataset.fatto) return;
  s.querySelectorAll('[data-fai="ora"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.ora)));
  s.querySelectorAll('[data-fai="meteo"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.meteo)));
  const vv = ventoVicino(scena.vento);
  s.querySelectorAll('[data-fai="vento"]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '' ? null : +b.dataset.v) === vv)));
  $('#rigaIntensita').hidden = scena.meteo === 'sereno';
  $('#btnAccendi').innerHTML = icona('accensione', 20) + '<span>' + (scena.acceso ? 'Accese' : 'Spente') + '</span><small>' + (scena.acceso ? 'spegni' : 'accendi') + '</small>';
  $('#btnAccendi').classList.toggle('oro', !!scena.acceso);
  const p = libreria.find(x => x.id === scena.paesaggio);
  $('#nomeInOnda').textContent = p ? p.nome : scena.yt ? 'Video di YouTube' : scena.immagini ? 'Paesaggio' : 'Nessun paesaggio';
  $('#sottoInOnda').textContent = [NOME_ORA[scena.ora], (METEO.find(m => m[0] === scena.meteo) || [,,''])[2].toLowerCase()].filter(Boolean).join(' · ');
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
  if (!casa && !CASA_PRIVATA){ libreriaStato = 'Collega il telefono alla tua stanza (Impostazioni → Stanza e schermi) per vedere i tuoi paesaggi.'; if (scheda === 'paesaggi') disegnaPaesaggi(); return; }
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
  const indietro = `<button class="btn piccolo" data-fai="vistaP" data-v="miei" style="margin-bottom:12px">${icona('indietro', 16)}I miei paesaggi</button>`;
  let corpo = '';
  if (vistaPaesaggi === 'miei'){
    const elenco = filtraLibreria(libreria, filtroTesto, null);
    corpo = `<div class="riga-cerca"><div class="cerca">${icona('lente', 18)}<input id="cercaMiei" type="search" placeholder="Cerca…" value="${esc(filtroTesto)}" autocomplete="off"></div>
        <button class="btn oro" data-fai="aggiungiPaesaggio">${icona('piu', 18)}Aggiungi</button></div>
      <div class="griglia" style="margin-top:14px">${libreriaStato === 'carico' && !libreria.length ? '<p class="vuoto">Carico la libreria…</p>'
        : libreriaStato !== 'ok' && libreriaStato !== 'carico' ? `<p class="vuoto">${esc(libreriaStato)}</p>`
        : elenco.length ? elenco.map(cartaPaesaggio).join('') : `<p class="vuoto">${libreria.length ? 'Nessun paesaggio con queste parole.' : 'Ancora nessun paesaggio: tocca «Aggiungi».'}</p>`}</div>`;
  } else if (vistaPaesaggi === 'web'){
    corpo = indietro + `<form id="formWeb" class="cerca">${icona('lente', 18)}<input id="cercaWeb" type="search" placeholder="Cerca foto vere: castello medievale, colline toscane…" value="${esc(cercaWebTesto)}" autocomplete="off"></form>
      <p class="nota">Foto libere da Wikimedia Commons${imp.chiavi.pexels ? ' e Pexels' : ''}. Le verticali vengono prima.</p>
      <div class="griglia" style="margin-top:12px">${cercaWebStato === 'cerco' ? '<p class="vuoto">Cerco…</p>' : cercaWebStato && cercaWebStato !== 'ok' ? `<p class="vuoto">${esc(cercaWebStato)}</p>`
        : risultatiWeb.map((f, i) => `<button class="carta" data-fai="apriWeb" data-v="${i}"><img loading="lazy" alt="" src="${esc(f.miniatura)}"><span class="su"><b>${esc(f.titolo.slice(0, 40))}</b><small>${esc(f.fonte)}${f.verticale ? '' : ' · orizzontale'}</small></span></button>`).join('')}</div>`;
  } else {
    corpo = indietro + `<div class="pannello">
      <label class="campo"><span>Link di YouTube</span><input id="ytLink" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label>
      <label class="campo"><span>Nome</span><input id="ytNome" maxlength="40" placeholder="Es. Foresta sotto la pioggia"></label>
      <button class="btn oro piena" data-fai="salvaYT">${icona('piu', 18)}Aggiungi alla libreria</button>
      <p class="nota">Il video gira muto e in loop; pioggia, lampi e nebbia ci vanno sopra. Su YouTube cerca «window view 4K».</p></div>`;
  }
  s.innerHTML = testa('quadro', 'Paesaggi', vistaPaesaggi === 'web' ? 'Una foto vera dal web' : vistaPaesaggi === 'yt' ? 'Un video di YouTube' : 'Tocca per mostrarlo') + corpo;
  const cm = $('#cercaMiei');
  if (cm){ cm.oninput = () => { filtroTesto = cm.value; const g = s.querySelector('.griglia'); const el = filtraLibreria(libreria, filtroTesto, null);
    g.innerHTML = el.length ? el.map(cartaPaesaggio).join('') : '<p class="vuoto">Nessun paesaggio con queste parole.</p>'; }; }
  const fw = $('#formWeb');
  if (fw) fw.onsubmit = async e => { e.preventDefault(); cercaWebTesto = $('#cercaWeb').value.trim(); if (!cercaWebTesto) return; $('#cercaWeb').blur();
    cercaWebStato = 'cerco'; disegnaPaesaggi();
    try { risultatiWeb = await cercaFoto(cercaWebTesto, imp.chiavi.pexels); cercaWebStato = risultatiWeb.length ? 'ok' : 'Nessuna foto trovata: prova altre parole.'; }
    catch(e2) { cercaWebStato = e2.message; }
    disegnaPaesaggi(); };
  aggiornaSpia();
}
function apriAggiungiPaesaggio(){
  const riga = (fai, ic, t, sotto) => `<button class="scelta riga" data-fai="${fai}">${icona(ic, 22)}<span><b>${t}</b><small>${sotto}</small></span></button>`;
  apriFoglio(`<h3 class="foglio-titolo">Aggiungi un paesaggio</h3><div class="scelte">
    ${riga('vaiCrea', 'scintilla', 'Dipinto dall\'AI', 'Lo descrivi, lo dipinge con le luci del giorno e la vista per il TV')}
    ${riga('aggiungiWebVai', 'mondo', 'Foto vera dal web', 'Da Wikimedia Commons' + (imp.chiavi.pexels ? ' e Pexels' : ''))}
    ${riga('aggiungiYTVai', 'scena', 'Video di YouTube', 'Un video in loop, muto')}</div>`);
  foglioAperto = 'aggiungi-paesaggio';
}

/* che cosa manca a un paesaggio per essere completo come uno appena creato */
function cosaManca(p){
  if (p.yt || !p.immagini.giorno) return [];
  const m = ['alba','tramonto','notte'].filter(o => !p.immagini[o]);
  if (!p.immagini['est-giorno']) m.push('tv');
  if (!['giorno','alba','tramonto','notte'].some(o => p.immagini['cielo-' + o])) m.push('cielo');
  return m;
}
function costoCompleta(manca){
  const m = Ai.modello(imp.modello), c = m.costo[imp.qualita] || m.costo.alta, nLuci = manca.filter(o => NOME_ORA[o]).length;
  return c * 1.15 * nLuci + (manca.includes('tv') ? c * 1.3 * (1 + 3 * 1.15) : 0) + (manca.includes('cielo') ? c * 4 : 0);
}
const NOME_MANCA = {alba:'alba', tramonto:'tramonto', notte:'notte', tv:'vista per il TV', cielo:'cielo che scorre'};

/* il dettaglio di un paesaggio */
function apriPaesaggio(p){
  foglioAperto = p.id;
  const ora = ['giorno','alba','tramonto','notte'];
  const manca = cosaManca(p);
  const fx = p.fuoco ? p.fuoco.x : .5;
  const img = p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno;
  const elencoManca = manca.map(o => NOME_MANCA[o]);
  apriFoglio(`
    <div class="dettaglio">
      <div class="grande"><img id="dettImg" alt="" src="${esc(img)}" style="object-position:${Math.round(fx * 100)}% 50%"></div>
      <div class="info">
        <h3>${esc(p.nome)}</h3>
        <p class="nota" style="margin:0">${esc(TIPI[p.tipo] || '')}${Object.keys(p.animati).length ? ' · animato' : ''}</p>
        ${p.yt ? '' : `<div class="luci">${ora.map(o => p.immagini[o] ? `<button data-fai="vediLuce" data-v="${o}" aria-pressed="${o === 'giorno'}"><img alt="" src="${esc(p.immagini[o])}" style="object-position:${Math.round(fx * 100)}% 50%"><span>${NOME_ORA[o].toUpperCase()}</span></button>` : `<span class="manca" title="manca">${icona(o === 'notte' ? 'luna' : o === 'giorno' ? 'sole' : o, 16)}</span>`).join('')}</div>`}
        ${p.immagini['est-giorno'] ? `<button class="tv-mini" data-fai="vediLuce" data-v="est-giorno"><img alt="" src="${esc(p.immagini['est-giorno'])}"><span>${icona('tv', 13)}TV</span></button>` : ''}
      </div>
    </div>
    <button class="btn oro piena" style="margin-top:14px" data-fai="mostra" data-v="${p.id}">${icona('play', 18)}Mostra alle finestre</button>
    ${manca.length ? `<button class="btn piena" style="margin-top:8px" data-fai="completa" data-v="${p.id}">${icona('scintilla', 18)}Completa con l'AI · ≈ ${euro(costoCompleta(manca))}</button>
      <p class="nota" style="margin-top:6px">Manca: ${esc(elencoManca.join(', '))}.</p>` : ''}
    <details class="gruppo" style="margin-top:12px"><summary>${icona('manopole', 18)}<span>Altro</span></summary><div class="dentro-gruppo">
      ${p.yt ? '' : `${cursore('inquadra', 'mirino', 'Inquadratura', 0, 100, Math.round(fx * 100), fx === .5 ? 'centro' : Math.round(fx * 100) + '%')}
        <p class="nota" style="margin:0 0 10px">Quale parte dell'immagine si vede nel foro, se è più larga.</p>
        <label class="campo"><span>Che cosa si vede verso il TV</span><input id="tvDesc" placeholder="Vuoto: lo sceglie l'AI"></label>`}
      <div class="azioni">
        ${p.yt || !p.immagini['est-giorno'] ? '' : `<button class="btn" data-fai="vistaTv" data-v="${p.id}">${icona('tv', 18)}Rigenera vista TV</button>`}
        ${p.yt || manca.includes('cielo') ? '' : `<button class="btn" data-fai="cieli" data-v="${p.id}">${icona('nuvola', 18)}Rigenera il cielo</button>`}
        ${p.yt || !MODELLI_VIDEO.length ? '' : `<button class="btn" data-fai="anima" data-v="${p.id}">${icona('anima', 18)}Anima</button>`}
        <button class="btn" data-fai="modifica" data-v="${p.id}">${icona('matita', 18)}Rinomina</button>
        <button class="btn pericolo" data-fai="elimina" data-v="${p.id}">${icona('cestino', 18)}Elimina</button>
      </div></div></details>
    <div id="lavoroFoglio"></div>`, el => {
      let tFuoco = null;
      legaCursore('inquadra', (v, o) => {
        o.textContent = v === 50 ? 'centro' : v + '%';
        el.querySelectorAll('.grande img, .luci img').forEach(i => i.style.objectPosition = v + '% 50%');
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
  const manca = !imp.chiavi[m.fornitore];
  const incluso = [nLuci ? 'giorno, ' + ['alba','tramonto','notte'].filter(o => imp.luci[o]).join(', ') : 'solo giorno', imp.tv !== false ? 'vista TV' : '', imp.cielo !== false ? 'cielo che scorre' : '', imp.anima ? 'animazione' : ''].filter(Boolean).join(' · ');
  s.innerHTML = testa('scintilla', 'Crea', 'Un paesaggio nuovo, dipinto dall\'AI') + `<div class="problema" hidden></div>
    ${manca ? `<div class="problema fisso">${icona('chiave', 20)}<div><b>Manca la chiave ${m.fornitore === 'google' ? 'Google' : 'OpenAI'}</b><span>Mettila nelle Impostazioni → AI e chiavi.</span><div class="azioni" style="margin-top:8px"><button class="btn piccolo" data-fai="vaiImp">${icona('manopole', 16)}Impostazioni</button></div></div></div>` : ''}
    <div class="sezione">${titolo('occhio', 'Che cosa si vede')}
      <label class="campo"><textarea id="creaDesc" placeholder="Descrivi il paesaggio fuori dalla finestra, anche in poche parole. Oppure tocca un'idea qui sotto.">${esc(desc)}</textarea></label>
      <div class="pillole">${IDEE.map(([n], i) => `<button class="pillola" data-fai="idea" data-v="${i}">${esc(n)}</button>`).join('')}</div></div>
    <div class="sezione">${titolo('tavolozza', 'Stile')}
      <div class="stili">${STILI.map(st => `<button class="stile" data-fai="stile" data-v="${st.id}" aria-pressed="${imp.stile === st.id}"><div class="tela" style="background:${st.tela}"></div><b>${st.nome}</b><small>${st.nota}</small></button>`).join('')}</div></div>
    ${gruppo('crea-opzioni', 'manopole', 'Più opzioni', incluso, `
      <label class="campo"><span>Nome</span><input id="creaNome" maxlength="40" placeholder="Vuoto: lo prendo dalla descrizione" value="${esc(nome)}"></label>
      ${interruttore('tvToggle', 'tv', 'Vista per il TV', 'Verso est: un altro soggetto della stessa terra, stessa ora e stesso tempo', imp.tv !== false)}
      ${imp.tv !== false ? `<label class="campo"><span>Che cosa si vede verso il TV</span><input id="creaEst" placeholder="Vuoto: lo sceglie l'AI" value="${esc(descEst)}"></label>` : ''}
      <div class="blocco"><span>Luci del giorno</span><div class="scelte c4">${['giorno','alba','tramonto','notte'].map(o => `<button class="scelta" data-fai="luce" data-v="${o}" aria-pressed="${o === 'giorno' || !!imp.luci[o]}" ${o === 'giorno' ? 'disabled style="opacity:1"' : ''}>${icona(o === 'giorno' ? 'sole' : o === 'notte' ? 'luna' : o, 22)}<span>${NOME_ORA[o]}</span></button>`).join('')}</div></div>
      ${interruttore('cieloToggle', 'nuvola', 'Cielo che scorre', 'Le nuvole passano senza fine dietro il paesaggio', imp.cielo !== false)}
      ${MODELLI_VIDEO.length ? interruttore('animaToggle', 'anima', 'Animalo con ' + mv.nome, `${imp.video.secondi} secondi in loop · ≈ ${euro(mv.euroSecondo * imp.video.secondi)}`, imp.anima)
        + (imp.anima ? `<div class="pillole" style="margin:0 0 12px">${ELEMENTI.map(([v, ic, t]) => `<button class="pillola" data-fai="elemento" data-v="${v}" aria-pressed="${imp.elementi.includes(v)}">${icona(ic, 15)}${t}</button>`).join('')}</div>` : '') : ''}`)}
    <div class="sezione">
      <button class="btn oro piena" data-fai="crea" ${lavoro && !lavoro.finito || manca ? 'disabled' : ''}>${icona('scintilla', 18)}Crea · ≈ ${euro(costo)}</button>
      <p class="nota">1-3 minuti${imp.anima ? ', più qualche minuto per l\'animazione' : ''}: tieni il telefono acceso su questa pagina.</p>
      <div id="lavoroCrea"></div></div>`;
  disegnaLavoro(); aggiornaSpia(); mostraProblema();
}

/* ═══════════ BARD: musiche e suoni della stanza (1/11) ═══════════════════
   Il telefono comanda, suona il TV (G10) o, se scelto nelle Impostazioni, questo telefono.
   La libreria sta nella stanza (file «bard-…», js/bard.js): ce la copia DMaster, o la fa l'AI da qui.
   Durante una Serata di DMaster i suoni li fa il portatile del master e qui si guarda soltanto. */
const ID_TELEFONO = leggi('atm-tel-id', '') || (() => { const id = 'tel-' + Math.random().toString(36).slice(2, 10); scrivi('atm-tel-id', id); return id; })();
let bardStato = Object.assign({}, BARD_PRED, leggi('bard-stato', {}));
let bardLib = [], bardLibStato = 'da caricare', bardOra = null, serataFino = 0, bardTvSuona = null, bardNuovoTipo = 'effetto', bardMinuti = 2;
const inSerata = () => Date.now() < serataFino;
const suonoQui = () => bardStato.dove === ID_TELEFONO;
const lettore = new LettoreBard({tuoniDaSoli: true, quandoCambia: d => { if (d.musica && suonoQui()){ bardOra = d.musica; if (scheda === 'bard') aggiornaBard(); } }});
lettore.applica(bardStato); lettore.suScena(scena); lettore.imposta({qui: suonoQui()});
document.addEventListener('pointerdown', () => { if (suonoQui()) lettore.sblocca(); }, {passive: true});
setInterval(() => { lettore.imposta({muto: inSerata()}); if (scheda === 'bard') aggiornaBard(); }, 3000);

const bardDi = tipo => bardLib.filter(x => x.tipo === tipo);
const voceBard = x => x ? {id: x.id, url: x.url, titolo: x.titolo} : null;
async function caricaBard(){
  if (!CASA_PRIVATA){ bardLibStato = 'Collega il telefono alla tua stanza (Impostazioni → Stanza e schermi) per usare Bard.'; if (scheda === 'bard') disegnaBard(); return; }
  bardLibStato = 'carico'; if (scheda === 'bard') disegnaBard();
  try {
    const file = (await Accesso.elenco(CASA_PRIVATA)).filter(f => bardDaNome(f.name));
    const firme = await Accesso.firma(CASA_PRIVATA, file.map(f => f.name), Object.fromEntries(file.map(f => [f.name, f.updated_at || ''])));
    bardLib = file.map(f => Object.assign(bardDaNome(f.name), {url: firme[f.name]})).filter(x => x.url).sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
    bardLibStato = 'ok';
    /* gli indirizzi firmati cambiano: lo stato si rifà con quelli nuovi */
    const per = new Map(bardLib.map(x => [x.tipo + ':' + x.id, x]));
    if (bardStato.sottofondo) bardStato.sottofondo = voceBard(per.get('sottofondo:' + bardStato.sottofondo.id));
    if (bardStato.musica) bardStato.musica.brani = bardDi('musica').map(voceBard);
    bardStato.registrazioni = Object.fromEntries(bardDi('tempo').map(x => [x.id, x.url]));
    lettore.applica(bardStato);
  } catch(e) { bardLibStato = e.message; }
  if (scheda === 'bard') disegnaBard();
}
let invioBard = null;
function mandaBard(parte, piano = false){
  if (inSerata()){ avviso('Serata in corso: i suoni li comanda DMaster', true); return false; }
  Object.assign(bardStato, parte || {});
  bardStato.registrazioni = Object.fromEntries(bardDi('tempo').map(x => [x.id, x.url]));
  bardStato.rev = Date.now();
  scrivi('bard-stato', bardStato);
  lettore.applica(bardStato); lettore.imposta({qui: suonoQui()});
  clearTimeout(invioBard);
  if (piano) invioBard = setTimeout(() => canale.manda('bard', bardStato), 160); else canale.manda('bard', bardStato);
  return true;
}
function prendiBard(st){
  if (!st || (st.rev || 0) <= (bardStato.rev || 0)) return;
  bardStato = Object.assign({}, BARD_PRED, st); scrivi('bard-stato', bardStato);
  lettore.applica(bardStato); lettore.imposta({qui: suonoQui()});
  if (scheda === 'bard') disegnaBard();
}

function disegnaBard(){
  if (bardLibStato === 'da caricare') caricaBard();
  const s = $('#s-bard');
  const sott = bardDi('sottofondo'), mus = bardDi('musica'), eff = bardDi('effetto'), nTempo = bardDi('tempo').length;
  const t = bardStato.tempo || {acceso: true, volume: .6}, m = bardStato.musica || {};
  const pronto = bardLibStato === 'ok';
  s.innerHTML = testa('liuto', 'Bard', 'Musiche e suoni della stanza') + `<div class="problema" hidden></div>
    <div class="in-mano-avviso" id="bardSerata" hidden><b>Serata in corso</b> I suoni della stanza li fa DMaster dal portatile. Quando chiudi la serata Bard torna qui da solo.</div>
    <div class="dove-suona">${icona('altoparlante', 18)}<span id="bardDove"></span><button class="btn piccolo" data-fai="vaiImpBard">Cambia</button></div>
    ${!pronto ? `<p class="vuoto">${bardLibStato === 'carico' ? 'Carico i suoni della stanza…' : esc(bardLibStato)}</p>` : ''}
    <div class="sezione">${titolo('pioggia', 'Tempo')}
      <div class="pannello" style="padding:2px 14px">${interruttore('bardTempo', 'pioggia', 'Suoni del tempo', nTempo ? 'Seguono le finestre: pioggia, vento, neve, tuoni coi lampi' : 'Seguono le finestre. Le registrazioni non sono ancora nella stanza (si copiano da DMaster): per ora un suono più semplice', t.acceso)}
        ${cursore('volTempo', 'altoparlante', 'Volume', 0, 100, Math.round(t.volume * 100), Math.round(t.volume * 100) + '%')}</div></div>
    <div class="sezione">${titolo('onda', 'Sottofondo', sott.length ? 'tocca per accendere o spegnere' : '')}
      ${sott.length ? `<div class="suoni">${sott.map(x => `<button class="suono" data-fai="bardSott" data-v="${esc(x.id)}" aria-pressed="${!!(bardStato.sottofondo && bardStato.sottofondo.id === x.id)}">${esc(x.titolo)}</button>`).join('')}</div>
        <div class="pannello" style="margin-top:10px">${cursore('volSott', 'altoparlante', 'Volume', 0, 100, Math.round(bardStato.volSottofondo * 100), Math.round(bardStato.volSottofondo * 100) + '%')}</div>`
        : pronto ? '<p class="nota" style="margin-top:0">Ancora nessun sottofondo: «+ Aggiungi un suono» qui sotto.</p>' : ''}</div>
    <div class="sezione">${titolo('nota', 'Musica')}
      ${mus.length ? `<div class="comandi-musica">
          <button class="btn ${m.acceso ? 'oro' : ''}" data-fai="bardPlay" id="bardPlay">${icona(m.acceso ? 'pausa' : 'play', 18)}${m.acceso ? 'Ferma' : 'Suona'}</button>
          <button class="btn" data-fai="bardAvanti">${icona('avanti', 18)}Avanti</button>
          <button class="pillola" data-fai="bardCaso" aria-pressed="${!!m.casuale}">${icona('caso', 16)}A caso</button></div>
        <div class="brani">${mus.map((x, i) => `<button class="brano" data-fai="bardBrano" data-v="${i}" data-id="${esc(x.id)}">${icona('nota', 16)}<span>${esc(x.titolo)}</span></button>`).join('')}</div>
        <div class="pannello" style="margin-top:10px">${cursore('volMusica', 'altoparlante', 'Volume', 0, 100, Math.round(bardStato.volMusica * 100), Math.round(bardStato.volMusica * 100) + '%')}</div>`
        : pronto ? '<p class="nota" style="margin-top:0">Ancora nessuna musica: «+ Aggiungi un suono» qui sotto.</p>' : ''}</div>
    <div class="sezione">${titolo('fulmine', 'Effetti', eff.length ? 'tocca per suonare' : '')}
      ${eff.length ? `<div class="scelte c3">${eff.map(x => `<button class="scelta" data-fai="bardEffetto" data-v="${esc(x.id)}">${icona('fulmine', 20)}<span>${esc(x.titolo)}</span></button>`).join('')}</div>
        <div class="pannello" style="margin-top:10px">${cursore('volEff', 'altoparlante', 'Volume', 0, 100, Math.round(bardStato.volEffetti * 100), Math.round(bardStato.volEffetti * 100) + '%')}</div>`
        : pronto ? '<p class="nota" style="margin-top:0">Ancora nessun effetto: «+ Aggiungi un suono» qui sotto.</p>' : ''}</div>
    ${CASA_PRIVATA ? `<button class="btn oro piena" style="margin-top:18px" data-fai="bardAggiungi">${icona('piu', 18)}Aggiungi un suono</button>
    ${gruppo('bard-gestisci', 'manopole', 'Gestisci i suoni', bardLib.length + ' nella stanza', `
      <ul class="membri">${bardLib.map(x => `<li><span><b>${esc(x.titolo)}</b><small>${{tempo: 'tempo', sottofondo: 'sottofondo', musica: 'musica', effetto: 'effetto'}[x.tipo]}</small></span><button class="btn piccolo pericolo" data-fai="bardTogli" data-v="${esc(x.file)}">Togli</button></li>`).join('') || '<li><span class="nota">Nessun suono.</span></li>'}</ul>
      <p class="nota">I suoni di DMaster arrivano con «Copia i suoni nella stanza» nella pagina Atmosfera di DMaster.</p>
      <button class="btn piena" data-fai="bardRicarica">${icona('ricarica', 18)}Rileggi la libreria</button>`)}` : ''}`;
  const lega = (id, fn) => legaCursore(id, (v, o) => { o.textContent = v + '%'; fn(v / 100); });
  lega('volTempo', v => mandaBard({tempo: Object.assign({}, bardStato.tempo, {volume: v})}, true));
  lega('volSott', v => mandaBard({volSottofondo: v}, true));
  lega('volMusica', v => mandaBard({volMusica: v}, true));
  lega('volEff', v => mandaBard({volEffetti: v}, true));
  aggiornaBard(); aggiornaSpia(); mostraProblema();
}
function aggiornaBard(){
  const s = $('#s-bard'); if (!s || !s.innerHTML) return;
  const dm = inSerata(), f = $('#bardSerata'); if (f) f.hidden = !dm;
  s.classList.toggle('in-serata', dm);
  const d = $('#bardDove');
  if (d) d.innerHTML = suonoQui() ? 'Suona da <b>questo telefono</b>' + (lettore.ctx && lettore.ctx.state !== 'running' ? ' · tocca lo schermo per sbloccare l\'audio' : '')
    : 'Suona dal <b>TV della stanza</b>' + (bardTvSuona === false ? ' · il TV non risponde' : '');
  const m = bardStato.musica || {}, ora = bardOra && m.acceso ? bardOra.id : null;
  s.querySelectorAll('.brano').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === ora)));
}

/* ── generare con l'AI (ElevenLabs, con la chiave messa nelle Impostazioni) ── */
function erroreAI(chi, status, testo){
  const e = new Error(`${chi}: ${status === 401 ? 'chiave non valida' : status === 402 || /quota|credit/i.test(testo) ? 'crediti finiti' : testo.slice(0, 160) || 'errore ' + status}`);
  e.tipo = status === 401 ? 'chiave' : status === 402 || /quota|credit/i.test(testo) ? 'credito' : ''; e.chi = chi; return e;
}
async function inInglese(testo, tipo){
  if (!imp.chiavi.openai) return testo;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {method: 'POST', headers: {'Authorization': 'Bearer ' + imp.chiavi.openai, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: 'gpt-4o-mini', max_tokens: 120, messages: [
        {role: 'system', content: `Rewrite the user's Italian description as one concise English prompt for an AI ${tipo === 'musica' ? 'instrumental music generator (genre, instruments, mood, tempo; medieval fantasy tabletop game)' : tipo === 'sottofondo' ? 'ambience sound generator (a seamless background loop, no music, no speech)' : 'sound effect generator (one short effect, no music, no speech)'}. Reply with the prompt only.`},
        {role: 'user', content: testo}]})});
    if (!r.ok) return testo;
    const j = await r.json(); return (j.choices && j.choices[0] && j.choices[0].message.content || testo).trim();
  } catch(e) { return testo; }
}
async function generaSuono(tipo, prompt){
  const chiave = imp.chiavi.elevenlabs, h = {'xi-api-key': chiave, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'};
  const r = tipo === 'musica'
    ? await fetch('https://api.elevenlabs.io/v1/music/stream', {method: 'POST', headers: h, body: JSON.stringify({prompt, duration_ms: bardMinuti * 60000, force_instrumental: true})})
    : await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {method: 'POST', headers: h,
        body: JSON.stringify(Object.assign({text: prompt, prompt_influence: .5, model_id: 'eleven_text_to_sound_v2'}, tipo === 'sottofondo' ? {loop: true, duration_seconds: 22} : {}))});
  if (!r.ok) throw erroreAI('ElevenLabs', r.status, await r.text().catch(() => ''));
  const b = await r.blob(); if (b.size < 800) throw new Error('ElevenLabs: risposta vuota, riprova.');
  return b;
}
function apriBardAggiungi(){
  const desc = $('#bardDesc') ? $('#bardDesc').value : '', nome = $('#bardNome') ? $('#bardNome').value : '';
  const esempi = {effetto: 'es. una porta di legno pesante che cigola e si chiude', sottofondo: 'es. taverna affollata, voci lontane, boccali, fuoco nel camino', musica: 'es. liuto e flauto, allegra, festa di paese'};
  apriFoglio(`<h3 class="foglio-titolo">Aggiungi un suono</h3>
    <div class="segmenti">${[['effetto', 'Effetto'], ['sottofondo', 'Sottofondo'], ['musica', 'Musica']].map(([v, t]) => `<button data-fai="bardTipo" data-v="${v}" aria-pressed="${bardNuovoTipo === v}">${t}</button>`).join('')}</div>
    <label class="campo"><span>Che cosa si sente</span><textarea id="bardDesc" placeholder="${esempi[bardNuovoTipo]}">${esc(desc)}</textarea></label>
    <label class="campo"><span>Nome</span><input id="bardNome" maxlength="40" placeholder="Vuoto: lo prendo dalla descrizione" value="${esc(nome)}"></label>
    ${bardNuovoTipo === 'musica' ? `<div class="segmenti" style="margin-bottom:10px">${[1, 2, 3].map(v => `<button data-fai="bardMinuti" data-v="${v}" aria-pressed="${bardMinuti === v}">${v} minut${v === 1 ? 'o' : 'i'}</button>`).join('')}</div>` : ''}
    ${imp.chiavi.elevenlabs ? `<button class="btn oro piena" data-fai="bardGenera">${icona('scintilla', 18)}Genera con l'AI</button>`
      : `<div class="problema fisso">${icona('chiave', 20)}<div><b>Manca la chiave ElevenLabs</b><span>Mettila in Impostazioni → AI e chiavi.</span></div></div>`}
    <button class="btn piena" style="margin-top:8px" data-fai="bardFileScegli">${icona('importa', 18)}Carica un file audio</button>
    <input type="file" id="bardFile" accept="audio/*" hidden>
    <p class="nota">${bardNuovoTipo === 'sottofondo' ? '22 secondi che si ripetono senza giunte.' : bardNuovoTipo === 'musica' ? 'Solo strumentale.' : 'La durata la sceglie l\'AI.'} Usa i crediti del tuo ElevenLabs. Il suono va nella stanza: lo sentono tutti i telefoni e DMaster.</p>
    <div id="lavoroFoglio"></div>`, el => {
      const inp = el.querySelector('#bardFile');
      inp.onchange = () => { const f = inp.files && inp.files[0]; inp.value = ''; if (f) caricaFileBard(f); };
    });
  foglioAperto = 'bard-aggiungi';
}
async function salvaNellaStanza(tipo, titolo, blob, est){
  const nome = bardNomeFile(tipo, Date.now().toString(36), titolo, est);
  await Accesso.carica(CASA_PRIVATA, nome, blob, BARD_MIME[est] || blob.type || 'audio/mpeg');
  await caricaBard();
  return bardLib.find(x => x.file === nome);
}
async function caricaFileBard(f){
  const est = (f.name.match(/\.([a-z0-9]+)$/i) || [, 'mp3'])[1].toLowerCase();
  if (!BARD_MIME[est]){ avviso('Formato non adatto: mp3, m4a, ogg, wav o flac.', true); return; }
  if (f.size > 50e6){ avviso('Il file è più grande di 50 MB.', true); return; }
  const titolo = ($('#bardNome') || {}).value || f.name.replace(/\.[^.]+$/, '');
  await conLavoro('bard', async L => {
    passo('carico', 'ora', 'Lo metto nella stanza…');
    const x = await salvaNellaStanza(bardNuovoTipo, titolo, f, est);
    passo('carico', 'fatto', '«' + (x ? x.titolo : titolo) + '» è nella stanza');
  });
}
async function generaBard(){
  const desc = ($('#bardDesc') || {}).value.trim();
  if (!desc){ avviso('Scrivi che cosa si sente.', true); return; }
  const tipo = bardNuovoTipo, titolo = ($('#bardNome') || {}).value.trim() || desc.split(/[,.]/)[0].slice(0, 40);
  await conLavoro('bard', async L => {
    passo('prompt', 'ora', 'Lo scrivo per il generatore…');
    const prompt = await inInglese(desc, tipo);
    passo('prompt', 'fatto', 'Richiesta: «' + prompt.slice(0, 90) + (prompt.length > 90 ? '…' : '') + '»');
    passo('genera', 'ora', tipo === 'musica' ? `La musica (${bardMinuti} min): ci vuole un po'…` : 'Lo genero…');
    const blob = await generaSuono(tipo, prompt);
    risolto('ElevenLabs');
    passo('genera', 'fatto', 'Generato');
    passo('carico', 'ora', 'Lo metto nella stanza…');
    const x = await salvaNellaStanza(tipo, titolo, blob, 'mp3');
    passo('carico', 'fatto', '«' + (x ? x.titolo : titolo) + '» è nella stanza');
    if (x && tipo === 'effetto' && suonoQui()) lettore.effetto(x);
    else if (x && tipo === 'effetto') canale.manda('bardEffetto', {id: x.id, url: x.url});
  });
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
  const ruoli = {proprietario:'Proprietario', comando:'Telefono o tablet', schermo:'Schermo', lavoratore:'Rifinitura dei video'};
  const corpoAccount = `${accessoStato === 'controllo' ? '<p class="nota" style="margin:0">Controllo l\'accesso…</p>'
      : !account && !casaPrivata ? `<p class="nota" style="margin-top:0">Collega questo telefono alla tua stanza: inquadra il QR che DMaster mostra in «Collega il telefono» (o entra con la tua email).</p>
          <button class="btn oro piena" data-fai="apriBenvenuto">${icona('qr', 18)}Collega il telefono</button>`
      : account && !casaPrivata ? `<p class="nota" style="margin-top:0">Questa stanza usa ancora il vecchio link.</p><button class="btn oro piena" data-fai="apriBenvenuto">${icona('chiave', 18)}Collega la stanza al mio account</button>`
      : `${account && stanze.length ? `<div class="stanze"><label class="campo"><span>Stanza</span><select data-cambia="accStanza">${stanze.map(c => `<option value="${esc(c.id)}"${c.id === casaPrivata.id ? ' selected' : ''}>${esc(c.nome || 'Stanza')}</option>`).join('')}</select></label>
          <div class="azioni"><button class="btn piccolo" data-fai="accRinominaStanza">Rinomina</button><button class="btn piccolo" data-fai="accNuovaStanza">+ Nuova stanza</button></div>
          ${stanze.length > 1 ? '<p class="nota">I paesaggi sono gli stessi in tutte le stanze; gli schermi sono di una stanza sola.</p>' : ''}</div>` : ''}
        <ul class="membri">${membri.map(m => `<li><span><b>${esc(m.ruolo === 'proprietario' ? ((account && account.email) || 'Proprietario') : (m.nome || ruoli[m.ruolo] || m.ruolo))}</b><small>${esc(ruoli[m.ruolo] || m.ruolo)}</small></span>${m.ruolo === 'proprietario' || !sonoProprietario() ? '' : `<span class="azioni-riga"><button class="btn piccolo" data-fai="accRinomina" data-v="${esc(m.utente)}">Rinomina</button><button class="btn piccolo pericolo" data-fai="accTogli" data-v="${esc(m.utente)}">Togli</button></span>`}</li>`).join('')}</ul>
          <button class="btn oro piena" style="margin-top:12px" data-fai="aggiungiSchermo">${icona('qr', 18)}Aggiungi schermo</button>
          ${vecchio && sonoProprietario() ? `<div class="azioni"><button class="btn" data-fai="accMostraCodici">${icona('schermo', 18)}Mostra il QR sugli schermi accesi</button><button class="btn" data-fai="accCopia">${icona('ricarica', 18)}Ricopia le immagini</button></div>
          <div class="vecchio-link"><b>${icona('avviso', 16)}Vecchio link ancora aperto</b><span>Chi ha il vecchio link comanda le finestre e vede le immagini. Quando tutti gli schermi (e DMaster) sono nella stanza, chiudilo.</span>
            <button class="btn piccolo pericolo" data-fai="accChiudiVecchio">Chiudi il vecchio link</button></div>` : '<p class="nota">Stanza privata: la vedono solo i membri qui sopra.</p>'}`}
      ${account ? `<button class="btn piena" style="margin-top:12px" data-fai="accCodiceComputer">${icona('chiave', 18)}Entra da un computer</button>
        <div class="azioni"><button class="btn piccolo" data-fai="accEsci">Esci da questo telefono</button><button class="btn piccolo" data-fai="accEsciOvunque">Esci da tutti i dispositivi</button></div>`
        : casaPrivata ? `<p class="nota">Telefono collegato da DMaster.</p><div class="azioni"><button class="btn piccolo" data-fai="accEsci">Scollega questo telefono</button></div>` : ''}
      <div id="lavoroFoglio"></div>`;
  const chi = account ? (account.email || '') : casaPrivata ? 'telefono collegato' : 'non collegato';
  const conChiave = !!imp.chiavi[Ai.modello(imp.modello).fornitore];
  s.innerHTML = testa('manopole', 'Impostazioni', 'Si sistemano una volta') + `<div class="problema" hidden></div>
    ${gruppo('stanza', 'persona', 'Stanza e schermi', chi, corpoAccount)}
    ${gruppo('ai', 'scintilla', 'AI e chiavi', conChiave ? Ai.modello(imp.modello).nome : 'manca la chiave', `
      <div class="blocco"><span>Per le immagini</span><div class="scelte">${MODELLI_IMMAGINE.map(m => `<button class="scelta riga" data-fai="modello" data-v="${m.id}" aria-pressed="${imp.modello === m.id}">${icona(m.fornitore === 'google' ? 'mondo' : 'scintilla', 22)}<span><b>${esc(m.nome)}</b><small>${esc(m.note)}</small></span><span class="prezzo">≈ ${euro(m.costo[imp.qualita] || m.costo.alta)}</span></button>`).join('')}</div></div>
      <div class="segmenti">${['alta','media','bassa'].map(v => `<button data-fai="qualita" data-v="${v}" aria-pressed="${imp.qualita === v}">Qualità ${v}</button>`).join('')}</div>
      ${MODELLI_VIDEO.length ? `<div class="blocco" style="margin-top:14px"><span>Per le animazioni</span><div class="scelte">${MODELLI_VIDEO.map(m => `<button class="scelta riga" data-fai="modelloVideo" data-v="${m.id}" aria-pressed="${imp.video.modello === m.id}">${icona('anima', 22)}<span><b>${esc(m.nome)}</b><small>${esc(m.note)}</small></span><span class="prezzo">${euro(m.euroSecondo)}/s</span></button>`).join('')}</div></div>
        <div class="segmenti">${[4, 6, 8, 10].map(v => `<button data-fai="secondi" data-v="${v}" aria-pressed="${imp.video.secondi === v}">${v} s</button>`).join('')}</div>` : ''}
      <div style="margin-top:14px">
        ${campoChiave('kOpenai', 'Chiave OpenAI', 'sk-…', imp.chiavi.openai, 'La stessa di DMaster.')}
        ${campoChiave('kGoogle', 'Chiave Google (Gemini)', 'AIza…', imp.chiavi.google, 'Per Nano Banana e le animazioni. Gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>.')}
        ${campoChiave('kEleven', 'Chiave ElevenLabs', 'sk_…', imp.chiavi.elevenlabs, 'Per i suoni e le musiche di Bard. La stessa di DMaster.')}
        ${campoChiave('kPexels', 'Chiave Pexels (facoltativa)', 'chiave Pexels', imp.chiavi.pexels, 'Più foto vere e verticali. Gratis su <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a>.')}
        <p class="nota" style="margin-top:0">Le chiavi restano su questo telefono.</p></div>`)}
    ${gruppo('bard', 'liuto', 'Bard', suonoQui() ? 'suona dal telefono' : 'suona dal TV', `
      <div class="segmenti">${[['stanza', 'tv', 'Il TV'], [ID_TELEFONO, 'telefono', 'Questo telefono']].map(([v, ic, t]) => `<button data-fai="bardDove" data-v="${v}" aria-pressed="${bardStato.dove === v}">${icona(ic, 18)}${t}</button>`).join('')}</div>
      <p class="nota">${suonoQui() ? 'Suona da qui: dall\'altoparlante o da una cassa collegata al telefono. Tieni l\'app aperta e lo schermo acceso, se no il telefono smette di suonare.' : 'Suona il G10 del TV: dalle casse del TV o da una cassa Bluetooth abbinata al G10. Puoi bloccare il telefono.'} Durante una serata i suoni li fa DMaster dal portatile.</p>`)}
    ${gruppo('aspetto', 'nuvola', 'Come si muovono', '', `
      ${interruttore('movimento', 'nuvola', 'Movimento', 'Nuvole che scorrono e alberi al vento, anche sulle immagini ferme', scena.movimento !== false)}
      ${interruttore('prospettiva', 'occhio', 'Prospettiva', 'Le due finestre vedono il paesaggio da punti appena diversi', scena.prospettiva !== false)}
      ${interruttore('prospettivaViva', 'persona', 'Prospettiva viva', 'Le finestre seguono chi si muove nella stanza (serve il sensore)', !!scena.prospettivaViva)}
      <div class="blocco"><span>Luce dello schermo</span>${cursore('luceGiorno', 'sole', 'Di giorno', 5, 100, scena.luceGiorno, scena.luceGiorno + '%')}${cursore('luceNotte', 'luna', 'Di notte', 2, 100, scena.luceNotte, scena.luceNotte + '%')}</div>
      <div class="blocco"><span>Fluidità · immagini al secondo</span><div class="scelte c3">${FLUIDITA.map(([v, t]) => `<button class="scelta" data-fai="fps" data-v="${v}" aria-pressed="${v === (scena.fps || 60)}"><b style="font:600 18px var(--display)">${v}</b><span>${esc(t)}</span></button>`).join('')}</div>
        <p class="nota">Meno immagini = ventola più tranquilla. 50 solo se lo schermo è a 50 Hz.</p></div>`)}
    ${gruppo('allinea', 'mirino', 'Allineamento', a.n === 2 ? 'due finestre' : 'una finestra', `
      <div class="segmenti">${[1, 2].map(n => `<button data-fai="nFinestre" data-v="${n}" aria-pressed="${a.n === n}">${icona(n === 1 ? 'monofora' : 'bifora', 18)}${n === 1 ? 'Una finestra' : 'Due finestre'}</button>`).join('')}</div>
      ${interruttore('bordi', 'mirino', 'Mostra i bordi sulle finestre', 'Una cornice tratteggiata per allineare ogni foro al traforo', mostraBordi)}
      ${fori}
      <div class="pannello" style="margin-top:10px">
        ${cursore('zoom', 'lente', 'Ingrandisci', 100, 200, Math.round(scena.zoom * 100), Math.round(scena.zoom * 100) + '%')}
        ${cursore('vx', 'destra', 'Sposta', -30, 30, Math.round(scena.vx * 100), Math.round(scena.vx * 100))}</div>
      <div class="pannello" style="margin-top:10px"><div class="titolo" style="margin-bottom:4px">${icona('persona', 15)}Prova la prospettiva viva</div>
        ${cursore('provaX', 'destra', 'Dove sei', -100, 100, 0, 'centro')}
        ${cursore('provaZ', 'mirino', 'Quanto vicino', -100, 100, 0, '0')}
        <p class="nota" style="margin:0 0 6px">Fai finta di muoverti nella stanza: le finestre reagiscono come col sensore.</p></div>
      ${a.n === 2 && !schermi.destra ? '<p class="nota">La finestra destra non ha ancora risposto: si collega quando c\'è il secondo schermo.</p>' : ''}`)}
    ${gruppo('collega', 'catena', 'Collegamento', '', `
      <p class="nota" style="margin-top:0">Indirizzo da aprire sul Raspberry:</p><code class="link">${esc(linkPi)}</code>
      <div class="azioni">${casa ? `<button class="btn" data-fai="copia" data-v="${esc(linkTel)}">${icona('copie', 18)}Link per un altro telefono</button>` : ''}<button class="btn" data-fai="ricaricaFinestre">${icona('ricarica', 18)}Ricarica finestre</button></div>`)}
    <p class="nota" style="text-align:center;margin-top:18px">DMaster Atmosphere ${VERSIONE} · powered by DMaster Stage</p>`;
  for (const [id, k] of [['kOpenai','openai'], ['kGoogle','google'], ['kEleven','elevenlabs'], ['kPexels','pexels']]){ const el = document.getElementById(id); el.oninput = () => { imp.chiavi[k] = el.value.trim(); salvaImp(); if (problema && problema.tipo === 'chiave') risolto(); }; }
  nomi.forEach(nm => {
    const lega = (id, chiave) => legaCursore(id + nm, (v, o) => { o.textContent = v.toFixed(1) + '%'; assetto = assettoOPredefinito(); assetto.finestre[nm][chiave] = v / 100; mandaFori(); });
    lega('fx', 'x'); lega('fy', 'y'); lega('fw', 'w'); lega('fh', 'h');
  });
  legaCursore('luceGiorno', (v, o) => { o.textContent = v + '%'; cambia({luceGiorno: v}, false); });
  legaCursore('luceNotte', (v, o) => { o.textContent = v + '%'; cambia({luceNotte: v}, false); });
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
const BLOCCATE_DA_DM = new Set(['ora', 'meteo', 'fps', 'accendi', 'lampo', 'vento', 'movimento', 'prospettiva', 'prospettivaViva', 'mostra', 'nFinestre', 'bordi', 'ricaricaFinestre']);
const AZIONI = {
  chiudiProblema: () => risolto(),
  bardTempo: () => { const t = Object.assign({acceso: true, volume: .6}, bardStato.tempo); if (mandaBard({tempo: Object.assign(t, {acceso: !t.acceso})})) disegnaBard(); },
  bardSott: v => { const x = bardDi('sottofondo').find(y => y.id === v); if (mandaBard({sottofondo: bardStato.sottofondo && bardStato.sottofondo.id === v ? null : voceBard(x)})) disegnaBard(); },
  bardPlay: () => { const m = Object.assign({i: 0, casuale: false}, bardStato.musica || {}); m.acceso = !m.acceso; m.brani = bardDi('musica').map(voceBard); if (mandaBard({musica: m})) disegnaBard(); },
  bardBrano: v => { const m = Object.assign({casuale: false}, bardStato.musica || {}, {acceso: true, i: +v, brani: bardDi('musica').map(voceBard)}); if (mandaBard({musica: m})){ bardOra = {i: +v, id: m.brani[+v].id}; disegnaBard(); } },
  bardAvanti: () => { const brani = bardDi('musica').map(voceBard), n = brani.length; if (!n) return; const m = Object.assign({casuale: false}, bardStato.musica || {});
    const ora = bardOra ? brani.findIndex(b => b.id === bardOra.id) : (m.i || 0);
    const i = m.casuale && n > 1 ? (ora + 1 + Math.floor(Math.random() * (n - 1))) % n : (ora + 1) % n;
    if (mandaBard({musica: Object.assign(m, {acceso: true, i, brani})})){ bardOra = {i, id: brani[i].id}; disegnaBard(); } },
  bardCaso: () => { const m = Object.assign({acceso: false, i: 0}, bardStato.musica || {}); m.casuale = !m.casuale; m.brani = bardDi('musica').map(voceBard); if (mandaBard({musica: m})) disegnaBard(); },
  bardEffetto: (v, b) => { if (inSerata()){ avviso('Serata in corso: i suoni li comanda DMaster', true); return; } const x = bardDi('effetto').find(y => y.id === v); if (!x) return;
    if (suonoQui()) lettore.effetto(x); else if (!canale.manda('bardEffetto', {id: x.id, url: x.url})) avviso('Il TV non è collegato', true);
    b.classList.add('suona'); setTimeout(() => b.classList.remove('suona'), 500); },
  bardAggiungi: () => apriBardAggiungi(),
  bardTipo: v => { bardNuovoTipo = v; apriBardAggiungi(); },
  bardMinuti: v => { bardMinuti = +v; apriBardAggiungi(); },
  bardGenera: () => generaBard(),
  bardFileScegli: () => { const i = $('#bardFile'); i && i.click(); },
  bardTogli: async (v, b) => { if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = 'Sicuro?'; return; }
    try { await Accesso.togli(CASA_PRIVATA, [v]); await caricaBard(); avviso('Tolto dalla stanza'); } catch(e) { avviso(e.message, true); } },
  bardRicarica: () => caricaBard(),
  bardDove: v => { mandaBard({dove: v}); if (v === ID_TELEFONO) lettore.sblocca(); disegnaImpostazioni(); },
  vaiImpBard: () => { aperti.add('bard'); scrivi('atm-gruppi-aperti', [...aperti]); vai('impostazioni'); },
  chiudiFoglio: () => chiudiFoglio(),
  ora: v => cambia({ora:v}),
  meteo: v => cambia({meteo:v}),
  fps: (v, b) => { cambia({fps:+v}); b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); },
  accendi: () => cambia({acceso: !scena.acceso}),
  lampo: () => { if (canale.manda('lampo')) avviso('Lampo!'); postaAnteprima({tipo:'lampo'}); if (suonoQui()) lettore.tuono(); },
  vaiPaesaggi: () => vai('paesaggi'), vaiCrea: () => { chiudiFoglio(); vai('crea'); }, vaiImp: () => vai('impostazioni'),
  aggiungiPaesaggio: () => apriAggiungiPaesaggio(),
  aggiungiWebVai: () => { chiudiFoglio(); vistaPaesaggi = 'web'; disegnaPaesaggi(); setTimeout(() => { const i = $('#cercaWeb'); i && i.focus(); }, 50); },
  aggiungiYTVai: () => { chiudiFoglio(); vistaPaesaggi = 'yt'; disegnaPaesaggi(); },
  vento: v => cambia({vento: v === '' ? null : +v}),
  movimento: (v, b) => { cambia({movimento: scena.movimento === false}); b.setAttribute('aria-checked', String(scena.movimento !== false)); },
  prospettiva: (v, b) => { cambia({prospettiva: scena.prospettiva === false}); b.setAttribute('aria-checked', String(scena.prospettiva !== false)); },
  prospettivaViva: (v, b) => { cambia({prospettivaViva: !scena.prospettivaViva}); b.setAttribute('aria-checked', String(!!scena.prospettivaViva)); },
  vistaP: v => { vistaPaesaggi = v; disegnaPaesaggi(); },
  apri: v => { const p = libreria.find(x => x.id === v); if (p) apriPaesaggio(p); },
  apriWeb: v => apriWeb(risultatiWeb[+v]),
  mostra: v => { const p = libreria.find(x => x.id === v); if (p){ mostraPaesaggio(p); chiudiFoglio(); } },
  vediLuce: (v, b) => { const p = libreria.find(x => x.id === foglioAperto); if (!p) return; const tv = v.startsWith('est-');
    $('#dettImg').src = p.immagini[v]; $('#dettImg').style.objectFit = tv ? 'contain' : 'cover';
    document.querySelectorAll('#foglioDentro [data-fai="vediLuce"]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (!tv && scena.paesaggio === p.id && !comandaDM()) cambia({ora: v}); },
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
  completa: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni → AI e chiavi.', true); return; }
    const desc = (($('#tvDesc') || {}).value || '').trim();
    await conLavoro('completa', async L => {
      L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
      const manca = cosaManca(p), luci = ['alba','tramonto','notte'].filter(o => manca.includes(o));
      const foto = await (await fetch(p.immagini.giorno)).blob(), mis = await misuraDi(foto);
      /* come quando si crea: con la vista per il TV, all'alba il sole si vede solo nel TV (mai due soli) */
      if (luci.length){ await faiLuci(p, foto, luci, m.fornitore === 'openai' ? mis.openai : null, {conTv: true}); aggiornaInLibreria(p); }
      if (!p.immagini.profondita){ await faiProfondita(p, foto); aggiornaInLibreria(p); }
      if (manca.includes('tv')){ try { await faiVistaEst(p, foto, desc, luci.includes('alba')); aggiornaInLibreria(p); } catch(e) { passo('est-giorno', 'errore', 'TV · vista verso est: ' + e.message); segnala(e); } }
      if (manca.includes('cielo')){ await faiCieli(p); aggiornaInLibreria(p); }
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
    const nome = $('#ytNome').value.trim() || 'Video', parole = paroleChiave(nome);
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
  inquadraInvito: () => apriAggiungi(true),
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
  accNuovaStanza: async () => {
    const nome = prompt('Come si chiama la nuova stanza? (per esempio «Club» o «Casa di Luca»)', '');
    if (!nome || !nome.trim()) return;
    try { const id = await Accesso.nuovaCasa(nome.trim()); scrivi('atm-stanza', id); location.reload(); } catch(e) { avviso(e.message, true); }
  },
  accRinominaStanza: async () => {
    const nome = prompt('Nuovo nome della stanza', casaPrivata && casaPrivata.nome || '');
    if (!nome || !nome.trim()) return;
    try { await Accesso.rinominaStanza(casaPrivata.id, nome); casaPrivata.nome = nome.trim(); stanze = await Accesso.mieCase(); disegnaImpostazioni(); } catch(e) { avviso(e.message, true); }
  },
  /* un codice da scrivere in DMaster sul computer, al posto dell'email (31/10) */
  accCodiceComputer: async () => {
    let c;
    try { c = await Accesso.creaCodiceComputer(); } catch(e) { avviso(e.message, true); return; }
    const leggibile = c.slice(0, 4) + ' ' + c.slice(4);
    apriFoglio(`<div class="benvenuto" style="text-align:center">${icona('chiave', 30)}<h3>Entra da un computer</h3>
      <p class="nota">In DMaster sul computer: «Entra» → «Hai l'app sul telefono? Scrivi il codice», e scrivi:</p>
      <div class="codice-grande" style="font-family:ui-monospace,Menlo,monospace;font-size:min(34px,8vw);letter-spacing:.12em;margin:14px 0;white-space:nowrap;color:var(--oro-chiaro,#f0cb5b)">${esc(leggibile)}</div>
      <p class="nota" id="statoCodice">Vale 5 minuti, una volta sola. Non dirlo a chi non deve entrare nel tuo account.</p>
      <button class="btn piena" data-fai="chiudiFoglio">Chiudi</button></div>`);
    foglioAperto = 'codice-computer';
    const giro = setInterval(async () => {
      if (foglioAperto !== 'codice-computer'){ clearInterval(giro); return; }
      const st = await Accesso.statoAccesso(c).catch(() => 'attesa');
      const el = $('#statoCodice'); if (!el) { clearInterval(giro); return; }
      if (st === 'usato'){ clearInterval(giro); el.innerHTML = '<b>Fatto: il computer è entrato.</b>'; navigator.vibrate && navigator.vibrate(40); }
      else if (st === 'scaduto'){ clearInterval(giro); el.textContent = 'Il codice è scaduto: chiudi e chiedine un altro.'; }
    }, 2500);
  },
  accReclama: async () => {
    await conLavoro('reclama', async L => {
      passo('reclama', 'ora', 'Collego la stanza al tuo account…');
      const id = await Accesso.reclama(casa, 'Stanza');
      casaPrivata = (await Accesso.mieCase()).find(c => c.id === id);
      passo('reclama', 'fatto', 'La stanza è tua');
      await copiaNelPrivato(L);
      CASA_PRIVATA = Accesso.libreria(casaPrivata); libreriaStato = 'da caricare';
      if (!canalePrivato) canalePrivato = Accesso.canale(casaPrivata.id, gestoreCanale);
      membri = await Accesso.membri(casaPrivata.id);
      await caricaLibreria();
      if (scena.paesaggio){ const p = libreria.find(x => x.id === scena.paesaggio); if (p){ Object.assign(scena, scenaDi(p)); mandaScena(); } }
    });
    disegnaImpostazioni();
    if (casaPrivata) apriBenvenuto();
  },
  accCopia: async () => {
    await conLavoro('copia', async L => { await copiaNelPrivato(L); CASA_PRIVATA = Accesso.libreria(casaPrivata); libreriaStato = 'da caricare'; await caricaLibreria(); });
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
/* la stanza di questo telefono (31/10): si cambia e si riparte da lì */
document.addEventListener('change', e => {
  if (e.target.matches('[data-cambia="accStanza"]') && e.target.value && (!casaPrivata || e.target.value !== casaPrivata.id)){ scrivi('atm-stanza', e.target.value); location.reload(); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="switch"]')){ e.preventDefault(); e.target.click(); } });

/* via */
avviaAccesso().finally(() => { if (libreriaStato === 'da caricare') caricaLibreria(); });
disegnaScheda();
