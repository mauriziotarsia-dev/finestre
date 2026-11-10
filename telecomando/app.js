/* ═══════════════════════════════════════════════════════════════════════════
   DMaster Atmosphere — l'app sul telefono (powered by DMaster Stage).
   Cinque schede: Finestre (anteprima, ora e tempo) · Bard (musiche e suoni della stanza; in serata la console
   del master) · Paesaggi (libreria, + Aggiungi) · Crea (paesaggi dipinti dall'AI) · Impostazioni (gruppi apribili).
   Parla con le finestre sul canale della casa (js/canale.js); la libreria sta nel deposito (js/libreria.js).
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const leggi = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; } };
const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
const euro = n => (n < .1 ? n.toFixed(3) : n.toFixed(2)).replace('.', ',') + ' $';
const VERSIONE = '6.23';
/* 8/11 · l'app si aggiorna da sola (Maurizio: «vedo ancora il quadrato con la doppia finestra»: sul telefono restava la
   versione vecchia anche dopo averla chiusa). Quando torna in primo piano, e ogni 10 minuti, chiede al server quale
   app.js c'è adesso; se è un'altra, ricarica (mai mentre un lavoro AI è in corso) */
(() => {
  const mia = ([...document.scripts].map(x => x.src).find(x => /telecomando\/app\.js/.test(x)) || '').split('v=')[1] || '';
  let ultimo = 0;
  const controlla = async () => {
    if (!mia || Date.now() - ultimo < 60000 || document.hidden) return; ultimo = Date.now();
    try {
      const t = await (await fetch('index.html?c=' + Date.now(), {cache: 'no-store'})).text();
      const nuova = (t.match(/app\.js\?v=([0-9.]+)/) || [])[1];
      if (nuova && nuova !== mia && !(typeof lavoro !== 'undefined' && lavoro && !lavoro.finito)) location.reload();
    } catch(e) {}
  };
  document.addEventListener('visibilitychange', controlla); addEventListener('focus', controlla); addEventListener('pageshow', controlla);
  setInterval(controlla, 10 * 60e3); setTimeout(controlla, 3000);
})();

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
  video:{modello:'omni-1080p', secondi:8}, stile:'painterly', luci:{alba:true, tramonto:true, notte:true}, anima:false, elementi:['alberi','acqua'], cielo:true, tv:true, risparmio:true};
const imp = Object.assign({}, IMP_PRED, leggi('finestre-impostazioni', {}));
imp.elementi = (imp.elementi || []).filter(e => e !== 'fumo');   /* 5/11: il fumo lo disegna la finestra */
imp.chiavi = Object.assign({}, IMP_PRED.chiavi, imp.chiavi || {});
imp.video = Object.assign({}, IMP_PRED.video, imp.video || {});
if (!MODELLI_VIDEO.find(m => m.id === imp.video.modello)) imp.video.modello = 'omni-1080p';   /* 10/11: chi aveva il 720p passa al 1080p */
if (!imp.chiavi.openai && leggi('finestre-chiave-openai', '')) imp.chiavi.openai = leggi('finestre-chiave-openai', '');   /* dalla versione di prima */
if (!MODELLI_VIDEO.length) imp.anima = false;
/* 10/11 · MENO OPZIONI (Maurizio: «per animare e creare ci sono troppe opzioni, non sono chiare… anche le impostazioni sono
   troppe»). Quello che prima si sceglieva ora è una regola fissa:
   · si crea sempre tutto: 4 luci, vista per il TV, cielo che scorre, animazioni (Maurizio: «sì, sempre tutto»)
   · ogni luce ha il suo video, finestrelle e TV: 8 video (Maurizio: «tutte e 4 le luci»); niente più «Risparmio»
   · immagini sempre in qualità alta; video sempre 8 s, a 1080p; si muovono alberi e acqua (cielo e nebbia li fa la finestra)
   Il modello per le immagini resta una scelta (Maurizio: «lascia la scelta») */
Object.assign(imp, {qualita:'alta', tv:true, cielo:true, anima: !!MODELLI_VIDEO.length, risparmio:false, luci:{alba:true, tramonto:true, notte:true}, elementi:['alberi','acqua']});
imp.video.secondi = 8;
const salvaImp = () => scrivi('finestre-impostazioni', imp);

/* ── la scena e i fori ───────────────────────────────────────────────────── */
const SCENA_PRED = {acceso:true, yt:'', t:0, immagini:null, animati:null, paesaggio:'', fuoco:null, ora:'vera', meteo:'sereno',
  intensita:.75, vento:null, nebbiaSale:false, fps:60, prospettivaViva:false, movimento:true, luceGiorno:70, luceNotte:40, prospettiva:true, zoom:1, vx:0};
let scena = Object.assign({}, SCENA_PRED, leggi('finestre-scena', {}));
/* 9/11 (Maurizio: «farei come se la notte fosse leggermente più illuminata, altrimenti è troppo buio»): la luce dello
   schermo di notte passa dal 30% al 40%. Una volta sola: chi l'aveva lasciata al 30 di prima va al 40; un valore scelto
   a mano (diverso da 30) resta */
if (!leggi('luce-notte-40', false)){ if (scena.luceNotte === 30){ scena.luceNotte = 40; scena.quando = Date.now(); scrivi('finestre-scena', scena); } scrivi('luce-notte-40', true); }
/* le finestre della casa: una o due, ognuna sul suo schermo (sono a due metri l'una dall'altra) */
/* 4/11 · il trucco della prospettiva (Maurizio, bozza C): con due finestrelle e un paesaggio largo, ognuna ne mostra
   una striscia diversa, l'elemento cardine fra le due. fra = cm di panorama fra le due strisce viste di fronte:
   negativo = in comune (−5: l'abbazia entra quasi intera da vicino, dal centro della stanza resta nascosta) */
const fraCm = v => v == null || v === '' || isNaN(+v) ? -5 : Math.max(-15, Math.min(15, Math.round(+v)));
const testoFra = v => v < 0 ? -v + ' cm in comune' : v ? v + ' cm nascosti fra le due' : 'si toccano';
function normalizzaFori(a){
  if (a && a.finestre) return {n: a.n === 2 ? 2 : 1, finestre: Object.assign({}, a.finestre), staccato: Math.max(0, Math.min(30, +a.staccato || 0)), fra: fraCm(a.fra)};
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
function foroPredefinito(sch){ const H = .9, W = H * sch.h * 16 / 44 / sch.w;   /* 7/11: foro 16 × 44 cm */ return {x:(1 - W) / 2, y:(1 - H) / 2, w:W, h:H}; }
function assettoOPredefinito(){
  return {n: assetto.n === 2 ? 2 : 1, staccato: +assetto.staccato || 0, fra: fraCm(assetto.fra), finestre:{
    sinistra: assetto.finestre.sinistra || foroPredefinito(schermoDi('sinistra')),
    destra: assetto.finestre.destra || foroPredefinito(schermoDi('destra'))}};
}

/* ── canale con le finestre ──────────────────────────────────────────────── */
const gestoreCanale = {
  suMessaggio(evento, d){
    if (evento === 'dmaster'){ dmasterFino = d.attivo ? Date.now() + 30000 : 0; const prima = inSerata(); serataFino = d.attivo && d.serata ? Date.now() + 30000 : 0; lettore.imposta({muto: inSerata()}); aggiornaComando(); if (scheda === 'bard' && prima !== inSerata()) disegnaBard(); else if (scheda === 'bard') aggiornaBard(); return; }
    if (evento === 'tv'){ ultimoTv = d && (d.spento || (!d.immagine && !d.video)) ? null : d; postaAnteprima({tipo:'tv', tv: d}); return; }
    if (evento === 'bard'){ prendiBard(d); return; }
    if (evento === 'aggiornaVecchi'){ chiediAggiornaVecchi(d); return; }
    if (evento === 'console'){ suConsole(d); return; }
    if (evento === 'consoleScheda'){ suScheda(d); return; }
    if (evento === 'bardOra'){ if (!suonoQui()){ bardOra = d.musica || null; if (scheda === 'bard') aggiornaBard(); } return; }
    if (evento !== 'eccomi') return;
    collegate = Date.now();
    if (d.bard){ bardTvSuona = !!d.bard.suona; if (Array.isArray(d.bard.casse)){ bardCasse = d.bard.casse; bardUscitaTv = d.bard.uscita || ''; } if (d.bard.serata) serataFino = Math.max(serataFino, Date.now() + 25000); prendiBard(d.bard.stato); if (!suonoQui() && d.bard.ora) bardOra = d.bard.ora.musica || bardOra; if (scheda === 'bard') aggiornaBard(); }
    if (d.comando === 'dmaster') dmasterFino = Math.max(dmasterFino, Date.now() + 25000);
    if (comandaDM() && d.scena){   /* comanda DMaster: qui si guarda e basta, la scena è la sua */
      scena = Object.assign({}, SCENA_PRED, d.scena); delete scena.da; scrivi('finestre-scena', scena); postaAnteprima({tipo:'scena', scena}); lettore.suScena(scena);
      aggiornaComando(); aggiornaSpia(); impaginaAnteprima(); if (scheda === 'finestre') aggiornaFinestre(); return;
    }
    if (d.assetto && (d.assetto.finestre || d.assetto.fori)){ const a = normalizzaFori(d.assetto); if (d.assetto.finestre || !leggi('finestre-fori', null)){ assetto = a; scrivi('finestre-fori', assetto); } }
    if (d.schermo){ schermi[d.lato || 'sinistra'] = Object.assign({}, d.schermo, d.prestazioni ? {fps: d.prestazioni.fps, scala: d.prestazioni.scala} : {}); scrivi('finestre-schermi', schermi); schermo = schermoDi('sinistra'); }
    if (!leggi('finestre-scena', null) && d.scena){ scena = Object.assign({}, SCENA_PRED, d.scena); scrivi('finestre-scena', scena); postaAnteprima({tipo:'scena', scena}); lettore.suScena(scena); }   /* 8/11: anche all'anteprima (su un telefono nuovo restava nera) */
    else if (rimanda){ rimanda = false; canale.manda('scena', scena); canale.manda('fori', Object.assign({mostra: mostraBordi}, assettoOPredefinito())); }   /* dopo «Ricarica», la scena di questo telefono */
    else if (d.scena && diversa(d.scena, scena)){
      /* ⚠ 9/11 · prima valeva sempre il telefono: un telefono rimasto indietro di giorni, riaperto, rimetteva sugli schermi
         la sua scena vecchia (così stanotte TV e finestrelle sono finite sulla città eliminata il 5/11). Ora vince la più
         recente; a pari merito (scene vecchie, senza data) vincono gli schermi */
      if ((scena.quando || 0) > (d.scena.quando || 0) || (!d.scena.immagini && !d.scena.yt)) canale.manda('scena', scena);   /* uno schermo nuovo, ancora vuoto, non vince mai */
      else { scena = Object.assign({}, SCENA_PRED, d.scena); scrivi('finestre-scena', scena); postaAnteprima({tipo:'scena', scena}); lettore.suScena(scena); if (scheda === 'finestre') aggiornaFinestre(); }
    }
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
  canale.manda = (evento, dati) => { if (evento !== 'chi' && comandaDM() && !(/^bard/.test(evento) && !inSerata()) && !/^console/.test(evento)){ avvisoInMano(); return false; } return mandaDavvero(evento, dati); };
}
let ultimoAvvisoInMano = 0;
function avvisoInMano(){ if (Date.now() - ultimoAvvisoInMano > 2500){ ultimoAvvisoInMano = Date.now(); avviso('Le finestre sono in mano a DMaster', true); } }
function aggiornaComando(){
  const dm = comandaDM();
  document.body.classList.toggle('in-mano', dm);
  const f = document.getElementById('inMano');
  if (f){
    const serata = typeof inSerata === 'function' && inSerata();
    f.hidden = !dm || (serata && scheda === 'bard');
    f.innerHTML = serata ? '<b>Serata in corso</b> DMaster comanda finestre e suoni. Da qui li comandi con la console: scheda <b>Bard</b>.'
      : '<b>In mano a DMaster</b> DMaster comanda finestre e atmosfera: qui le guardi soltanto. Bard resta tuo. Quando chiudi DMaster tornano a questo telefono da sole.';
  }
}
setInterval(aggiornaComando, 4000);
setInterval(() => { if (canale.pronto) canale.manda('chi'); aggiornaSpia(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && canale.pronto) canale.manda('chi'); });
/* la rete torna: si richiede subito lo stato (e la console, se c'è una serata) */
window.addEventListener('online', () => setTimeout(() => { if (canale.pronto){ canale.manda('chi'); if (typeof chiediConsole === 'function') chiediConsole(); } }, 2000));
function aggiornaSpia(){
  const viva = canale.pronto && Date.now() - collegate < 45000;
  document.querySelectorAll('.spia').forEach(s => { s.classList.toggle('viva', viva); s.querySelector('span').textContent = !canale.pronto ? 'collego…' : viva ? 'in onda' : 'non rispondono'; });
  if (typeof aggiornaIngresso === 'function') aggiornaIngresso();
}

let invio = null;
function mandaScena(subito = true){
  scena.quando = Date.now();   /* 9/11: per capire chi ha la scena più recente, il telefono o gli schermi */
  scrivi('finestre-scena', scena);
  lettore.suScena(scena);
  postaAnteprima({tipo:'scena', scena});
  clearTimeout(invio);
  if (subito) canale.manda('scena', scena); else invio = setTimeout(() => canale.manda('scena', scena), 110);
}
function diversa(a, b){ return ['acceso', 'paesaggio', 'ora', 'meteo', 'yt', 'nebbiaSale'].some(k => (a[k] ?? '') !== (b[k] ?? '')); }
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
  clearTimeout(avvisoT); avvisoT = setTimeout(() => a.classList.remove('su'), male ? 5200 : Math.max(2600, testo.length * 55));   /* 9/11: i messaggi lunghi restano il tempo di leggerli */
}
function apriFoglio(html, dopo){ $('#foglioDentro').innerHTML = html; $('#foglio').classList.add('aperto'); $('#velo').classList.add('aperto'); dopo && dopo($('#foglioDentro')); }
function chiudiFoglio(){ $('#foglio').classList.remove('aperto'); $('#velo').classList.remove('aperto'); if (foglioAperto === 'benvenuto') scrivi('atm-benvenuto-visto', true); foglioAperto = null; fermaCamera(); }
let foglioAperto = null;
$('#velo').onclick = chiudiFoglio;
$('#chiudiFoglio').innerHTML = icona('chiudi', 18);

/* ── pezzi di interfaccia ────────────────────────────────────────────────── */
const testa = (ic, titolo, sotto, spia = true) => `<header class="testa"><button class="torna" data-fai="ingresso" aria-label="Indietro">${icona('indietro', 20)}</button><div><h1>${icona(ic, 22)}${esc(titolo)}</h1><p>${esc(sotto)}</p></div>${spia ? '<span class="spia"><i></i><span>…</span></span>' : ''}</header>`;
const titolo = (ic, testo, piccolo = '') => `<h2 class="titolo">${icona(ic, 16)}${esc(testo)}${piccolo ? '<small>' + esc(piccolo) + '</small>' : ''}</h2>`;
/* 2/11 · un pulsante dipinto (bozze B e D): il medaglione con il nome sotto, come nella console della serata */
const pad = (fai, v, med, testo, acceso, px = 42, tasto = '') => `<button class="pad" data-fai="${fai}" data-v="${esc(v)}" aria-pressed="${!!acceso}" title="${esc(testo)}">${tasto ? `<i class="tasto">${esc(tasto)}</i>` : ''}<span class="tondo">${medaglione(med, px)}</span><span>${esc(testo)}</span></button>`;
const scelta = (fai, v, ic, testo, acceso) => `<button class="scelta" data-fai="${fai}" data-v="${esc(v)}" aria-pressed="${!!acceso}">${icona(ic, 22)}<span>${esc(testo)}</span></button>`;
const cursore = (id, ic, testo, min, max, val, uscita, passo = 1) => `<div class="cursore">${icona(ic, 18)}<label for="${id}">${esc(testo)}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${passo}" value="${val}"><output id="${id}-o">${esc(uscita)}</output></div>`;
const interruttore = (fai, ic, testo, sotto, acceso) => `<div class="interruttore" role="switch" tabindex="0" data-fai="${fai}" aria-checked="${!!acceso}">${icona(ic, 20)}<span><b>${esc(testo)}</b>${sotto ? '<small>' + esc(sotto) + '</small>' : ''}</span><i class="levetta"></i></div>`;
const aperti = new Set(leggi('atm-gruppi-aperti', ['stanza']));
/* gli appunti della scena in serata stanno aperti, finché non li chiudi tu */
const DI_SOLITO_APERTI = new Set(['con-scena']), chiusi = new Set(leggi('atm-gruppi-chiusi', []));
document.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details[data-ricorda]')) return; const k = d.dataset.ricorda;
  if (d.open){ aperti.add(k); chiusi.delete(k); } else { aperti.delete(k); chiusi.add(k); } scrivi('atm-gruppi-aperti', [...aperti]); scrivi('atm-gruppi-chiusi', [...chiusi]); }, true);
const interruttoreMed = (fai, med, testo, sotto, acceso) => `<div class="interruttore" role="switch" tabindex="0" data-fai="${fai}" aria-checked="${!!acceso}"><span class="tondo" style="display:block;border-radius:999px;line-height:0">${medaglione(med, 40)}</span><span><b>${esc(testo)}</b>${sotto ? '<small>' + esc(sotto) + '</small>' : ''}</span><i class="levetta"></i></div>`;
const gruppo = (id, ic, testo, piccolo, corpo) => `<details class="gruppo" data-ricorda="${id}"${aperti.has(id) || (DI_SOLITO_APERTI.has(id) && !chiusi.has(id)) ? ' open' : ''}><summary>${icona(ic, 18)}<span>${esc(testo)}</span>${piccolo ? '<small>' + esc(piccolo) + '</small>' : ''}</summary><div class="dentro-gruppo">${corpo}</div></details>`;
function riempi(r){ const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
function legaCursore(id, fn){ const r = document.getElementById(id); if (!r) return; riempi(r); r.oninput = () => { riempi(r); fn(+r.value, document.getElementById(id + '-o')); }; return r; }

/* ═════════════════════════════ SCHEDE ═════════════════════════════════════ */
/* 3/11 · la scheda delle finestre si chiama Illusionist (Maurizio: «finestre in inglese diventa windows, non possiamo»;
   Illusionist è il nome già deciso il 29/10 per finestre e paesaggi; Bard resta Bard) */
/* 8/11 · PIÙ SEMPLICE (Maurizio: «più semplice e intuitiva, con meno voci»; bozza A scelta): tre schede in basso,
   (poi, la sera stessa: Illusionist · Bard · Impostazioni). Si apre su Illusionist; Crea si apre da Paesaggi (Nuovo), le Impostazioni dall'ingranaggio
   in alto a destra. L'ingresso coi medaglioni resta nel codice ma non si apre più */
/* 8/11 sera (Maurizio: «al massimo Illusionist, Bard e Impostazioni»): i Paesaggi si aprono da Illusionist */
const SCHEDE = [['finestre','bifora','Illusionist'], ['bard','liuto','Bard'], ['impostazioni','manopole','Impostazioni']];
const ALTRE_SCHEDE = ['paesaggi', 'crea'];
let ultimaPrincipale = 'finestre';
/* 2/11 · l'app si apre sull'ingresso (bozza E): i cinque medaglioni grandi; da lì si entra nelle schede, la freccia in alto torna */
let scheda = (location.hash.slice(1) in {finestre:1, bard:1, paesaggi:1, crea:1, impostazioni:1}) ? location.hash.slice(1) : 'finestre';
$('#barra').innerHTML = SCHEDE.map(([id, ic, nome]) => `<button data-scheda="${id}">${icona(ic, 22)}<span>${nome}</span></button>`).join('');
$('#barra').onclick = e => { const b = e.target.closest('[data-scheda]'); if (b) vai(b.dataset.scheda); };
const app = $('#app');
app.innerHTML = MARCHIO + '<section class="scheda" id="s-ingresso"></section>' + SCHEDE.map(([id]) => id).concat(ALTRE_SCHEDE).map(id => `<section class="scheda" id="s-${id}"></section>`).join('');
function vai(id){
  if (scheda === 'impostazioni' && id !== 'impostazioni' && mostraBordi){ mostraBordi = false; canale.manda('fori', Object.assign({mostra:false}, assettoOPredefinito())); }
  if (SCHEDE.some(x => x[0] === id)) ultimaPrincipale = id;
  scheda = id; history.replaceState(null, '', location.pathname + location.search + (id === 'ingresso' ? '' : '#' + id)); aggiornaComando();
  disegnaScheda(); scrollTo(0, 0);
}
function disegnaScheda(){
  document.querySelectorAll('.scheda').forEach(s => s.classList.toggle('attiva', s.id === 's-' + scheda));
  document.body.classList.toggle('su-ingresso', scheda === 'ingresso');
  document.body.classList.toggle('principale', SCHEDE.some(x => x[0] === scheda));
  const inBarra = scheda === 'crea' || scheda === 'paesaggi' ? 'finestre' : scheda;
  document.querySelectorAll('#barra button').forEach(b => b.setAttribute('aria-current', b.dataset.scheda === inBarra ? 'page' : 'false'));
  ({ingresso: disegnaIngresso, finestre: disegnaFinestre, bard: disegnaBard, paesaggi: disegnaPaesaggi, crea: disegnaCrea, impostazioni: disegnaImpostazioni})[scheda]();
  aggiornaSpia();
}

/* ═══════════ INGRESSO (bozza E, 2/11): quello che c'è in onda e le cinque sezioni coi medaglioni grandi ═══ */
function cartaInOnda(){
  const p = libreria.find(x => x.id === scena.paesaggio);
  const img = p ? (p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno) : '';
  const viva = canale.pronto && Date.now() - collegate < 45000;
  const stato = !canale.pronto ? 'collego…' : !viva ? 'gli schermi non rispondono' : comandaDM() ? 'in mano a DMaster' : scena.acceso ? 'in onda' : 'spente';
  const suoni = inSerata() ? 'serata in corso' : bardStato.sottofondo ? bardStato.sottofondo.titolo : (bardStato.musica && bardStato.musica.acceso ? 'musica' : '');
  const nome = p ? p.nome : scena.yt ? 'Video di YouTube' : scena.immagini ? 'Paesaggio' : 'Nessun paesaggio';
  const sotto = [NOME_ORA[scena.ora], ((METEO.find(m => m[0] === scena.meteo) || [,,''])[2]).toLowerCase(), suoni].filter(Boolean).join(' · ');
  return `${img ? `<img class="foto" alt="" src="${esc(img)}">` : `<span class="tondo" style="display:block;line-height:0">${medaglione('finestra', 58)}</span>`}
    <span class="cosa"><span class="stato${viva ? ' viva' : ''}"><i></i>${esc((casaPrivata && casaPrivata.nome) || 'La stanza')} · ${esc(stato)}</span><b>${esc(nome)}</b><small>${esc(sotto)}</small></span>`;
}
function disegnaIngresso(){
  if (libreriaStato === 'da caricare') caricaLibreria();
  const voci = [['finestre', 'finestra', 'Illusionist', 'TV e finestrelle: ora, tempo e luce'], ['bard', 'liuto', 'Bard', inSerata() ? 'Console della serata' : 'Musiche e suoni della stanza'],
    ['paesaggi', 'paesaggio', 'Paesaggi', 'La libreria dei panorami'], ['crea', 'pennello', 'Crea', "Un paesaggio dipinto dall'AI"], ['impostazioni', 'manopole', 'Impostazioni', 'Stanza, schermi e chiavi']];
  $('#s-ingresso').innerHTML = `<header class="ingresso-testa"><div class="fili"><i></i><h1>DMaster<br>Atmosphere</h1><i></i></div><p>powered by DMaster Stage</p></header>
    <button class="in-onda-ora" id="cartaInOnda" data-fai="apriScheda" data-v="finestre" style="width:100%;text-align:left;cursor:pointer;color:inherit">${cartaInOnda()}</button>
    <nav class="voci-ingresso" aria-label="Sezioni">${voci.map(([id, med, nome, dice]) => `<button class="voce-ingresso" data-fai="apriScheda" data-v="${id}">${medaglione(med, 62)}<span class="cosa"><b>${esc(nome)}</b><small>${esc(dice)}</small></span>${icona('freccia', 18)}</button>`).join('')}</nav>
    <p class="nota" style="text-align:center;margin-top:18px">DMaster Atmosphere ${VERSIONE}</p>`;
}
function aggiornaIngresso(){ const c = $('#cartaInOnda'); if (c && scheda === 'ingresso') c.innerHTML = cartaInOnda(); }

/* ═══════════ FINESTRE: anteprima dal vivo e comandi ═════════════════════ */
const ORE = [['vera','orologio','Come fuori'], ['alba','alba','Alba'], ['giorno','sole','Giorno'], ['tramonto','tramonto','Tramonto'], ['notte','luna','Notte']];
const METEO = [['sereno','sole','Sereno'], ['nuvoloso','nuvola','Nuvoloso'], ['nebbia','nebbia','Nebbia'], ['pioggia','pioggia','Pioggia'], ['temporale','fulmine','Temporale'], ['neve','fiocco','Neve']];
const FLUIDITA = [[60,'Massima'], [50,'A 50 Hz'], [30,'Silenziosa']];
const MED_METEO = {sereno: 'giorno', nuvoloso: 'nuvoloso', nebbia: 'nebbia', pioggia: 'pioggia', temporale: 'temporale', neve: 'neve'};
const NOME_ORA = {vera:'come fuori', alba:'alba', giorno:'giorno', tramonto:'tramonto', notte:'notte'};
/* 3/11 · due anteprime (Maurizio: «vedere sull'app cosa si vede in piccolo sulle due finestrelle e su quella principale»):
   il TV (la stessa pagina con vista=est: il suo soggetto, e quello che DMaster gli manda in serata) e le due finestrelle */
let anteprimaPronta = false, anteprimaFrame = null, anteprimaTvPronta = false, anteprimaTvFrame = null, ultimoTv = null;
function postaAnteprima(m){
  if (m.tipo === 'scena') fermiAnteprima();
  if (anteprimaFrame && anteprimaPronta && m.tipo !== 'tv') anteprimaFrame.contentWindow.postMessage(m, '*');
  if (anteprimaTvFrame && anteprimaTvPronta && m.tipo !== 'fori') anteprimaTvFrame.contentWindow.postMessage(m, '*');
}
/* 8/11 · finché l'anteprima carica (immagini, profondità, video) sotto c'è l'immagine ferma della luce giusta:
   prima per molti secondi si vedeva nero (Maurizio: «ci mette tantissimo, per tanti secondi si vede nero») */
const chiaveAnteprima = s => s.yt ? 'yt:' + s.yt + ':' + (s.t || 0) : s.immagini ? 'img:' + (s.paesaggio || s.immagini.giorno) : 'niente';
function fermoAnteprima(est){
  const s = scena; if (s.yt) return `https://i.ytimg.com/vi/${encodeURIComponent(s.yt)}/hqdefault.jpg`;
  const im = s.immagini; if (!im) return '';
  const o = s.ora === 'vera' ? oraVera() : s.ora, pre = est && im['est-giorno'] ? 'est-' : '';
  return im[pre + o] || im[pre + 'giorno'] || im.giorno || '';
}
let attesaAnteprima = null;
function fermiAnteprima(){
  const k = chiaveAnteprima(scena), nuovo = k !== attesaAnteprima;
  const metti = (id, url) => { const b = $(id); if (!b) return; b.querySelectorAll('.fermo').forEach(e => { e.style.backgroundImage = url && scena.acceso !== false ? `url("${url}")` : 'none'; }); };
  metti('#anteprima', fermoAnteprima(false)); metti('#anteprimaTv', fermoAnteprima(true));
  if (nuovo){ attesaAnteprima = k; [anteprimaFrame, anteprimaTvFrame].forEach(f => { if (f) f.style.opacity = 0; }); }
}
addEventListener('message', e => {
  const d = e.data || {}; if (d.tipo !== 'pronta' || d.paesaggio !== attesaAnteprima) return;
  [anteprimaFrame, anteprimaTvFrame].forEach(f => { if (f && e.source === f.contentWindow) f.style.opacity = 1; });
});
function forieAnteprima(){
  /* l'anteprima mostra le finestre nella loro forma vera; se sono due, una accanto all'altra con un po' di muro in mezzo */
  const a = assettoOPredefinito(), f = a.finestre.sinistra, sch = schermoDi('sinistra');
  const asp = (f.w * sch.w) / (f.h * sch.h);
  /* 8/11 (Maurizio: «a destra solo una finestrella in un rettangolo, non due nel quadrato»): nell'angolo del TV ne basta una */
  if (a.n === 1 || document.querySelector('.eroe')) return {aspetto: asp, fori:[{x:0, y:0, w:1, h:1}], modo:'doppia'};
  const muro = asp * .45, tot = 2 * asp + muro;
  return {aspetto: tot, fori:[{x:0, y:0, w:asp / tot, h:1}, {x:(asp + muro) / tot, y:0, w:asp / tot, h:1}], modo:'doppia'};
}
function impaginaAnteprima(){
  const box = $('#anteprima'); if (!box) return;
  const fa = forieAnteprima();
  box.style.aspectRatio = String(fa.aspetto);
  box.style.flex = fa.aspetto + ' 1 0';   /* larghezze in proporzione alle forme: TV e finestrelle alti uguali */
  postaAnteprima({tipo:'fori', fori:fa.fori, modo:fa.modo});
  /* l'immagine ferma nelle stesse forme dei fori */
  box.querySelectorAll('.fermo').forEach(e => e.remove());
  const fr = $('#anteprimaFrame');
  fa.fori.forEach((f, i) => { const d = document.createElement('div'); d.className = 'fermo';
    Object.assign(d.style, {left: f.x * 100 + '%', top: f.y * 100 + '%', width: f.w * 100 + '%', height: f.h * 100 + '%',
      backgroundPosition: fa.fori.length > 1 ? (i ? '68% 50%' : '32% 50%') : '50% 50%'});
    box.insertBefore(d, fr); });
  fermiAnteprima();
}
const VENTI = [[null,'Auto'], [.1,'Calmo'], [.4,'Brezza'], [.8,'Forte']];
const ventoVicino = v => v == null ? null : VENTI.slice(1).reduce((m, x) => Math.abs(x[0] - v) < Math.abs(m[0] - v) ? x : m)[0];
function disegnaFinestre(){
  const s = $('#s-finestre');
  if (libreriaStato === 'da caricare') caricaLibreria();   /* 8/11: il nome del paesaggio in onda (prima la caricava l'ingresso) */
  if (!s.dataset.fatto){
    s.dataset.fatto = 1;
    s.innerHTML = testa('bifora', 'Illusionist', 'Quello che si vede adesso') + `
      <!-- 8/11 · Maurizio: «le finestrelle dentro la TV», il paesaggio in onda grande; toccandolo si cambia paesaggio -->
      <div class="eroe" data-fai="apriScheda" data-v="paesaggi" role="button" aria-label="Cambia paesaggio">
        <figure class="anteprima tv" id="anteprimaTv"><div class="fermo" style="inset:0"></div><iframe id="anteprimaTvFrame" title="Anteprima del TV" src="../finestra/?anteprima=1&vista=est"></iframe></figure>
        <figure class="anteprima" id="anteprima"><iframe id="anteprimaFrame" title="Anteprima delle finestrelle" src="../finestra/?anteprima=1"></iframe></figure>
        <div class="eroe-testo"><b id="nomeInOnda">—</b><small id="sottoInOnda"></small></div>
      </div>
      <div class="rapide in-riga">
        <button class="btn" data-fai="accendi" id="btnAccendi">${icona('accensione', 20)}<span>Accese</span></button>
        <button class="btn" data-fai="lampo">${icona('fulmine', 20)}<span>Lampo</span></button>
        <button class="btn" data-fai="apriScheda" data-v="paesaggi">${icona('quadro', 20)}<span>Paesaggi</span></button>
      </div>
      <div class="sezione">${titolo('orologio', 'Ora')}<div class="pads c5" id="sceltaOra">${ORE.map(([v, , t]) => pad('ora', v, v, t, false, 40)).join('')}</div></div>
      <div class="sezione">${titolo('nuvola', 'Tempo')}<div class="pads c6" id="sceltaMeteo">${METEO.map(([v, , t]) => pad('meteo', v, MED_METEO[v], t, false, 38)).join('')}</div>
        <div class="pannello" id="pannelloTempo" style="margin-top:10px">
          <div id="rigaIntensita">${cursore('intensita', 'goccia', 'Intensità', 0, 100, Math.round(intensitaVista() * 100), Math.round(intensitaVista() * 100) + '%')}</div>
        </div></div>
      <div class="sezione">${titolo('scintilla', 'Effetti')}<div class="pads c5" id="sceltaEffetti">${EFFETTI.map(([v, med, t]) => pad('effetto', v, med, v === 'nebbia' && scena.nebbiaSale ? 'Fai scendere la nebbia' : t, v === 'nebbia' && !!scena.nebbiaSale, 38)).join('')}</div></div>
      <div class="sezione">${titolo('quadro', 'Paesaggi')}<div class="striscia-paesaggi" id="stripPaesaggi"></div></div>`;   /* 8/11: il vento va col tempo (calmo con sereno e nebbia, brezza con nuvoloso, pioggia e neve, forte col temporale); la luce sta in Impostazioni → Avanzate */
    anteprimaFrame = $('#anteprimaFrame');
    anteprimaFrame.onload = () => { anteprimaPronta = true; impaginaAnteprima(); postaAnteprima({tipo:'scena', scena}); };
    anteprimaTvFrame = $('#anteprimaTvFrame');
    anteprimaTvFrame.onload = () => { anteprimaTvPronta = true; anteprimaTvFrame.contentWindow.postMessage({tipo:'scena', scena}, '*'); if (ultimoTv) anteprimaTvFrame.contentWindow.postMessage({tipo:'tv', tv: ultimoTv}, '*'); };
    legaCursore('intensita', (v, o) => { o.textContent = v + '%';
      /* mentre la nebbia sale il cursore la segue: se lo muovi tu, comandi tu (la nebbia che sale si ferma e torna giù) */
      cambia(salita() > 0 && scena.meteo === 'nebbia' ? {intensita: v / 100, nebbiaSale: false, nebbiaSaleDa: Date.now(), nebbiaSaleK0: 0} : {intensita: v / 100}, false); });

    impaginaAnteprima();
  }
  aggiornaFinestre();
}
/* 8/11 · sotto il Tempo (Maurizio: «A + C, con elenco dipinto per C»): i paesaggi da scorrere e gli effetti a comando */
const EFFETTI = [['meteora', 'stella', 'Stella cadente'], ['stormo', 'stormo', 'Stormo'], ['raffica', 'raffica', 'Raffica'], ['tuono', 'tuono', 'Tuono lontano'], ['nebbia', 'nebbia', 'Nebbia che sale']];
let firmaStrip = '';
function disegnaStrip(){
  const el = $('#stripPaesaggi'); if (!el) return;
  const lista = libreria.slice().sort((a, b) => (b.id === scena.paesaggio) - (a.id === scena.paesaggio));
  const firma = lista.map(p => p.id).join(',') + '|' + scena.paesaggio + '|' + libreriaStato;
  if (firma === firmaStrip) return; firmaStrip = firma;
  el.innerHTML = (libreriaStato !== 'ok' && !lista.length ? `<p class="nota">${libreriaStato === 'carico' || libreriaStato === 'da caricare' ? 'Carico i paesaggi…' : esc(libreriaStato)}</p>` : '')
    + lista.map(p => { const img = p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno;
      return `<button class="mini-paes" data-fai="mostra" data-v="${p.id}" aria-pressed="${p.id === scena.paesaggio}"><img alt="" loading="lazy" src="${esc(img)}"><span>${esc(p.nome)}</span></button>`; }).join('')
    + `<button class="mini-paes nuovo" data-fai="aggiungiPaesaggio">${icona('piu', 20)}<span>Nuovo</span></button>`;
}
/* ⚠ 9/11 (Maurizio: «facciamo salire e scendere il cursore della %»): con la nebbia che sale anche la percentuale
   della nebbia sale (fino al 70%, o resta dov'è se è già più su: più in alto l'abbazia spariva) e torna dov'era quando la fai scendere. Stessi
   tempi degli schermi: 25 s su, 30 s giù. Il valore scelto da te resta in scena.intensita */
const liscio = x => x * x * (3 - 2 * x);
function salita(){
  const k0 = scena.nebbiaSaleK0 ?? (scena.nebbiaSale ? 1 : 0), t = (Date.now() - (scena.nebbiaSaleDa || 0)) / 1000;
  return scena.nebbiaSale ? Math.min(1, k0 + t / 25) : Math.max(0, k0 - t / 30);
}
function intensitaVista(){ const b = scena.intensita ?? .75; if (scena.meteo !== 'nebbia') return b; return b + (Math.max(b, .7) - b) * liscio(salita()); }
function mostraIntensita(){
  const ri = $('#intensita'), iv = Math.round(intensitaVista() * 100);
  if (ri && document.activeElement !== ri && +ri.value !== iv){ ri.value = iv; riempi(ri); const o = $('#intensita-o'); if (o) o.textContent = iv + '%'; }
}
setInterval(() => { if (scheda === 'finestre' && !document.hidden) mostraIntensita(); }, 250);
const eNotte = () => (scena.ora === 'vera' ? oraVera() : scena.ora) === 'notte';
const luceAdesso = () => Math.round(eNotte() ? (scena.luceNotte ?? 40) : (scena.luceGiorno ?? 70));
function aggiornaFinestre(){
  const s = $('#s-finestre'); if (!s.dataset.fatto) return;
  s.querySelectorAll('[data-fai="ora"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.ora)));
  s.querySelectorAll('[data-fai="meteo"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === scena.meteo)));
  const vv = ventoVicino(scena.vento);
  s.querySelectorAll('[data-fai="vento"]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '' ? null : +b.dataset.v) === vv)));
  disegnaStrip();
  $('#rigaIntensita').hidden = scena.meteo === 'sereno'; $('#pannelloTempo').hidden = scena.meteo === 'sereno';
  /* 9/11: l'intensità segue la scena anche quando la cambia un altro telefono o la riprendo dagli schermi */
  mostraIntensita();
  /* 9/11: le stelle cadenti si vedono solo di notte e a cielo sgombro, gli uccelli di notte dormono: il pulsante lo dice */
  const notte = eNotte(), coperto = ['nebbia', 'pioggia', 'temporale', 'neve'].includes(scena.meteo);
  const pn = s.querySelector('[data-fai="effetto"][data-v="nebbia"]');
  if (pn){ pn.setAttribute('aria-pressed', String(!!scena.nebbiaSale)); const t = pn.querySelector('span:last-child'); if (t) t.textContent = scena.nebbiaSale ? 'Fai scendere la nebbia' : 'Nebbia che sale'; pn.title = t ? t.textContent : ''; }
  s.querySelectorAll('[data-fai="effetto"]').forEach(b => b.classList.toggle('fuori-ora', b.dataset.v === 'meteora' ? !notte || coperto : b.dataset.v === 'stormo' ? notte : false));
  const rl = $('#luceOra'); if (rl && document.activeElement !== rl){ rl.value = luceAdesso(); riempi(rl); const o = $('#luceOra-o'); if (o) o.textContent = luceAdesso() + '%'; }
  $('#btnAccendi').innerHTML = icona('accensione', 20) + '<span>' + (scena.acceso ? 'Accese' : 'Spente') + '</span>';
  $('#btnAccendi').classList.toggle('oro', !!scena.acceso);
  const p = libreria.find(x => x.id === scena.paesaggio);
  $('#nomeInOnda').textContent = p ? p.nome : scena.yt ? 'Video di YouTube' : scena.immagini ? (libreriaStato === 'ok' && scena.paesaggio ? 'Paesaggio eliminato: scegline un altro' : 'Paesaggio') : 'Nessun paesaggio';
  $('#sottoInOnda').textContent = [NOME_ORA[scena.ora], (METEO.find(m => m[0] === scena.meteo) || [,,''])[2].toLowerCase()].filter(Boolean).join(' · ');
}

/* ═══════════ PAESAGGI: libreria, foto dal web, YouTube ══════════════════ */
let libreria = [], libreriaStato = 'da caricare', vistaPaesaggi = 'miei', filtroTesto = '', risultatiWeb = [], cercaWebTesto = '', cercaWebStato = '';
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
  try { libreria = await leggiLibreria(casa); libreriaStato = 'ok'; setTimeout(profonditaInSottofondo, 1500); setTimeout(richiestaInRete, 2500); }
  catch(e) { libreriaStato = e.message; }
  if (scheda === 'paesaggi') disegnaPaesaggi(); if (scheda === 'finestre') aggiornaFinestre();
}
/* 5/11 · la data in cui è stato creato (l'id è l'istante di creazione in base 36): distingue i doppioni con lo stesso nome */
const dataPaesaggio = p => { const t = p.creato || parseInt(p.id, 36); if (!t || t < 1.6e12 || t > 2.2e12) return '';
  return new Date(t).toLocaleDateString('it-IT', {day:'numeric', month:'short'}) + ' ' + new Date(t).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}); };
const cartaPaesaggio = p => {
  const inOnda = scena.paesaggio === p.id;
  const img = p.yt ? `https://i.ytimg.com/vi/${encodeURIComponent(p.yt)}/hqdefault.jpg` : p.immagini.giorno;
  const pos = p.fuoco ? `object-position:${Math.round(p.fuoco.x * 100)}% 50%` : '';
  const segni = [p.yt ? icona('scena', 12) : '', p.immagini['est-giorno'] ? icona('tv', 12) : '', Object.keys(p.animati).length ? icona('anima', 12) : '', ['alba','tramonto','notte'].every(o => p.immagini[o]) ? icona('luna', 12) : ''].join('');
  return `<button class="carta" data-fai="apri" data-v="${p.id}" aria-pressed="${inOnda}">
    <img loading="lazy" alt="" src="${esc(img)}" style="${pos}">${inOnda ? '<span class="inonda"><i></i>IN ONDA</span>' : ''}
    <span class="su"><b>${esc(p.nome)}</b><small>${segni}${esc(dataPaesaggio(p) || TIPI[p.tipo] || '')}</small></span></button>`;
};
function disegnaPaesaggi(){
  if (libreriaStato === 'da caricare') caricaLibreria();
  const s = $('#s-paesaggi');
  const indietro = `<button class="btn piccolo" data-fai="vistaP" data-v="miei" style="margin-bottom:12px">${icona('indietro', 16)}I miei paesaggi</button>`;
  let corpo = '';
  if (vistaPaesaggi === 'miei'){
    const elenco = filtraLibreria(libreria, filtroTesto, null);
    corpo = `<div class="riga-cerca"><div class="cerca">${icona('lente', 18)}<input id="cercaMiei" type="search" placeholder="Cerca…" value="${esc(filtroTesto)}" autocomplete="off"></div>
        <button class="btn oro" data-fai="aggiungiPaesaggio">${icona('piu', 18)}Nuovo</button></div>
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
  apriFoglio(`<h3 class="foglio-titolo">Nuovo paesaggio</h3><div class="scelte">
    ${riga('vaiCrea', 'scintilla', 'Dipinto dall\'AI', 'Lo descrivi, lo dipinge con le luci del giorno e la vista per il TV')}
    ${riga('aggiungiWebVai', 'mondo', 'Foto vera dal web', 'Da Wikimedia Commons' + (imp.chiavi.pexels ? ' e Pexels' : ''))}
    ${riga('aggiungiYTVai', 'scena', 'Video di YouTube', 'Un video in loop, muto')}</div>`);
  foglioAperto = 'aggiungi-paesaggio';
}

/* che cosa manca a un paesaggio per essere completo come uno appena creato */
const cieliMancanti = p => imp.cielo === false ? [] : ['giorno','alba','tramonto','notte'].filter(o => p.immagini[o] && !p.immagini['cielo-' + o]);
function cosaManca(p){
  if (p.yt || !p.immagini.giorno) return [];
  const m = ['alba','tramonto','notte'].filter(o => !p.immagini[o]);
  if (!p.immagini['est-giorno']) m.push('tv');
  if (cieliMancanti(p).length) m.push('cielo');   /* 8/11: anche quando manca il cielo di una luce sola (di notte le nuvole erano ferme) */
  if (!p.immagini.comignoli || (p.immagini['est-giorno'] && !p.immagini['est-comignoli'])) m.push('fumo');
  /* 4/11 (Maurizio: «bisogna avere anche sul TV le animazioni come sulle finestrelle»): se le finestrelle sono
     animate, anche il TV */
  /* 4/11: se il paesaggio è animato, lo sono tutte le luci, finestrelle e TV («devo avere animazioni sui 4 momenti»).
     Contano anche le luci e la vista TV che Completa sta per fare */
  if (MODELLI_VIDEO.length && animiDaFare(p, m)) m.push('anim');   /* 10/11: ogni paesaggio è animato, tutte le luci */
  return m;
}
function animiDaFare(p, manca = cosaManca(p)){
  let n = 0;
  for (const ora of oreDaAnimare()){
    if ((p.immagini[ora] || manca.includes(ora)) && !p.animati[ora]) n++;
    const est = p.immagini['est-' + ora] || (manca.includes('tv') && (ora === 'giorno' || p.immagini[ora] || manca.includes(ora)));
    if (est && !p.animati['est-' + ora]) n++;
  }
  return n;
}
function costoCompleta(manca, p = null){
  const m = Ai.modello(imp.modello), c = m.costo[imp.qualita] || m.costo.alta, nLuci = manca.filter(o => NOME_ORA[o]).length;
  const mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0];
  return c * 1.15 * nLuci + (manca.includes('tv') ? c * 1.3 * (1 + 3 * 1.15) : 0) + (manca.includes('cielo') ? c * Math.max(1, p ? cieliMancanti(p).length : 4) : 0) + (manca.includes('fumo') ? .01 : 0) + (manca.includes('anim') && mv && p ? mv.euroSecondo * imp.video.secondi * animiDaFare(p, manca.filter(x => x !== 'anim')) : 0);
}
/* Completa: le luci, la profondità, la vista per il TV, il cielo, il fumo e le animazioni che mancano */
async function completaPaesaggio(p, desc = ''){
  const m = Ai.modello(imp.modello);
  await conLavoro('completa', async L => {
    L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
    const manca = cosaManca(p), luci = ['alba','tramonto','notte'].filter(o => manca.includes(o));
    const foto = await (await fetch(p.immagini.giorno)).blob(), mis = await misuraDi(foto);
    /* come quando si crea: con la vista per il TV, all'alba il sole si vede solo nel TV (mai due soli) */
    if (luci.length){ await faiLuci(p, foto, luci, m.fornitore === 'openai' ? mis.openai : mis.largo ? 'tv' : null, {conTv: true}); aggiornaInLibreria(p); }
    if (!p.immagini.profondita){ await faiProfondita(p, foto); aggiornaInLibreria(p); }
    if (manca.includes('tv')){ try { await faiVistaEst(p, foto, desc, luci.includes('alba')); aggiornaInLibreria(p); } catch(e) { passo('est-giorno', 'errore', 'TV · vista verso est: ' + e.message); segnala(e); } }
    if (manca.includes('cielo')){ await faiCieli(p, true); aggiornaInLibreria(p); }
    if (manca.includes('fumo')){
      if (!p.immagini.comignoli){ await faiComignoli(p, foto); aggiornaInLibreria(p); }
      if (p.immagini['est-giorno'] && !p.immagini['est-comignoli']){ await faiComignoli(p, await (await fetch(p.immagini['est-giorno'])).blob(), true); aggiornaInLibreria(p); }
    }
    if (manca.includes('anim')) await animaTutto(p, animMancanti(p));
  });
}
/* 8/11 · «Migliora con l'AI»: quanto costa e che cosa fa (con stretta = il panorama va rifatto largo per le finestrelle) */
function costoMigliora(p, stretta){
  const manca = cosaManca(p);
  if (!stretta) return costoCompleta(manca, p);
  const mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0];
  /* le finestrelle, rifatte larghe, più quelle del TV che mancano */
  const nTv = p.immagini['est-giorno'] ? ['giorno','alba','tramonto','notte'].filter(o => p.immagini['est-' + o] && !p.animati['est-' + o]).length : 0;
  const video = MODELLI_VIDEO.length ? mv.euroSecondo * imp.video.secondi * (4 + nTv) : 0;
  return costoRifaiLargo(p) + video + costoCompleta(manca.filter(x => !['anim','cielo','fumo'].includes(x)), p);
}
function cosaFaMigliora(p, stretta){
  const v = [];
  if (stretta) v.push('l\'immagine rifatta più larga per le due finestrelle (con luci, fumo e cielo)');
  for (const o of cosaManca(p)) if (!(stretta && ['cielo','fumo'].includes(o))) v.push(NOME_MANCA[o]);
  if (stretta && !v.some(x => /animazion/.test(x))) v.push('le animazioni delle finestrelle');
  return v.length ? 'Aggiunge da sé: ' + v.join(', ') + '.' : '';
}
const NOME_MANCA = {alba:'l\'alba', tramonto:'il tramonto', notte:'la notte', tv:'la vista per il TV', cielo:'il cielo che scorre', anim:'le animazioni che mancano', fumo:'il fumo dai comignoli'};

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
        <p class="nota" style="margin:0">${esc(TIPI[p.tipo] || '')}${Object.keys(p.animati).length ? ' · animato' : ''}${dataPaesaggio(p) ? ' · creato il ' + esc(dataPaesaggio(p)) : ''}</p>
        ${p.yt ? '' : `<div class="luci">${ora.map(o => p.immagini[o] ? `<button data-fai="vediLuce" data-v="${o}" aria-pressed="${o === 'giorno'}"><img alt="" src="${esc(p.immagini[o])}" style="object-position:${Math.round(fx * 100)}% 50%"><span>${NOME_ORA[o].toUpperCase()}</span></button>` : `<span class="manca" title="manca">${icona(o === 'notte' ? 'luna' : o === 'giorno' ? 'sole' : o, 16)}</span>`).join('')}</div>`}
        ${p.immagini['est-giorno'] ? `<button class="tv-mini" data-fai="vediLuce" data-v="est-giorno"><img alt="" src="${esc(p.immagini['est-giorno'])}"><span>${icona('tv', 13)}TV</span></button>` : ''}
      </div>
    </div>
    <button class="btn oro piena" style="margin-top:14px" data-fai="mostra" data-v="${p.id}">${icona('play', 18)}Mostra alle finestre</button>
    ${''/* 10/11 (Maurizio: «togliamo il tasto completa»): i paesaggi nuovi nascono completi; i tre vecchi li completa
         Claude da lontano (aggiornaVecchi, sotto) */}
    <details class="gruppo" style="margin-top:12px"><summary>${icona('manopole', 18)}<span>Altro</span></summary><div class="dentro-gruppo">
      ${p.yt ? '' : `${cursore('inquadra', 'mirino', 'Inquadratura', 0, 100, Math.round(fx * 100), fx === .5 ? 'centro' : Math.round(fx * 100) + '%')}
        <p class="nota" style="margin:0 0 10px">Quale parte dell'immagine si vede nel foro, se è più larga.</p>
        <label class="campo"><span>Che cosa si vede nel TV (facoltativo)</span><input id="tvDesc" placeholder="Vuoto: lo sceglie l'AI"></label>`}
      <div class="azioni">
        ${p.yt || !MODELLI_VIDEO.length ? '' : `<button class="btn" data-fai="anima" data-v="${p.id}">${icona('anima', 18)}Animazioni</button>`}
        ${p.yt || !p.immagini['est-giorno'] ? '' : `<button class="btn" data-fai="vistaTv" data-v="${p.id}">${icona('tv', 18)}Rifai la vista del TV</button>`}
        ${p.yt || manca.includes('cielo') ? '' : `<button class="btn" data-fai="cieli" data-v="${p.id}">${icona('nuvola', 18)}Rifai il cielo</button>`}
        ${p.yt ? '' : `<button class="btn" data-fai="fumo" data-v="${p.id}">${icona('fiamma', 18)}Dove sale il fumo</button>`}
        <button class="btn" data-fai="modifica" data-v="${p.id}">${icona('matita', 18)}Rinomina</button>
      </div>
      <button class="btn pericolo piena" style="margin-top:12px" data-fai="elimina" data-v="${p.id}">${icona('cestino', 18)}Elimina questo paesaggio</button></div></details>
    <div id="lavoroFoglio"></div>`, el => {
      let tFuoco = null;
      if (!p.yt && p.immagini.giorno){ const prova = new Image(); prova.onload = () => { const stretta = prova.naturalWidth / prova.naturalHeight < 1.2;
        if (stretta && foglioAperto === p.id){ const b = $('#migliora'), n = $('#miglioraNota');
          if (b){ b.hidden = false; b.dataset.stretta = '1'; b.innerHTML = icona('scintilla', 18) + "Completa con l'AI · ≈ " + euro(costoMigliora(p, true)); }
          if (n){ n.hidden = false; n.textContent = cosaFaMigliora(p, true); } } }; prova.src = p.immagini.giorno; }
      legaCursore('inquadra', (v, o) => {
        o.textContent = v === 50 ? 'centro' : v + '%';
        el.querySelectorAll('.grande img, .luci img').forEach(i => i.style.objectPosition = v + '% 50%');
        p.fuoco = {x: v / 100};
        if (scena.paesaggio === p.id) cambia({fuoco: p.fuoco}, false);
        clearTimeout(tFuoco); tFuoco = setTimeout(() => rinominaPaesaggio(casa, p, p.nome, p.parole, p.fuoco).then(() => { if (scheda === 'paesaggi') disegnaPaesaggi(); }).catch(e => avviso(e.message, true)), 1600);
      });
    });
}

let editorFumo = null;
function disegnaEditorFumo(){
  const E = editorFumo; if (!E) return;
  const est = E.vista === 'est', img = E.p.immagini[est ? 'est-giorno' : 'giorno'], punti = E.punti[E.vista] || [];
  apriFoglio(`
    <h3 style="font:500 16px var(--display);letter-spacing:.12em;text-transform:uppercase;margin:4px 0 4px">Fumo dai comignoli</h3>
    <p class="nota" style="margin-top:0">Il fumo lo disegnano le finestre, dal vivo: sale dritto con la calma e si piega col vento. Tocca l'immagine per aggiungere un comignolo (sulla cima), tocca un punto per toglierlo.</p>
    ${E.p.immagini['est-giorno'] ? `<div class="segmenti" style="margin-bottom:10px"><button data-fai="fumoVista" data-v="nord" aria-pressed="${!est}">Finestrelle</button><button data-fai="fumoVista" data-v="est" aria-pressed="${est}">TV</button></div>` : ''}
    <div id="fumoImg" style="position:relative;border-radius:12px;overflow:hidden;touch-action:manipulation;${est ? '' : 'max-width:60%;margin:0 auto'}">
      <img alt="" src="${esc(img)}" style="display:block;width:100%">
      ${punti.map((q, i) => `<i data-i="${i}" style="position:absolute;left:${q.x * 100}%;top:${q.y * 100}%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(212,175,55,.65);box-shadow:0 0 0 2px rgba(0,0,0,.45)"></i>`).join('')}
    </div>
    <p class="nota">${punti.length ? punti.length + (punti.length === 1 ? ' comignolo' : ' comignoli') : (E.punti[E.vista] ? 'Nessun comignolo: niente fumo in questa vista.' : 'Non ancora cercati.')}</p>
    <div class="azioni"><button class="btn" id="fumoTrova" data-fai="fumoTrova">${icona('scintilla', 18)}Trova con l'AI · ≈ ${euro(.01)}</button>
      <button class="btn oro" data-fai="fumoSalva" ${Object.keys(E.cambiati).length ? '' : 'disabled'}>${icona('spunta', 18)}Salva</button></div>`, el => {
    const box = el.querySelector('#fumoImg');
    box.onclick = ev => {
      const r = box.getBoundingClientRect(), t = ev.target.closest('i[data-i]');
      const prima = E.punti[E.vista] || [], lista = E.punti[E.vista] = prima.slice(); lista.fuochi = prima.fuochi;   /* 9/11: i fuochi lontani restano */
      if (t) lista.splice(+t.dataset.i, 1);
      else if (lista.length < 6) lista.push({x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height, w: est ? .04 : .06});
      else { avviso('Al massimo 6 comignoli per vista.', true); return; }
      E.cambiati[E.vista] = true; disegnaEditorFumo();
    };
  });
  foglioAperto = E.p.id;
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
  ['acqua','onda','Acqua','the river and water flowing and glittering naturally'],
];
/* ⚠ 5/11 · il fumo non si chiede più all'AI (Maurizio: ok): lo disegna la finestra dai comignoli, mai in loop e
   piegato dal vento; nel video l'AI lo faceva uscire anche dal campanile e al giro saltava */
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
/* 4/11 · IL TRUCCO DELLA PROSPETTIVA (Maurizio, bozza C): con due finestrelle la vista nord è un panorama largo 16:9,
   alto quanto lo schermo; ogni finestrella ne mostra una striscia, la sinistra a sinistra dell'elemento cardine, la destra
   a destra. Per questo l'elemento sta esattamente al centro ed è piccolo (un decimo della larghezza: davanti a una
   finestrella entra quasi intero, dal centro della stanza resta nascosto), e intorno c'è paesaggio bello da solo */
function promptLargo(descrizione, stile){
  const s = STILI.find(x => x.id === stile) || STILI[0];
  return `${s.prefisso}.
One wide panoramic landscape picture (16:9) of the land seen from a high window of a medieval house, looking out at: ${descrizione}.
The picture IS the view itself: no window frame, no walls, no curtains, no sill, nothing of the room in the foreground.
Composition: the main subject stands EXACTLY at the horizontal centre of the picture, compact and fairly small, about one tenth of the picture width, fully visible and seen from a distance. On both sides of it the land continues for a long way: hills, fields, woods, a river, roads, farmhouses, distant villages, rich and interesting to look at on its own, but with no other dominant landmark. A generous sky in the upper part, the land descending toward the viewer in the lower part; natural eye-level perspective, the horizon level, believable scale and deep atmospheric distance with several layers (near, middle, far).
No people in the foreground, no text, no signature, no watermark, no border, no vignette.
${LUCI.giorno}`;
}
const largoPerLeFinestrelle = () => assettoOPredefinito().n === 2;
/* 5/11 · RIFAI LARGO (Maurizio: «rifai per tutti i paesaggi», da zero). I paesaggi fatti prima del trucco hanno la vista
   nord stretta (2:5): si ridipinge il panorama largo guardando quello vecchio (stesso posto, stesso stile, stessi
   colori), col soggetto più piccolo ed esattamente al centro. Poi le altre luci, la profondità, il fumo e il cielo
   che scorre; le animazioni delle finestrelle si tolgono (erano dell'immagine vecchia). Il TV non si tocca. */
function promptRifaiLargo(p){
  const parole = (Array.isArray(p.parole) ? p.parole : []).filter(x => !/^fx\d+$/.test(x));
  return promptLargo(p.nome + (parole.length ? ' (' + parole.join(', ') + ')' : ''), p.tipo)
    + '\nThe attached picture shows this same place in a narrow vertical frame: use it only as a reference for the place, the main subject, the painting style and the colours, and repaint it as this wide panorama, with the main subject smaller and exactly at the horizontal centre.';
}
const costoRifaiLargo = p => { const m = Ai.modello(imp.modello), c = m.costo[imp.qualita] || m.costo.alta, nLuci = ['alba','tramonto','notte'].filter(o => p.immagini[o]).length;
  return c * (1 + 1.15 * nLuci) + (p.immagini['cielo-giorno'] ? c * (1 + nLuci) : 0) + .01; };
async function rifaiLargo(p){
  const m = Ai.modello(imp.modello);
  if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave ' + (m.fornitore === 'google' ? 'Google' : 'OpenAI') + ' nelle Impostazioni → AI e chiavi.', true); return; }
  await conLavoro('largo', async L => {
    L.p = p; L.anteprime.giorno = {url:p.immagini.giorno};
    passo('giorno', 'ora', 'Finestrelle · panorama largo: lo dipingo con ' + m.nome + '…');
    const ref = await (await fetch(p.immagini.giorno)).blob();
    const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptRifaiLargo(p), foto:ref, misura:'tv',
      bozza: b64 => { L.anteprime.giorno = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
    const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
    /* le animazioni delle finestrelle erano dell'immagine stretta: via (quelle del TV restano) */
    const vecchi = p.file.filter(n => /_(?:anim|fermo|maschera)-(?:giorno|alba|tramonto|notte)(?:-originale)?\.\w+$/.test(n));
    try { await togliFile(casa, p, vecchi); } catch(e) { passo('via', 'errore', 'Animazioni vecchie non tolte: ' + e.message); }
    for (const k of Object.keys(p.animati)) if (!k.startsWith('est-')) delete p.animati[k];
    for (const k of Object.keys(p.immagini)) if (/^(?:fermo|maschera)-/.test(k)) delete p.immagini[k];
    p.immagini.giorno = await caricaLuce(casa, p, 'giorno', jpg);
    L.anteprime.giorno = {url:p.immagini.giorno}; passo('giorno', 'fatto', 'Finestrelle · panorama largo');
    /* ⚠ 10/11 (Maurizio: «se si interrompe a metà?»): le luci, la profondità e i comignoli dell'immagine stretta non
       valgono più per quella larga: si tolgono subito, PRIMA di rifarli. Se il lavoro si ferma a metà (crediti finiti,
       telefono spento) quello che manca risulta mancante davvero e la volta dopo si rifà; prima restavano quelli
       stretti, mescolati con il giorno largo, e nessuno li avrebbe più rifatti */
    const oreLarghe = ['alba','tramonto','notte'].filter(o => p.immagini[o]);
    const stretti = p.file.filter(n => /_(?:alba|tramonto|notte|profondita|comignoli)\.(?:jpg|png|json)$/.test(n));
    try { await togliFile(casa, p, stretti); for (const k of [...oreLarghe, 'profondita', 'comignoli']) delete p.immagini[k]; }
    catch(e) { passo('via2', 'errore', 'Immagini strette non tolte: ' + e.message); }
    aggiornaInLibreria(p);
    await faiLuci(p, jpg, oreLarghe, 'tv', {conTv: true}); aggiornaInLibreria(p);
    await faiProfondita(p, jpg); aggiornaInLibreria(p);
    await faiComignoli(p, jpg); aggiornaInLibreria(p);
    if (p.immagini['cielo-giorno'] && imp.cielo !== false){ await faiCieli(p); aggiornaInLibreria(p); }
  });
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
const promptAnima = (el, sec) => `[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image1] A single continuous, unbroken shot of about ${sec} seconds, no scene cuts, of exactly this landscape. Locked-off static camera on a tripod: the camera does not move at all (no pan, no tilt, no zoom, no dolly, no shake). Gentle, natural, real-time motion only: ${el.map(e => (ELEMENTI.find(x => x[0] === e) || [])[3]).filter(Boolean).join('; ')}. Buildings, towers, rocks, mountains, fields and the ground stay perfectly still and identical in every frame, with no shimmering. Everything that moves keeps the same slow speed and direction for the whole clip. No birds, no smoke from chimneys, towers or anywhere, no mist or fog appearing, growing or fading, no new clouds popping in, no light change. Same framing, light and colors as the image for the whole clip. No people, no animals, no text, no dialogue, no music. Use this image as the first frame and the last frame.`;

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
const misuraDi = async blob => { const b = await createImageBitmap(blob), largo = b.width / b.height > 1.2;
  return {w:b.width, h:b.height, largo, openai: largo ? 'tv' : Math.abs(b.width / b.height - .4) < .03 ? '832x2080' : '1024x1536'}; };

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
async function faiCieli(p, soloMancanti = false){
  const ore = soloMancanti ? cieliMancanti(p) : ['giorno','alba','tramonto','notte'].filter(o => p.immagini[o]);
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
  await faiComignoli(p, jpg, true);
}
/* 4/11 · il fumo dei comignoli: l'AI guarda la luce del giorno e dice dove sale (js/ai.js trovaComignoli); il fumo
   lo disegna poi la finestra, dal vivo. Pochi centesimi; se non riesce il paesaggio va bene lo stesso */
async function faiComignoli(p, foto, est = false){
  const k = (est ? 'est-' : '') + 'fumo', eti = (est ? 'TV · ' : '') + 'Fumo dai comignoli';
  passo(k, 'ora', eti + ': cerco dove sale…');
  try {
    const punti = await Ai.trovaComignoli({chiavi: imp.chiavi, foto});
    p.immagini[(est ? 'est-' : '') + 'comignoli'] = await caricaComignoli(casa, p, est, punti) + '?v=' + Date.now().toString(36);
    passo(k, 'fatto', eti + ': ' + (punti.length ? punti.length + (punti.length === 1 ? ' comignolo' : ' comignoli') : 'nessuna casa da cui farlo salire'));
  } catch(e) { passo(k, 'errore', eti + ': ' + e.message); }
}
async function faiAnimazione(p, foto, ora, elementi, tv = false){
  const pre = tv ? 'est-' : '', eti = (tv ? 'TV · ' : '') + (ora !== 'giorno' ? NOME_ORA[ora][0].toUpperCase() + NOME_ORA[ora].slice(1) + ' · ' : ''), ka = pre + 'anim-' + ora, kf = pre + 'fermo-' + ora;
  const mv = MODELLI_VIDEO.find(m => m.id === imp.video.modello) || MODELLI_VIDEO[0];
  passo(ka, 'ora', `${eti}Animazione con ${mv.nome}: in coda…`); lavoro.av = 0;
  /* la vista nord larga (il trucco della prospettiva) si anima intera, orizzontale come quella del TV */
  const largo = !tv && (await misuraDi(foto)).largo;
  const mp4 = await Ai.anima({chiave:imp.chiavi.google, modello:mv.id, foto, fuoco:p.fuoco, tv: tv || largo, prompt:promptAnima(elementi, imp.video.secondi),
    progresso:(pc, st) => { lavoro.av = pc; passo(ka, 'ora', `${eti}Animazione con ${mv.nome}: ${st === 'invio' ? 'la mando' : st === 'scarico' ? 'la scarico' : 'la sta girando'}… ${Math.round(pc)}%`); }});
  passo(ka, 'ora', eti + 'Animazione: la salvo…');
  p.animati[pre + ora] = tv ? await caricaEstAnimazione(casa, p, ora, mp4) : await caricaAnimazione(casa, p, ora, mp4);
  lavoro.av = null; passo(ka, 'fatto', eti + 'Animazione (' + imp.video.secondi + ' s, in loop)');
  /* subito: che cosa resta fermo e che cosa si muove (così le finestre non tremano mai); il video a piena
     qualità lo rifà poi il Raspberry, con calma */
  passo(kf, 'ora', eti + 'Animazione: separo quello che si muove da quello che sta fermo…');
  try {
    const r = await Fermo.analizza(mp4, pc => passo(kf, 'ora', `${eti}Animazione: separo quello che si muove da quello che sta fermo… ${Math.round(pc)}%`));
    p.immagini[pre + 'fermo-' + ora] = tv ? await caricaEstFermo(casa, p, ora, r.fermo) : await caricaFermo(casa, p, ora, r.fermo);
    p.immagini[pre + 'maschera-' + ora] = tv ? await caricaEstMaschera(casa, p, ora, r.maschera) : await caricaMaschera(casa, p, ora, r.maschera);
    passo(kf, 'fatto', `Paesaggio fermo, ${r.parteViva > .01 ? 'vivo dove si muove davvero (' + Math.round(r.parteViva * 100) + '%)' : 'nessuna parte viva oltre al cielo'}`);
  } catch(e) { passo(kf, 'errore', 'Separazione non riuscita (la farà il Raspberry): ' + e.message); }
}
/* 4/11 · le animazioni su tutte e quattro le luci (Maurizio: «devo avere animazioni sui 4 momenti, sia sulle finestrelle
   sia sul TV»). Ogni luce che ha la sua immagine ha il suo video; la finestra lo sceglie da sé (an[ora]) */
/* 8/11 · RISPARMIO (Maurizio: «9 dollari per animare, come risparmiamo?»): di norma si anima solo il giorno, finestrelle e
   TV; alba, tramonto e notte usano quel video ricolorato con la loro luce (js/vista.js). Un video per luce solo se lo si
   sceglie in Anima o se si spegne «Risparmio» nelle Impostazioni */
const oreDaAnimare = () => imp.risparmio !== false ? ['giorno'] : ['giorno','alba','tramonto','notte'];
const nVideoCrea = () => 8;   /* 10/11: 4 luci × finestrelle e TV */
function animMancanti(p, viste = [false, true], ore = oreDaAnimare()){
  const m = [];
  for (const tv of viste) for (const ora of ore){
    const pre = tv ? 'est-' : '';
    if (p.immagini[pre + ora] && !p.animati[pre + ora]) m.push({tv, ora});
  }
  return m;
}
async function animaTutto(p, quali){
  if (!imp.chiavi.google){ passo('anim', 'errore', 'Animazioni: serve la chiave Google (Gemini) nelle Impostazioni'); return; }
  for (const {tv, ora} of quali){
    const pre = tv ? 'est-' : '';
    try { await faiAnimazione(p, await (await fetch(p.immagini[pre + ora])).blob(), ora, imp.elementi, tv); aggiornaInLibreria(p); }
    catch(e) {
      passo(pre + 'anim-' + ora, 'errore', (tv ? 'TV · ' : '') + 'Animazione ' + NOME_ORA[ora] + ': ' + e.message); segnala(e);
      if (e.tipo === 'credito' || e.tipo === 'chiave') break;      /* inutile provare le altre */
    }
  }
}
/* il pulsante del foglio Animazioni: quanti video e quanto */
function contaAnim(mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0]){
  const b = $('#animaVia'); if (!b || !mv) return;
  const n = document.querySelectorAll('.anim-casella[aria-pressed="true"]').length;
  b.disabled = !n;
  b.innerHTML = icona('anima', 18) + (n ? `Anima ${n} video · ≈ ${euro(mv.euroSecondo * imp.video.secondi * n)}` : 'Tocca un video da fare');
}
/* ═══ 10/11 · I PAESAGGI DELLE VERSIONI VECCHIE (Maurizio: «togliamo il tasto completa e ti chiedo di completarle da qui»;
   «come oggi: rifalli larghi»). Claude manda sul canale «aggiornaVecchi» {ids, chiave}; il telefono, che ha le chiavi
   dell'AI, mostra che cosa fa e quanto costa e parte al tocco di «Avvia» (spende soldi: senza conferma non parte mai).
   Ogni paesaggio diventa come uno creato oggi: immagine larga per le finestrelle, 4 luci, vista per il TV, cielo, fumo,
   8 animazioni. Come va lo scrive in finestre/banco/lavoro-telefono.json, così Claude lo segue da lontano */
let aggiornaFatti = new Set(leggi('atm-aggiorna-fatti', []));
async function strettaDi(p){ try { return !(await misuraDi(await (await fetch(p.immagini.giorno)).blob())).largo; } catch(e) { return false; } }
async function costoAggiorna(p, stretta){
  const m = Ai.modello(imp.modello), c = m.costo.alta, mv = MODELLI_VIDEO[0];
  const luci = ['alba','tramonto','notte'].filter(o => p.immagini[o]).length, nuoveLuci = 3 - luci;
  let e = stretta ? c * (1 + 1.15 * luci) + .01 : 0;                         /* l'immagine larga, con le luci che ha */
  e += c * 1.15 * nuoveLuci;                                                 /* le luci che mancano */
  if (!p.immagini['est-giorno']) e += c * 1.3 * (1 + 3 * 1.15);              /* la vista per il TV */
  e += c * 4;                                                                /* i cieli (rifatti, se l'immagine cambia) */
  const tvFatti = ['giorno','alba','tramonto','notte'].filter(o => p.animati['est-' + o]).length;
  const finFatti = stretta ? 0 : ['giorno','alba','tramonto','notte'].filter(o => p.animati[o]).length;
  if (mv) e += mv.euroSecondo * imp.video.secondi * (8 - tvFatti - finFatti);
  return e;
}
function rapportoLavoro(extra = {}){
  const L = lavoro || {};
  const st = Object.assign({quando: new Date().toISOString(), lavoro: L.nome || null, paesaggio: L.p ? L.p.nome : null, finito: !!L.finito, errore: L.errore || null,
    passi: (L.passi || []).map(x => x.cls + ' · ' + x.testo)}, extra);
  fetch(SUPABASE_URL + '/storage/v1/object/dmaster-media/finestre/banco/lavoro-telefono.json', {method: 'POST',
    headers: {apikey: SUPABASE_CHIAVE_PUBBLICA, Authorization: 'Bearer ' + SUPABASE_CHIAVE_PUBBLICA, 'Content-Type': 'image/png', 'x-upsert': 'true'}, body: JSON.stringify(st)}).catch(() => {});
}
/* la stessa richiesta si legge anche dalla rete all'apertura dell'app (se il telefono era chiuso quando Claude l'ha mandata) */
async function richiestaInRete(){
  try { const r = await fetch(SUPABASE_URL + '/storage/v1/object/public/dmaster-media/finestre/banco/richiesta-telefono.json?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) return; const j = await r.json(); if (j && j.aggiornaVecchi && foglioAperto !== 'aggiorna' && !(lavoro && !lavoro.finito)) chiediAggiornaVecchi(j.aggiornaVecchi); } catch(e) {}
}
async function chiediAggiornaVecchi(d){
  if (!d || !Array.isArray(d.ids) || !d.chiave || aggiornaFatti.has(d.chiave)) return;
  const lista = d.ids.map(id => libreria.find(x => x.id === id)).filter(p => p && !p.yt && p.immagini.giorno);
  if (!lista.length){ rapportoLavoro({messaggio: 'nessuno dei paesaggi chiesti è su questo telefono'}); return; }
  const righe = [];
  for (const p of lista){ const st = await strettaDi(p); righe.push({p, st, costo: await costoAggiorna(p, st)}); }
  const tot = righe.reduce((a, r) => a + r.costo, 0);
  apriFoglio(`<h3 style="font:500 16px var(--display);letter-spacing:.12em;text-transform:uppercase;margin:4px 0 4px">Completo i paesaggi vecchi</h3>
    <p class="nota" style="margin-top:0">Claude li porta allo stesso livello di uno creato oggi: immagine larga per le finestrelle, le quattro luci, la vista per il TV, il cielo che scorre, il fumo e le animazioni.</p>
    <ul class="membri">${righe.map(r => `<li><span><b>${esc(r.p.nome)}</b><small>${r.st ? 'immagine delle finestrelle rifatta larga, e tutto quello che manca' : 'tutto quello che manca'}</small></span><span class="prezzo">≈ ${euro(r.costo)}</span></li>`).join('')}</ul>
    <button class="btn oro piena" style="margin-top:14px" data-fai="aggiornaVia">${icona('scintilla', 18)}Avvia · ≈ ${euro(tot)}</button>
    <p class="nota">Ci vuole circa un'ora, quasi tutta per le animazioni: tieni il telefono acceso con l'app aperta su questa pagina finché non ha finito.</p>
    <div id="lavoroFoglio"></div>`);
  foglioAperto = 'aggiorna';
  chiediAggiornaVecchi.righe = righe; chiediAggiornaVecchi.chiave = d.chiave;
  rapportoLavoro({messaggio: 'in attesa di «Avvia»', costo: Math.round(tot * 100) / 100, paesaggi: righe.map(r => r.p.nome + (r.st ? ' (largo)' : ''))});
}
async function aggiornaVecchiVia(){
  const righe = chiediAggiornaVecchi.righe || [], chiave = chiediAggiornaVecchi.chiave; if (!righe.length) return;
  const b = document.querySelector('[data-fai="aggiornaVia"]'); if (b) b.hidden = true;
  const m = Ai.modello(imp.modello);
  if (!imp.chiavi[m.fornitore] || !imp.chiavi.google){ avviso('Servono le chiavi nelle Impostazioni → AI e chiavi.', true); rapportoLavoro({messaggio: 'mancano le chiavi'}); return; }
  const t = setInterval(() => rapportoLavoro(), 20000);
  try {
    for (const r of righe){
      if (r.st){ await rifaiLargo(r.p); rapportoLavoro(); }
      if (cosaManca(r.p).length){ await completaPaesaggio(r.p, ''); rapportoLavoro(); }
      if (scena.paesaggio === r.p.id){ Object.assign(scena, scenaDi(r.p)); mandaScena(); }
    }
    aggiornaFatti.add(chiave); scrivi('atm-aggiorna-fatti', [...aggiornaFatti]);
    rapportoLavoro({messaggio: 'finito', resta: righe.map(r => r.p.nome + ': ' + (cosaManca(r.p).join(', ') || 'completo'))});
  } finally { clearInterval(t); }
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
    const largo = largoPerLeFinestrelle();
    const r = await Ai.crea({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt: largo ? promptLargo(descrizione, imp.stile) : promptBase(descrizione, imp.stile), misura: largo ? 'tv' : undefined,
      bozza: b64 => { L.anteprime.giorno = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
    const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
    p.immagini.giorno = await caricaLuce(casa, p, 'giorno', jpg);
    L.anteprime.giorno = {url:p.immagini.giorno}; passo('giorno', 'fatto', 'Giorno'); L.p = p;
    aggiornaInLibreria(p);
    const misura = largo ? 'tv' : m.fornitore === 'openai' ? r.misura : null;
    const conTv = true, descEst = '';   /* 10/11: la vista del TV la sceglie l'AI (si rifà dal paesaggio, se non piace) */
    await faiLuci(p, jpg, ['alba','tramonto','notte'].filter(o => imp.luci[o]), misura, {conTv});
    aggiornaInLibreria(p);
    await faiProfondita(p, jpg); aggiornaInLibreria(p);
    await faiComignoli(p, jpg); aggiornaInLibreria(p);
    if (conTv){ try { await faiVistaEst(p, jpg, descEst, true); aggiornaInLibreria(p); } catch(e) { passo('est-giorno', 'errore', 'TV · vista verso est: ' + e.message); segnala(e); } }
    if (imp.cielo !== false){ await faiCieli(p); aggiornaInLibreria(p); }
    /* le animazioni: ogni luce, finestrelle e TV (4/11) */
    if (imp.anima) await animaTutto(p, animMancanti(p));
  });
}

function disegnaCrea(){
  /* 10/11: niente più «Più opzioni»: si crea sempre tutto (vedi le regole fisse in cima) */
  const s = $('#s-crea'); const m = Ai.modello(imp.modello), mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0] || {nome:'', euroSecondo:0};
  const unaVista = (m.costo[imp.qualita] || m.costo.alta) * (1 + 3 * 1.15);
  const nVideo = MODELLI_VIDEO.length ? nVideoCrea() : 0;
  const costo = unaVista * 2 + unaVista * 1.3 + mv.euroSecondo * imp.video.secondi * nVideo;
  const desc = $('#creaDesc') ? $('#creaDesc').value : '', nome = $('#creaNome') ? $('#creaNome').value : '';
  const manca = !imp.chiavi[m.fornitore];
  s.innerHTML = testa('scintilla', 'Crea', 'Un paesaggio dipinto dall\'AI') + `<div class="problema" hidden></div>
    ${manca ? `<div class="problema fisso">${icona('chiave', 20)}<div><b>Manca la chiave ${m.fornitore === 'google' ? 'Google' : 'OpenAI'}</b><span>Mettila nelle Impostazioni → AI e chiavi.</span><div class="azioni" style="margin-top:8px"><button class="btn piccolo" data-fai="vaiImp">${icona('manopole', 16)}Impostazioni</button></div></div></div>` : ''}
    <div class="sezione">${titolo('occhio', 'Che cosa si vede')}
      <label class="campo"><textarea id="creaDesc" placeholder="Descrivi il paesaggio fuori dalla finestra, anche in poche parole. Oppure tocca un'idea qui sotto.">${esc(desc)}</textarea></label>
      <div class="pillole">${IDEE.map(([n], i) => `<button class="pillola" data-fai="idea" data-v="${i}">${esc(n)}</button>`).join('')}</div></div>
    <div class="sezione">${titolo('tavolozza', 'Stile')}
      <div class="stili">${STILI.map(st => `<button class="stile" data-fai="stile" data-v="${st.id}" aria-pressed="${imp.stile === st.id}"><div class="tela" style="background:${st.tela}"></div><b>${st.nome}</b><small>${st.nota}</small></button>`).join('')}</div></div>
    <div class="sezione"><label class="campo"><span>Nome (facoltativo)</span><input id="creaNome" maxlength="40" placeholder="Vuoto: lo prendo dalla descrizione" value="${esc(nome)}"></label></div>
    <div class="sezione">
      <button class="btn oro piena" data-fai="crea" ${lavoro && !lavoro.finito || manca ? 'disabled' : ''}>${icona('scintilla', 18)}Crea · ≈ ${euro(costo)}</button>
      <p class="nota">Fa tutto da sé: le quattro luci (giorno, alba, tramonto e notte), la vista per il TV, il cielo che scorre${nVideo ? ` e ${nVideo} animazioni (ogni luce, finestrelle e TV)` : ''}.</p>
      <p class="nota">Le immagini sono pronte in pochi minuti e puoi già mostrarle.${nVideo ? ' Le animazioni arrivano dopo, una alla volta: qualche minuto ciascuna.' : ''} Tieni il telefono acceso su questa pagina finché non ha finito.</p>
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

/* ── le atmosfere pronte (1/11): sottofondo + musica + tempo (+ ora e tempo delle finestre) con un nome, un tocco.
   Stanno nello stato di Bard (bardStato.atmosfere): le vedono tutti i telefoni, DMaster e il TV. */
/* il medaglione di un'atmosfera: il tempo o l'ora delle finestre se li porta, se no dal nome */
function medAtmosfera(a){
  if (a.finestre && a.finestre.meteo && a.finestre.meteo !== 'sereno') return MED_METEO[a.finestre.meteo] || 'pioggia';
  if (a.finestre && a.finestre.ora && a.finestre.ora !== 'vera') return a.finestre.ora;
  return medaglioneDaNome(a.nome, a.finestre ? 'giorno' : 'sottofondo');
}
function atmosferaDiAdesso(nome, conFinestre){
  const m = bardStato.musica || {}, brani = bardDi('musica'), ora = bardOra && brani.find(b => b.id === bardOra.id);
  return {id: Date.now().toString(36), nome: String(nome).trim().slice(0, 30),
    sottofondo: bardStato.sottofondo ? bardStato.sottofondo.id : null,
    musica: m.acceso ? {id: ora ? ora.id : (m.brani && m.brani[m.i || 0] ? m.brani[m.i || 0].id : null), casuale: !!m.casuale} : null,
    tempo: !!(bardStato.tempo && bardStato.tempo.acceso),
    finestre: conFinestre ? {meteo: scena.meteo || 'sereno', ora: scena.ora || 'vera'} : null};
}
function applicaAtmosfera(a){
  const brani = bardDi('musica').map(voceBard), sott = a.sottofondo && bardDi('sottofondo').find(x => x.id === a.sottofondo);
  const i = a.musica ? Math.max(0, brani.findIndex(b => b.id === a.musica.id)) : 0;
  const ok = mandaBard({sottofondo: voceBard(sott) || null, tempo: Object.assign({volume: .6}, bardStato.tempo, {acceso: !!a.tempo}),
    musica: a.musica && brani.length ? {acceso: true, casuale: !!a.musica.casuale, i, brani} : Object.assign({}, bardStato.musica || {}, {acceso: false, brani})});
  if (!ok) return;
  if (a.finestre){ if (comandaDM()) avviso('Le finestre sono in mano a DMaster: cambio solo i suoni', true); else cambia({meteo: a.finestre.meteo, ora: a.finestre.ora, acceso: true}); }
  if (a.sottofondo && !sott) avviso('Il sottofondo di «' + a.nome + '» non è più nella stanza', true); else avviso('Atmosfera: ' + a.nome);
  disegnaBard();
}
function apriSalvaAtmosfera(){
  const fin = `${NOME_ORA[scena.ora] || 'come fuori'} · ${((METEO.find(m => m[0] === scena.meteo) || [,,'sereno'])[2]).toLowerCase()}`;
  apriFoglio(`<h3 class="foglio-titolo">Salva l'atmosfera di adesso</h3>
    <p class="nota" style="margin-top:0">Sottofondo, musica e suoni del tempo come sono ora; con un tocco la ritrovi.</p>
    <label class="campo"><span>Nome</span><input id="atmNome" maxlength="30" placeholder="es. Taverna, Viaggio, Notte di tempesta"></label>
    <div class="pannello" style="padding:2px 14px">${interruttore('atmFin', 'bifora', 'Anche le finestre', 'Ora e tempo come adesso: ' + fin, false)}</div>
    <button class="btn oro piena" style="margin-top:12px" data-fai="atmSalva">${icona('spunta', 18)}Salva</button>`);
  foglioAperto = 'atm-salva';
}

/* ── la console della serata (riordino-259 di DMaster): in serata Bard diventa la tastiera dei suoni del master.
   DMaster manda lo stato («console»), il telefono manda i comandi («consoleComando»); il suono esce dal portatile. */
let consoleStato = null, consoleIl = 0, consoleFirma = '', bardCasse = [], bardUscitaTv = '';
const ORE_CONSOLE = [['vera', 'orologio', 'Come fuori'], ['alba', 'alba', 'Alba'], ['giorno', 'sole', 'Giorno'], ['tramonto', 'tramonto', 'Tramonto'], ['notte', 'luna', 'Notte']];
function chiediConsole(){ if (inSerata()) canale.manda('consoleChiedi', {}); }
setInterval(() => { if (scheda === 'bard' && inSerata()) chiediConsole(); }, 20000);
function suConsole(d){
  if (d.chiusa){ consoleStato = null; consoleIl = 0; }
  else { consoleStato = Object.assign({}, consoleStato || {}, d, d.paesaggi ? {} : {paesaggi: (consoleStato && consoleStato.paesaggi) || []}); consoleIl = Date.now(); }
  if (scheda === 'bard') disegnaBard();
}
function comando(c){
  if (!canale.manda('consoleComando', c)) { avviso('DMaster non è collegato', true); return; }
  navigator.vibrate && navigator.vibrate(15);
}
function disegnaConsole(s){
  const c = consoleStato, vivo = c && Date.now() - consoleIl < 15000;
  const sc = c && c.scontro;
  const firma = c ? JSON.stringify([c.scena ? [c.scena.id, c.scena.titolo, (c.scena.appunti || '').length, (c.scena.leggi || '').length] : null, sc ? [sc.turno, sc.round, sc.attivo, sc.voci.map(v => [v.id, v.pf, v.aTerra])] : null, c.tempo && c.tempo.map(t => t.id), (c.qui || []).map(x => x.id), (c.sempre || []).map(x => x.id), (c.adesso || []).map(x => x.id), !!c.finestre, (c.paesaggi || []).map(p => p.id), vivo]) : 'vuota';
  if (s.dataset.console === firma && s.innerHTML){ aggiornaConsole(s); return; }
  s.dataset.console = firma;
  const effetto = x => pad('conEffetto', x.id, x.med || medaglioneDaNome(x.nome), x.nome, false, 46, x.tasto);
  s.innerHTML = testa('liuto', 'Bard', 'Console della serata') + `
    <div class="dove-suona">${icona('altoparlante', 18)}<span>${vivo ? 'Suona dal <b>portatile di DMaster</b>: qui comandi tu' : 'Aspetto DMaster… (la Serata deve essere aperta sul portatile)'}</span></div>
    ${!c ? '' : `
    <button class="btn pericolo piena" data-fai="conFerma" style="margin-top:6px">${icona('chiudi', 18)}Ferma tutto</button>
    ${sc ? `<div class="sezione">${titolo('fulmine', 'Scontro', 'round ' + sc.round + (sc.attivo ? '' : ' · fermo'))}
      <div class="ordine">${sc.voci.map(v => { const k = v.pfMax ? Math.max(0, Math.min(100, Math.round((v.pf ?? 0) / v.pfMax * 100))) : 0;
        return `<button class="riga-scontro${sc.turno === v.id ? ' turno' : ''}${v.aTerra ? ' aterra' : ''}${v.pg ? ' pg' : ''}" data-fai="conNemico" data-v="${esc(v.id)}">
          <span class="ini">${v.iniziativa ?? '–'}</span><span class="nome">${sc.turno === v.id ? '▶ ' : ''}${esc(v.nome)}${v.aTerra ? ' · a terra' : ''}</span>
          <span class="pf">${v.pf != null ? v.pf + (v.pfMax ? '/' + v.pfMax : '') : '—'}${v.ca != null ? ' · CA ' + v.ca : ''}</span>
          ${v.pfMax ? `<i class="barra"><b style="width:${k}%"></b></i>` : ''}</button>`; }).join('')}</div>
      <div class="azioni"><button class="btn" data-fai="conTurno" data-v="indietro">${icona('indietro', 18)}Indietro</button><button class="btn oro" data-fai="conTurno" data-v="avanti">Prossimo${icona('freccia', 18)}</button></div>
      <p class="nota">Tocca un nemico per togliergli o ridargli punti ferita, o metterlo a terra: finisce nel diario. I PF dei personaggi li tengono i giocatori.</p></div>` : ''}
    ${c.scena && (c.scena.leggi || c.scena.appunti) ? gruppo('con-scena', 'quadro', c.scena.titolo || 'La scena', 'sul leggio', `
      ${c.scena.appunti ? `<div class="blocco"><span>I tuoi appunti</span><p class="appunti">${esc(c.scena.appunti)}</p></div>` : ''}
      ${c.scena.leggi ? `<div class="blocco"><span>Da leggere al tavolo</span><p class="da-leggere">${esc(c.scena.leggi)}</p></div>` : ''}`) : ''}
    <div class="sezione">${titolo('nuvola', 'Tempo', 'finestre e suono insieme')}
      <div class="pads c5">${(c.tempo || []).map(t => pad('conTempo', t.id, MEDAGLIONI[t.id] ? t.id : 'pioggia', t.nome, !!t.acceso, 46)).join('')}</div>
      <div class="pannello" style="margin-top:10px;padding:2px 14px">
        ${cursore('conVolTempo', 'altoparlante', 'Volume', 0, 100, Math.round((c.volTempo ?? .6) * 100), Math.round((c.volTempo ?? .6) * 100) + '%')}
        ${interruttore('conChiuso', 'porta', 'Al chiuso', 'Il tempo si sente da fuori, attutito', !!c.attutito)}</div></div>
    ${(c.qui || []).length ? `<div class="sezione">${titolo('onda', c.nomeLuogo ? 'Qui · ' + c.nomeLuogo : 'Qui')}
      <div class="suoni">${c.qui.map(x => `<button class="suono con-med" data-fai="conQui" data-v="${esc(x.id)}" aria-pressed="${!!x.acceso}">${medaglione(x.musica ? 'liuto' : medaglioneDaNome(x.nome, 'sottofondo'), 28)}${x.principale ? '★ ' : ''}${esc(x.nome)}</button>`).join('')}</div></div>` : ''}
    <div class="sezione">${titolo('fulmine', 'Effetti', 'sempre')}<div class="pads c5">${(c.sempre || []).map(effetto).join('')}</div>
      ${(c.adesso || []).length ? `<h2 class="titolo" style="margin-top:14px">${icona('stella', 16)}Adesso<small>${esc(c.perche || '')}</small></h2><div class="pads c5">${c.adesso.map(effetto).join('')}</div>` : ''}
      <div class="pannello" style="margin-top:10px">${cursore('conVolEff', 'altoparlante', 'Volume', 0, 100, Math.round((c.volEffetti ?? .8) * 100), Math.round((c.volEffetti ?? .8) * 100) + '%')}</div></div>
    ${c.finestre ? `<div class="sezione">${titolo('bifora', 'Illusionist')}
      <button class="btn piena${c.finestre.acceso ? ' oro' : ''}" data-fai="conAccese" style="margin-bottom:8px">${icona('accensione', 18)}<span>${c.finestre.acceso ? 'Accese · tocca per spegnere' : 'Spente · tocca per accendere'}</span></button>
      <div class="pads c5">
        ${ORE_CONSOLE.map(([v, , t]) => pad('conOra', v, v, t, c.finestre.ora === v, 46)).join('')}</div>
      ${(c.paesaggi || []).length ? `<div class="griglia" style="margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(78px,1fr))">${c.paesaggi.map(p => `<button class="carta" data-fai="conPaesaggio" data-v="${esc(p.id)}" aria-pressed="${c.finestre.paesaggio === p.id}"><img loading="lazy" alt="" src="${esc(p.img)}"><span class="su"><b>${esc(p.nome)}</b></span></button>`).join('')}</div>` : ''}</div>` : ''}
    <p class="nota">Gli stessi comandi della console di DMaster (tasto R): il portatile resta libero per la storia.</p>`}`;
  let tv = null, te = null;
  legaCursore('conVolTempo', (v, o) => { o.textContent = v + '%'; clearTimeout(tv); tv = setTimeout(() => comando({azione: 'volTempo', valore: v / 100}), 150); });
  legaCursore('conVolEff', (v, o) => { o.textContent = v + '%'; clearTimeout(te); te = setTimeout(() => comando({azione: 'volEffetti', valore: v / 100}), 150); });
  aggiornaSpia();
}
let nemicoModo = 'togli';
const schede = {};
function suScheda(d){ if (!d || !d.id) return; schede[d.id] = d; if (foglioAperto && foglioAperto.nemico === d.id) apriNemico(d.id, true); }
function htmlScheda(sch){
  if (!sch) return '<p class="nota">Carico la scheda…</p>';
  const num = [['CA', sch.ca], ['PF', sch.pf != null ? sch.pf + (sch.pfMax ? '/' + sch.pfMax : '') : null], ['Per colpire', sch.attacco != null ? (String(sch.attacco).startsWith('-') || String(sch.attacco).startsWith('+') ? sch.attacco : '+' + sch.attacco) : null], ['Danni', sch.danni], ['Attacchi', sch.attacchi]].filter(x => x[1] != null && x[1] !== '');
  return `<div class="scheda-tel">${sch.sotto ? `<p class="nota" style="margin:0 0 8px">${esc(sch.sotto)}</p>` : ''}
    ${num.length ? `<div class="numeri">${num.map(([k, v]) => `<span><small>${k}</small><b>${esc(v)}</b></span>`).join('')}</div>` : ''}
    ${sch.descrizione ? `<p class="descr">${esc(sch.descrizione)}</p>` : ''}</div>`;
}
function apriNemico(id, soloAggiorna){
  const v = consoleStato && consoleStato.scontro && consoleStato.scontro.voci.find(x => x.id === id); if (!v) return;
  if (!soloAggiorna && !schede[id]) comando({azione: 'scheda', id});
  if (v.pg){
    apriFoglio(`<h3 class="foglio-titolo">${esc(v.nome)}</h3><p class="nota" style="margin-top:0">I punti ferita li tiene il giocatore sul suo telefono.</p>${htmlScheda(schede[id])}`);
    foglioAperto = {nemico: id}; return;
  }
  apriFoglio(`<h3 class="foglio-titolo">${esc(v.nome)}</h3>
    <p class="nota" style="margin-top:0">${v.pf != null ? 'Punti ferita ' + v.pf + (v.pfMax ? ' su ' + v.pfMax : '') : 'Punti ferita non segnati'}${v.ca != null ? ' · CA ' + v.ca : ''}${v.aTerra ? ' · a terra' : ''}</p>
    <div class="segmenti" style="margin-bottom:10px">${[['togli', 'Togli PF'], ['ridai', 'Ridai PF']].map(([m, t]) => `<button data-fai="conModo" data-v="${m}" aria-pressed="${nemicoModo === m}">${t}</button>`).join('')}</div>
    <div class="scelte c4">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25].map(n => `<button class="scelta" data-fai="conDanno" data-v="${n}"><b style="font:600 18px var(--display)">${nemicoModo === 'ridai' ? '+' : '−'}${n}</b></button>`).join('')}</div>
    <div class="riga-cerca" style="margin-top:10px"><label class="campo" style="flex:1;margin:0"><input id="danniScritti" type="number" inputmode="numeric" min="1" placeholder="altri punti"></label><button class="btn oro" data-fai="conDanno" data-v="">${nemicoModo === 'ridai' ? 'Ridai' : 'Togli'}</button></div>
    <button class="btn piena" style="margin-top:12px" data-fai="conATerra" data-v="${v.aTerra ? '0' : '1'}">${v.aTerra ? 'Rialzalo' : 'Mettilo a terra'}</button>
    <h2 class="titolo" style="margin-top:18px">${icona('quadro', 16)}Scheda</h2>${htmlScheda(schede[id])}`);
  foglioAperto = {nemico: id};
}
function aggiornaConsole(s){
  const c = consoleStato; if (!c) return;
  const per = (fai, lista) => { const m = new Map((lista || []).map(x => [String(x.id), x])); s.querySelectorAll(`[data-fai="${fai}"]`).forEach(b => { const x = m.get(b.dataset.v); if (x) b.setAttribute('aria-pressed', String(!!x.acceso)); }); };
  per('conTempo', c.tempo); per('conQui', c.qui);
  const ch = s.querySelector('[data-fai="conChiuso"]'); if (ch) ch.setAttribute('aria-checked', String(!!c.attutito));
  if (c.finestre){
    const a = s.querySelector('[data-fai="conAccese"]'); if (a){ a.classList.toggle('oro', !!c.finestre.acceso); a.querySelector('span').textContent = c.finestre.acceso ? 'Accese · tocca per spegnere' : 'Spente · tocca per accendere'; }
    s.querySelectorAll('[data-fai="conOra"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === c.finestre.ora)));
    s.querySelectorAll('[data-fai="conPaesaggio"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === c.finestre.paesaggio)));
  }
  for (const [id, v] of [['conVolTempo', c.volTempo], ['conVolEff', c.volEffetti]]){
    const r = document.getElementById(id); if (!r || v == null || document.activeElement === r) continue;
    r.value = Math.round(v * 100); riempi(r); const o = document.getElementById(id + '-o'); if (o) o.textContent = r.value + '%';
  }
}

function disegnaBard(){
  const s = $('#s-bard');
  if (inSerata()){ if (!consoleStato || Date.now() - consoleIl > 15000) chiediConsole(); disegnaConsole(s); return; }
  s.dataset.console = '';
  if (bardLibStato === 'da caricare') caricaBard();
  const sott = bardDi('sottofondo'), mus = bardDi('musica'), eff = bardDi('effetto'), nTempo = bardDi('tempo').length;
  const t = bardStato.tempo || {acceso: true, volume: .6}, m = bardStato.musica || {};
  const pronto = bardLibStato === 'ok';
  s.innerHTML = testa('liuto', 'Bard', 'Musiche e suoni della stanza') + `<div class="problema" hidden></div>
    <div class="in-mano-avviso" id="bardSerata" hidden><b>Serata in corso</b> I suoni della stanza li fa DMaster dal portatile. Quando chiudi la serata Bard torna qui da solo.</div>
    <div class="dove-suona">${icona('altoparlante', 18)}<span id="bardDove"></span><button class="btn piccolo" data-fai="vaiImpBard">Cambia</button></div>
    ${!pronto ? `<p class="vuoto">${bardLibStato === 'carico' ? 'Carico i suoni della stanza…' : esc(bardLibStato)}</p>` : ''}
    ${pronto ? `<div class="sezione">${titolo('stella', 'Atmosfere', (bardStato.atmosfere || []).length ? 'un tocco per tutto' : '')}
      <div class="suoni">${(bardStato.atmosfere || []).map(a => `<button class="suono atmosfera con-med" data-fai="atmApplica" data-v="${esc(a.id)}">${medaglione(medAtmosfera(a), 28)}${esc(a.nome)}</button>`).join('')}
        <button class="suono" data-fai="atmNuova" style="border-style:dashed;color:var(--tenue)">+ salva quella di adesso</button></div></div>` : ''}
    <div class="sezione">${titolo('pioggia', 'Tempo')}
      <div class="pannello" style="padding:2px 14px">${interruttoreMed('bardTempo', scena.meteo && scena.meteo !== 'sereno' ? MED_METEO[scena.meteo] || 'pioggia' : 'giorno', 'Suoni del tempo', nTempo ? 'Seguono le finestre: pioggia, vento, neve, tuoni coi lampi' : 'Seguono le finestre. Le registrazioni non sono ancora nella stanza (si copiano da DMaster): per ora un suono più semplice', t.acceso)}
        ${cursore('volTempo', 'altoparlante', 'Volume', 0, 100, Math.round(t.volume * 100), Math.round(t.volume * 100) + '%')}</div></div>
    ${pronto ? `<div class="sezione">${titolo('onda', 'Sottofondo', sott.length ? 'tocca per accendere o spegnere' : '')}
      ${sott.length ? `<div class="suoni">${sott.map(x => `<button class="suono con-med" data-fai="bardSott" data-v="${esc(x.id)}" aria-pressed="${!!(bardStato.sottofondo && bardStato.sottofondo.id === x.id)}">${medaglione(medaglioneDaNome(x.titolo, 'sottofondo'), 28)}${esc(x.titolo)}</button>`).join('')}</div>
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
      ${eff.length ? `<div class="pads c5">${eff.map(x => pad('bardEffetto', x.id, medaglioneDaNome(x.titolo), x.titolo, false, 46)).join('')}</div>
        <div class="pannello" style="margin-top:10px">${cursore('volEff', 'altoparlante', 'Volume', 0, 100, Math.round(bardStato.volEffetti * 100), Math.round(bardStato.volEffetti * 100) + '%')}</div>`
        : '<p class="nota" style="margin-top:0">Ancora nessun effetto: «+ Aggiungi un suono» qui sotto.</p>'}</div>` : ''}
    ${CASA_PRIVATA ? `<button class="btn oro piena" style="margin-top:18px" data-fai="bardAggiungi">${icona('piu', 18)}Aggiungi un suono</button>
    ${gruppo('bard-gestisci', 'manopole', 'Gestisci i suoni', bardLib.length + ' nella stanza', `
      ${(bardStato.atmosfere || []).length ? `<ul class="membri">${bardStato.atmosfere.map(a => `<li><span><b>${esc(a.nome)}</b><small>atmosfera${a.finestre ? ' · con le finestre' : ''}</small></span><button class="btn piccolo pericolo" data-fai="atmTogli" data-v="${esc(a.id)}">Togli</button></li>`).join('')}</ul>` : ''}
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
  if (inSerata() !== !!s.dataset.console){ disegnaBard(); return; }
  if (inSerata()) return;
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
    return `<div class="pannello" style="margin-top:10px"><div class="titolo" style="margin-bottom:4px">${icona('monofora', 15)}${t}<small>schermo ${sc.w}×${sc.h}${sc.fps ? ' · ' + sc.fps + ' img/s' + (sc.scala < 1 ? ' · disegno al ' + Math.round(sc.scala * 100) + '%' : '') : ''}</small></div>
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
    ${gruppo('stanza', 'persona', 'Account e stanza', chi, corpoAccount)}
    ${gruppo('ai', 'scintilla', 'AI e chiavi', conChiave ? Ai.modello(imp.modello).nome : 'manca la chiave', `
      <div class="blocco"><span>Chi dipinge le immagini</span><div class="scelte">${MODELLI_IMMAGINE.map(m => `<button class="scelta riga" data-fai="modello" data-v="${m.id}" aria-pressed="${imp.modello === m.id}">${icona(m.fornitore === 'google' ? 'mondo' : 'scintilla', 22)}<span><b>${esc(m.nome)}</b><small>${esc(m.note)}</small></span><span class="prezzo">≈ ${euro(m.costo[imp.qualita] || m.costo.alta)}</span></button>`).join('')}</div></div>
      ${MODELLI_VIDEO.length ? `<p class="nota" style="margin:10px 0 0">Le animazioni le fa sempre ${esc((MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0]).nome)}: ${imp.video.secondi} secondi in loop, ≈ ${euro((MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0]).euroSecondo * imp.video.secondi)} l'una.</p>` : ''}
      <div style="margin-top:14px">
        ${campoChiave('kOpenai', 'Chiave OpenAI', 'sk-…', imp.chiavi.openai, 'La stessa di DMaster.')}
        ${campoChiave('kGoogle', 'Chiave Google (Gemini)', 'AIza…', imp.chiavi.google, 'Per Nano Banana e le animazioni. Gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>.')}
        ${campoChiave('kEleven', 'Chiave ElevenLabs', 'sk_…', imp.chiavi.elevenlabs, 'Per i suoni e le musiche di Bard. La stessa di DMaster.')}
        ${campoChiave('kPexels', 'Chiave Pexels (facoltativa)', 'chiave Pexels', imp.chiavi.pexels, 'Più foto vere e verticali. Gratis su <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a>.')}
        <p class="nota" style="margin-top:0">Le chiavi restano su questo telefono.</p></div>`)}
    ${gruppo('bard', 'liuto', 'Suono', suonoQui() ? 'dal telefono' : 'dal TV', `
      <div class="segmenti">${[['stanza', 'tv', 'Il TV'], [ID_TELEFONO, 'telefono', 'Questo telefono']].map(([v, ic, t]) => `<button data-fai="bardDove" data-v="${v}" aria-pressed="${bardStato.dove === v}">${icona(ic, 18)}${t}</button>`).join('')}</div>
      ${suonoQui() ? '' : `<label class="campo" style="margin-top:12px"><span>Uscita del TV</span><select data-cambia="bardUscita">
        <option value="">Quella di Windows (di solito le casse del TV)</option>
        ${bardCasse.map(c => `<option value="${esc(c.id)}"${(bardStato.uscitaTv && bardStato.uscitaTv.id === c.id) ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
        ${bardCasse.length ? '' : '<p class="nota" style="margin-top:-4px">Il TV non ha ancora detto quali casse vede: succede dopo l\'installatore aggiornato sul G10, con la JBL già abbinata in Bluetooth.</p>'}`}
      <p class="nota">${suonoQui() ? 'Suona da qui: dall\'altoparlante o da una cassa collegata al telefono. Tieni l\'app aperta e lo schermo acceso, se no il telefono smette di suonare.' : 'Suona il G10 del TV: dalle casse del TV o da una cassa Bluetooth abbinata al G10. Puoi bloccare il telefono.'} Durante una serata i suoni li fa DMaster dal portatile.</p>`)}
    ${gruppo('schermo', 'sole', 'Luce degli schermi', 'giorno ' + scena.luceGiorno + '% · notte ' + scena.luceNotte + '%', `
      ${cursore('luceGiorno', 'sole', 'Di giorno', 5, 100, scena.luceGiorno, scena.luceGiorno + '%')}${cursore('luceNotte', 'luna', 'Di notte', 2, 100, scena.luceNotte, scena.luceNotte + '%')}
      <p class="nota">Quanto sono luminosi gli schermi. Se qualcosa si è bloccato: <button class="btn piccolo" data-fai="ricaricaFinestre">${icona('ricarica', 16)}Ricarica gli schermi</button></p>`)}
    ${gruppo('montaggio', 'mirino', 'Montaggio', 'solo quando monti gli schermi', `
      <p class="nota" style="margin-top:0">Serve una volta, quando monti o sposti gli schermi dietro le finestre.</p>
      <div class="segmenti">${[1, 2].map(n => `<button data-fai="nFinestre" data-v="${n}" aria-pressed="${a.n === n}">${icona(n === 1 ? 'monofora' : 'bifora', 18)}${n === 1 ? 'Una finestra' : 'Due finestre'}</button>`).join('')}</div>
      ${interruttore('bordi', 'mirino', 'Mostra i bordi sulle finestre', 'Una cornice tratteggiata per allineare ogni foro al traforo', mostraBordi)}
      <div class="pannello" style="margin-top:10px">
        ${cursore('staccato', 'livelli', 'Schermo staccato dal muro', 0, 10, a.staccato || 0, a.staccato ? a.staccato + ' cm' : 'appoggiato')}
        <p class="nota" style="margin:0 0 6px">Quanti centimetri ci sono fra la fine del muro e lo schermo. Staccato, spostandoti scopri un po' di paesaggio oltre i bordi, come da una finestra vera.</p></div>
      ${a.n === 2 ? `<div class="pannello" style="margin-top:10px">
        ${cursore('fra', 'bifora', 'Fra le due finestrelle', -15, 15, a.fra, testoFra(a.fra))}
        <p class="nota" style="margin:0 0 6px">Quanto paesaggio hanno in comune le due finestrelle viste di fronte (consigliato: 5 cm).</p></div>` : ''}
      ${fori}
      <div class="pannello" style="margin-top:10px">
        ${cursore('zoom', 'lente', 'Ingrandisci', 100, 200, Math.round(scena.zoom * 100), Math.round(scena.zoom * 100) + '%')}
        ${cursore('vx', 'destra', 'Sposta', -30, 30, Math.round(scena.vx * 100), Math.round(scena.vx * 100))}</div>
      ${interruttore('prospettivaViva', 'persona', 'Segui chi si muove', 'Serve il sensore accanto al TV: il paesaggio si sposta come da una finestra vera', !!scena.prospettivaViva)}
      ${a.n === 2 && !schermi.destra ? '<p class="nota">La finestra destra non ha ancora risposto: si collega quando c\'è il secondo schermo.</p>' : ''}`)}
    <p class="nota" style="text-align:center;margin-top:18px">DMaster Atmosphere ${VERSIONE} · powered by DMaster Stage</p>`;
  for (const [id, k] of [['kOpenai','openai'], ['kGoogle','google'], ['kEleven','elevenlabs'], ['kPexels','pexels']]){ const el = document.getElementById(id); el.oninput = () => { imp.chiavi[k] = el.value.trim(); salvaImp(); if (problema && problema.tipo === 'chiave') risolto(); }; }
  nomi.forEach(nm => {
    const lega = (id, chiave) => legaCursore(id + nm, (v, o) => { o.textContent = v.toFixed(1) + '%'; assetto = assettoOPredefinito(); assetto.finestre[nm][chiave] = v / 100; mandaFori(); });
    lega('fx', 'x'); lega('fy', 'y'); lega('fw', 'w'); lega('fh', 'h');
  });
  legaCursore('luceGiorno', (v, o) => { o.textContent = v + '%'; cambia({luceGiorno: v}, false); });
  legaCursore('luceNotte', (v, o) => { o.textContent = v + '%'; cambia({luceNotte: v}, false); });
  legaCursore('staccato', (v, o) => { o.textContent = v ? v + ' cm' : 'appoggiato'; assetto = assettoOPredefinito(); assetto.staccato = v; mandaFori(); });
  if (a.n === 2) legaCursore('fra', (v, o) => { o.textContent = testoFra(v); assetto = assettoOPredefinito(); assetto.fra = v; mandaFori(); });
  legaCursore('zoom', (v, o) => { o.textContent = v + '%'; cambia({zoom: v / 100}, false); });
  legaCursore('vx', (v, o) => { o.textContent = v; cambia({vx: v / 100}, false); });
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
  conFerma: () => comando({azione: 'fermaTutto'}),
  conTempo: v => comando({azione: 'tempo', id: v}),
  conQui: v => comando({azione: 'qui', id: v}),
  conEffetto: (v, b) => { comando({azione: 'effetto', id: v}); b.classList.add('suona'); setTimeout(() => b.classList.remove('suona'), 500); },
  conChiuso: (v, b) => { const su = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(su)); comando({azione: 'attutito', valore: su}); },
  conAccese: () => comando({azione: 'finestre', acceso: !(consoleStato && consoleStato.finestre && consoleStato.finestre.acceso)}),
  conOra: v => comando({azione: 'finestre', ora: v}),
  conPaesaggio: v => comando({azione: 'paesaggio', id: v}),
  conTurno: v => comando({azione: 'turno', verso: v}),
  conNemico: v => apriNemico(v),
  conDanno: v => { const n = +v || +(($('#danniScritti') || {}).value || 0); if (!(n > 0)){ avviso('Quanti punti?', true); return; }
    const cura = nemicoModo === 'ridai'; comando({azione: cura ? 'cura' : 'danno', id: foglioAperto && foglioAperto.nemico, valore: n}); chiudiFoglio(); nemicoModo = 'togli'; avviso((cura ? '+' : '−') + n + ' PF'); },
  conModo: v => { nemicoModo = v; const id = foglioAperto && foglioAperto.nemico; if (id) apriNemico(id); },
  conATerra: v => { comando({azione: 'aTerra', id: foglioAperto && foglioAperto.nemico, giu: v === '1'}); chiudiFoglio(); },
  atmApplica: v => { const a = (bardStato.atmosfere || []).find(x => x.id === v); if (a) applicaAtmosfera(a); },
  atmNuova: () => apriSalvaAtmosfera(),
  atmFin: (v, b) => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')),
  atmSalva: () => { const nome = ($('#atmNome') || {}).value || ''; if (!nome.trim()){ avviso('Dagli un nome.', true); return; }
    const a = atmosferaDiAdesso(nome, ($('[data-fai="atmFin"]') || {getAttribute: () => 'false'}).getAttribute('aria-checked') === 'true');
    if (mandaBard({atmosfere: [...(bardStato.atmosfere || []).filter(x => x.nome.toLowerCase() !== a.nome.toLowerCase()), a]})){ chiudiFoglio(); avviso('Salvata: ' + a.nome); disegnaBard(); } },
  atmTogli: (v, b) => { if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = 'Sicuro?'; return; }
    if (mandaBard({atmosfere: (bardStato.atmosfere || []).filter(x => x.id !== v)})) disegnaBard(); },
  bardAggiungi: () => apriBardAggiungi(),
  bardTipo: v => { bardNuovoTipo = v; apriBardAggiungi(); },
  bardMinuti: v => { bardMinuti = +v; apriBardAggiungi(); },
  bardGenera: () => generaBard(),
  bardFileScegli: () => { const i = $('#bardFile'); i && i.click(); },
  bardTogli: async (v, b) => { if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.textContent = 'Sicuro?'; return; }
    try { await Accesso.togli(CASA_PRIVATA, [v]); await caricaBard(); avviso('Tolto dalla stanza'); } catch(e) { avviso(e.message, true); } },
  bardRicarica: () => caricaBard(),
  bardDove: v => { mandaBard({dove: v}); if (v === ID_TELEFONO) lettore.sblocca(); disegnaImpostazioni(); },
  ingresso: () => vai(scheda === 'crea' ? 'paesaggi' : scheda === 'paesaggi' ? 'finestre' : ultimaPrincipale), apriScheda: v => vai(v),
  vaiImpBard: () => { aperti.add('bard'); scrivi('atm-gruppi-aperti', [...aperti]); vai('impostazioni'); },
  chiudiFoglio: () => chiudiFoglio(),
  ora: v => cambia({ora:v}),
  meteo: v => cambia({meteo:v, vento:null}),   /* 8/11: il vento lo decide il tempo */
  fps: (v, b) => { cambia({fps:+v}); b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); },
  accendi: () => cambia({acceso: !scena.acceso}),
  effetto: v => {
    /* ⚠ 9/11 (Maurizio: «la nebbia che sale non deve poi scendere da sola, non si capisce; al massimo un tasto per farla
       scendere»): non è più un effetto che passa ma uno stato della scena. Un tocco: sale e resta; un altro: scende */
    if (v === 'nebbia'){ const su = !scena.nebbiaSale; cambia({nebbiaSale: su, nebbiaSaleDa: Date.now(), nebbiaSaleK0: salita()});
      avviso(su ? 'La nebbia sale dalle valli e resta. Tocca di nuovo per farla scendere' : 'La nebbia scende nelle valli'); return; }
    if (v === 'meteora' && !eNotte()) return avviso('Le stelle cadenti si vedono solo di notte');
    if (v === 'meteora' && ['nebbia', 'pioggia', 'temporale', 'neve'].includes(scena.meteo)) return avviso('Col cielo coperto la stella cadente non si vedrebbe');
    if (v === 'stormo' && eNotte()) return avviso('Di notte gli uccelli dormono');
    const d = {tipo: v, seme: Math.floor(Math.random() * 1e9)};
    if (canale.manda('effetto', d)) avviso(v === 'nebbia' ? 'La nebbia sale dalle valli: in mezzo minuto arriva sotto l\'abbazia, resta un minuto e poi se ne va' : (EFFETTI.find(e => e[0] === v) || [, , 'Effetto'])[2]);   /* 9/11: «non ho capito come funziona» */
    postaAnteprima({tipo: 'effetto', effetto: d});
    if (suonoQui()){ if (v === 'tuono') lettore.tuono(6, .4); if (v === 'raffica' && lettore.raffica) lettore.raffica(); }
  },
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
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.innerHTML = icona('avviso', 18) + 'Non si recupera più: tocca ancora per eliminarlo';
      setTimeout(() => { if (b.isConnected && b.dataset.conferma === '1'){ b.dataset.conferma = ''; b.innerHTML = icona('cestino', 18) + 'Elimina questo paesaggio'; } }, 5000); return; }
    b.disabled = true; b.innerHTML = icona('cestino', 18) + 'Elimino…';
    try { await togliPaesaggio(casa, p); libreria = libreria.filter(x => x.id !== p.id); chiudiFoglio(); disegnaPaesaggi(); avviso('Eliminato');
      if (scena.paesaggio === p.id && libreria[0]) mostraPaesaggio(libreria[0]); }   /* 9/11: se era in onda, va in onda un altro (prima gli schermi restavano su file che non c'erano più) */
    catch(e) { b.disabled = false; b.dataset.conferma = ''; b.innerHTML = icona('cestino', 18) + 'Elimina questo paesaggio'; avviso(e.message, true); }
  },
  rifaiLargo: async (v, b) => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    if (b.dataset.conferma !== '1'){ b.dataset.conferma = '1'; b.innerHTML = icona('avviso', 18) + 'Le animazioni delle finestrelle si perdono: tocca ancora';
      setTimeout(() => { if (b.isConnected && b.dataset.conferma === '1'){ b.dataset.conferma = ''; b.innerHTML = icona('scintilla', 18) + 'Rifai largo per le finestrelle · ≈ ' + euro(costoRifaiLargo(p)); } }, 5000); return; }
    b.hidden = true; await rifaiLargo(p);
    if (scena.paesaggio === p.id){ Object.assign(scena, scenaDi(p)); mandaScena(); }
  },
  completa: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni → AI e chiavi.', true); return; }
    await completaPaesaggio(p, (($('#tvDesc') || {}).value || '').trim());
  },
  /* 8/11 · un solo pulsante AI nella scheda: panorama largo se serve, poi quello che manca */
  migliora: async (v, b) => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const m = Ai.modello(imp.modello); if (!imp.chiavi[m.fornitore]){ avviso('Serve la chiave nelle Impostazioni → AI e chiavi.', true); return; }
    const stretta = b.dataset.stretta === '1', desc = (($('#tvDesc') || {}).value || '').trim();
    if (stretta && Object.keys(p.animati).some(k => !k.startsWith('est-')) && b.dataset.conferma !== '1'){
      b.dataset.conferma = '1'; b.innerHTML = icona('avviso', 18) + 'Le animazioni delle finestrelle si rifanno: tocca ancora';
      setTimeout(() => { if (b.isConnected && b.dataset.conferma === '1'){ b.dataset.conferma = ''; b.innerHTML = icona('scintilla', 18) + "Completa con l'AI · ≈ " + euro(costoMigliora(p, stretta)); } }, 5000); return; }
    b.hidden = true; const n = $('#miglioraNota'); if (n) n.hidden = true;
    if (stretta) await rifaiLargo(p);
    if (cosaManca(p).length) await completaPaesaggio(p, desc);
    if (scena.paesaggio === p.id){ Object.assign(scena, scenaDi(p)); mandaScena(); }
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
  /* 10/11 · ANIMAZIONI, una sola scelta (Maurizio: «troppe opzioni, non sono chiare»): una casella per video, 4 luci ×
     finestrelle e TV. Già segnate quelle che mancano; tocchi una già fatta per rifarla. Che cosa si muove, durata e
     modello sono fissi */
  anima: v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0];
    const viste = [[false, 'Finestrelle'], ...(p.immagini['est-giorno'] ? [[true, 'TV']] : [])];
    const ORE = ['giorno','alba','tramonto','notte'];
    const casella = (tv, o) => { const pre = tv ? 'est-' : '', c = pre + o;
      if (!p.immagini[c]) return `<span class="anim-casella vuota"><span>${NOME_ORA[o]}</span><small>manca l'immagine</small></span>`;
      const fatto = !!p.animati[c];
      return `<button class="anim-casella" data-fai="animSegna" data-v="${c}" aria-pressed="${!fatto}"><img alt="" src="${esc(p.immagini[c])}"><span>${NOME_ORA[o]}</span><small>${fatto ? 'fatta · tocca per rifarla' : 'da fare'}</small></button>`; };
    apriFoglio(`<h3 style="font:500 16px var(--display);letter-spacing:.12em;text-transform:uppercase;margin:4px 0 4px">Animazioni «${esc(p.nome)}»</h3>
      <p class="nota" style="margin-top:0">Un video per ogni luce, sulle finestrelle e sul TV: alberi e acqua si muovono, la camera sta ferma, il video gira in loop. In oro quelli da fare.</p>
      ${viste.map(([tv, t]) => `<div class="sezione">${titolo(tv ? 'tv' : 'monofora', t)}<div class="anim-griglia">${ORE.map(o => casella(tv, o)).join('')}</div></div>`).join('')}
      <button class="btn oro piena" style="margin-top:14px" id="animaVia" data-fai="animaVia" data-v="${p.id}"></button>
      <p class="nota">Ogni video richiede qualche minuto: tieni il telefono acceso su questa pagina.</p>
      <div id="lavoroFoglio"></div>`);
    foglioAperto = p.id; contaAnim(mv);
  },
  animSegna: (v, b) => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    const sm = b.querySelector('small'), p = libreria.find(x => x.id === foglioAperto);
    if (sm && p && p.animati[v]) sm.textContent = b.getAttribute('aria-pressed') === 'true' ? 'da rifare' : 'fatta · tocca per rifarla';
    contaAnim(); },
  /* 4/11 · dove sale il fumo: tocca l'immagine per aggiungere un comignolo, tocca un punto per toglierlo */
  fumo: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    const leggiPunti = async u => { if (!u) return null; try { const j = await (await fetch(u, {cache:'no-cache'})).json(); const v = j.punti || []; v.fuochi = j.fuochi || []; return v; } catch(e) { return null; } };   /* 9/11: i fuochi lontani restano */
    editorFumo = {p, vista: 'nord', punti: {nord: await leggiPunti(p.immagini.comignoli), est: await leggiPunti(p.immagini['est-comignoli'])}, cambiati: {}};
    disegnaEditorFumo();
  },
  fumoVista: v => { if (!editorFumo) return; editorFumo.vista = v; disegnaEditorFumo(); },
  fumoTrova: async () => {
    const E = editorFumo; if (!E) return;
    const est = E.vista === 'est', img = E.p.immagini[est ? 'est-giorno' : 'giorno'];
    const b = $('#fumoTrova'); if (b){ b.disabled = true; b.textContent = 'Cerco…'; }
    try { E.punti[E.vista] = await Ai.trovaComignoli({chiavi: imp.chiavi, foto: await (await fetch(img)).blob()}); E.cambiati[E.vista] = true; }
    catch(e) { avviso(e.message, true); }
    disegnaEditorFumo();
  },
  fumoSalva: async () => {
    const E = editorFumo; if (!E) return;
    try {
      for (const vv of Object.keys(E.cambiati)){ const est = vv === 'est';
        const pv = E.punti[vv] || [], fu = pv.fuochi || (E.fuochi && E.fuochi[vv]) || [];
        E.p.immagini[(est ? 'est-' : '') + 'comignoli'] = await caricaComignoli(casa, E.p, est, pv, fu) + '?v=' + Date.now().toString(36); }
      aggiornaInLibreria(E.p); avviso('Comignoli salvati'); E.cambiati = {}; apriPaesaggio(E.p); editorFumo = null;
    } catch(e) { avviso(e.message, true); }
  },
  aggiornaVia: () => aggiornaVecchiVia(),
  animaVia: async v => {
    const p = libreria.find(x => x.id === v); if (!p) return;
    if (!imp.chiavi.google){ avviso('Serve la chiave Google (Gemini) nelle Impostazioni.', true); return; }
    const quali = [...document.querySelectorAll('.anim-casella[aria-pressed="true"]')].map(b => b.dataset.v)
      .map(c => ({tv: c.startsWith('est-'), ora: c.replace('est-', '')}));
    if (!quali.length) return;
    await conLavoro('anima', async L => {
      L.p = p;
      for (const {tv, ora} of quali){
        const pre = tv ? 'est-' : '', img = p.immagini[pre + ora];
        L.anteprime[pre + ora] = {url: img};
        try { await faiAnimazione(p, await (await fetch(img)).blob(), ora, imp.elementi, tv); aggiornaInLibreria(p); }
        catch(e) { passo(pre + 'anim-' + ora, 'errore', (tv ? 'TV · ' : '') + 'Animazione ' + NOME_ORA[ora] + ': ' + e.message); segnala(e); if (e.tipo === 'credito' || e.tipo === 'chiave') break; }
      }
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
  risparmioToggle: () => { imp.risparmio = imp.risparmio === false; salvaImp(); disegnaImpostazioni(); },
  cieloToggle: () => { imp.cielo = imp.cielo === false; salvaImp(); disegnaCrea(); },
  crea: () => crea(),
  modello: v => { imp.modello = v; salvaImp(); disegnaImpostazioni(); },
  qualita: v => { imp.qualita = v; salvaImp(); disegnaImpostazioni(); },
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
  if (e.target.matches('[data-cambia="bardUscita"]')){ const c = bardCasse.find(x => x.id === e.target.value); mandaBard({uscitaTv: c ? {id: c.id, nome: c.nome} : null}); avviso(c ? 'Il TV suona da: ' + c.nome : 'Il TV suona dall\'uscita di Windows'); return; }
  if (e.target.matches('[data-cambia="accStanza"]') && e.target.value && (!casaPrivata || e.target.value !== casaPrivata.id)){ scrivi('atm-stanza', e.target.value); location.reload(); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="switch"]')){ e.preventDefault(); e.target.click(); } });

/* via */
avviaAccesso().finally(() => { if (libreriaStato === 'da caricare') caricaLibreria(); });
disegnaScheda();
