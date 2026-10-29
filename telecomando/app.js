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
const VERSIONE = '2.4';

/* ── la casa ──────────────────────────────────────────────────────────────── */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const q = new URLSearchParams(location.search);
/* la testata del marchio: DMaster Atmosphere, con le sue due parti; Bard arriva dopo */
const MARCHIO = `<div class="marchio"><div class="marchio-nome"><span>DMaster</span> Atmosphere</div>
  <div class="marchio-firma">powered by DMaster Stage</div>
  <div class="marchio-parti"><span class="parte spenta" title="Musiche e suoni della stanza: in arrivo">Bard <em>presto</em></span><span class="parte attiva">Illusionist</span></div></div>
<div class="in-mano-avviso" id="inMano" hidden><b>In mano a DMaster</b> La Serata comanda finestre e atmosfera: qui le guardi soltanto. Quando chiudi DMaster tornano a questo telefono da sole.</div>`;
const casa = (String(q.get('casa') || '').match(UUID) || String(leggi('finestre-casa', '') || '').match(UUID) || [null])[0];
if (!casa){
  document.getElementById('app').innerHTML = `${MARCHIO}<div class="testa"><div><h1>${icona('bifora', 22)}Illusionist</h1><p>Le finestre della stanza medievale</p></div></div>
    <p class="nota" style="font-size:19px">Questo telefono non è ancora collegato alle finestre. Apri il link della casa, poi da lì aggiungi l'app alla schermata Home.</p>`;
  throw new Error('senza casa');
}
scrivi('finestre-casa', casa);
/* il codice resta nell'indirizzo: così «Aggiungi alla schermata Home» se lo porta dietro */
if (q.get('casa') !== casa) history.replaceState(null, '', location.pathname + '?casa=' + casa + location.hash);

/* ── impostazioni ─────────────────────────────────────────────────────────── */
const IMP_PRED = {modello:'openai:gpt-image-2', qualita:'alta', chiavi:{openai:'', google:'', pexels:''},
  video:{modello:'omni-720p', secondi:8}, stile:'painterly', luci:{alba:true, tramonto:true, notte:true}, anima:false, elementi:['nuvole','alberi']};
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
const canale = apriCanale(casa, {
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
});
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
function chiudiFoglio(){ $('#foglio').classList.remove('aperto'); $('#velo').classList.remove('aperto'); foglioAperto = null; }
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
  s.innerHTML = testa('quadro', 'Paesaggi', 'La libreria della casa') + `
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
    <button class="btn oro piena" style="margin-top:14px" data-fai="mostra" data-v="${p.id}">${icona('play', 18)}Mostra alle finestre</button>
    ${p.yt ? '' : `<div class="pannello" style="margin-top:12px;padding:6px 14px">${cursore('inquadra', 'mirino', 'Inquadratura', 0, 100, Math.round(fx * 100), fx === .5 ? 'centro' : Math.round(fx * 100) + '%')}
      <p class="nota" style="margin:0 0 6px">Se l'immagine è più larga del foro, scegli quale parte si vede. Le finestre la seguono dal vivo.</p></div>`}
    <div class="azioni">
      ${p.yt || !MODELLI_VIDEO.length ? '' : `<button class="btn" data-fai="anima" data-v="${p.id}">${icona('anima', 18)}Anima</button>`}
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
    <p class="nota">La salvo nel deposito della casa e calcolo la sua profondità sul telefono (la prima volta scarica il modello, ~25 MB). Le altre luci del giorno le puoi poi creare con l'AI.</p>
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
const IDEE = [
  ['Valle col castello', 'Una valle verde con un castello medievale su una collina, un fiume che serpeggia, colline e boschi fino all\'orizzonte'],
  ['Campagna romana', 'Campagna laziale con i resti di un acquedotto romano, pini marittimi, pecore lontane, colli all\'orizzonte'],
  ['Borgo sul lago', 'Un borgo medievale di pietra sulla riva di un lago tra le montagne, tetti di coppi, un campanile, fumo dai camini'],
  ['Foresta antica', 'Una foresta di querce e faggi secolari, un ruscello tra le rocce, luce che filtra tra i rami'],
  ['Scogliera sul mare', 'Una costa rocciosa sul mare aperto, una torre di avvistamento sul promontorio, onde che si infrangono'],
  ['Montagne innevate', 'Picchi innevati sopra una valle alpina, un villaggio di legno con il fumo dai camini, abeti'],
  ['Abbazia nella nebbia', 'Un\'abbazia romanica su un colle, cipressi, colline che sfumano nella nebbia del mattino'],
  ['Città dalle torri', 'Una città medievale con molte torri di pietra su una collina, campagna coltivata intorno, strade bianche']
];
const LUCI = {
  giorno:'Time of day: clear daytime, soft natural daylight from a high sun.',
  alba:'Change only the time of day to dawn: the sun just rising at the horizon, warm pink and orange light, long soft shadows, light mist in the valleys.',
  tramonto:'Change only the time of day to sunset: low golden-orange sun near the horizon, warm glowing sky, long shadows, deepening blue on the opposite side.',
  notte:'Change only the time of day to night: a clear night lit by moonlight, deep blue tones, stars visible, very dark but readable shapes; if there are buildings, a few windows glow with warm candlelight.'
};
const ELEMENTI = [['nuvole','nuvola','Nuvole','clouds slowly drifting across the sky'], ['alberi','albero','Alberi','tree leaves and branches swaying softly in a light breeze'],
  ['acqua','onda','Acqua','the river and water flowing and glittering naturally'], ['fumo','fiamma','Fumo','thin smoke rising slowly from the chimneys'],
  ['nebbia','nebbia','Nebbia','low mist drifting slowly through the valleys'], ['uccelli','vento','Uccelli','a few tiny distant birds gliding far away in the sky']];
function promptBase(descrizione, stile){
  const s = STILI.find(x => x.id === stile) || STILI[0];
  return `${s.prefisso}.
A very tall and narrow vertical view (portrait format, 2 wide by 5 high, like a slit window) of the landscape seen from a high window of a medieval house, looking out at: ${descrizione}.
The picture IS the view itself: no window frame, no walls, no curtains, no sill, nothing of the room in the foreground.
Compose for this narrow vertical frame: the main subject is fully visible and centered in the width, never cut by the left or right edge; a generous sky in the upper part, the landscape descending toward the viewer in the lower part; natural eye-level perspective, believable scale and deep atmospheric distance with several layers (near, middle, far).
No people in the foreground, no text, no signature, no watermark, no border, no vignette.
${LUCI.giorno}`;
}
const promptLuce = ora => `Same exact view and composition as the input image: every hill, building, tree and river stays in the same place, same framing, same style. ${LUCI[ora]} Do not add a window frame, text or borders.`;
const promptRiadatta = `Recompose this exact landscape into a very tall and narrow vertical frame (2 wide by 5 high, like a slit window): same place, same style, same light. The main subject (for example the castle or the village) must be fully visible and centered in the width, never cut by the edges. Extend the sky above and the foreground below naturally. No window frame, no text, no borders.`;
const promptAnima = (el, sec) => `[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image1] A single continuous, unbroken shot of about ${sec} seconds, no scene cuts, of exactly this landscape. Locked-off static camera on a tripod: the camera does not move at all (no pan, no tilt, no zoom, no dolly, no shake). Gentle, natural, real-time motion only: ${el.map(e => (ELEMENTI.find(x => x[0] === e) || [])[3]).filter(Boolean).join('; ')}. Buildings, rocks, mountains and the ground stay perfectly still. Same framing, light and colors as the image for the whole clip. No people, no animals in the foreground, no text, no dialogue, no music. Use this image as the first frame and the last frame.`;

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

async function faiLuci(p, foto, ore, misura){
  let reti = 0;
  for (const ora of ore){
    passo(ora, 'ora', NOME_ORA[ora][0].toUpperCase() + NOME_ORA[ora].slice(1) + ': stessa vista, altra luce…');
    try {
      const r = await Ai.modifica({modello:imp.modello, chiavi:imp.chiavi, qualita:imp.qualita, prompt:promptLuce(ora), foto, misura,
        bozza: b64 => { lavoro.anteprime[ora] = {url:'data:image/png;base64,' + b64, bozza:true}; disegnaLavoro(); }});
      const jpg = await inJpeg(b64aBlob(r.b64, r.mime));
      p.immagini[ora] = await caricaLuce(casa, p, ora, jpg);
      risolto(Ai.modello(imp.modello).fornitore === 'google' ? 'Google' : 'OpenAI');
      lavoro.anteprime[ora] = {url:p.immagini[ora]}; passo(ora, 'fatto', NOME_ORA[ora][0].toUpperCase() + NOME_ORA[ora].slice(1));
    } catch(e) {
      if (e.tipo === 'rete'){
        lavoro.errore = e.message; reti++;
        passo(ora, 'errore', NOME_ORA[ora] + ': connessione interrotta');
        if (reti >= 2){ ore.slice(ore.indexOf(ora) + 1).forEach(o2 => passo(o2, '', NOME_ORA[o2] + ': non provata')); break; }   /* la rete non regge: inutile insistere */
        continue;
      }
      passo(ora, 'errore', NOME_ORA[ora] + ': ' + e.message);
      if (e.tipo === 'credito' || e.tipo === 'chiave'){                 /* inutile provare le altre: si fermano qui */
        ore.slice(ore.indexOf(ora) + 1).forEach(o2 => passo(o2, '', NOME_ORA[o2] + ': non provata'));
        segnala(e); break;
      }
    }
  }
}
async function faiProfondita(p, foto){
  passo('prof', 'ora', 'Profondità: la calcolo sul telefono…');
  try {
    const png = await calcolaProfondita(foto, pc => passo('prof', 'ora', 'Profondità: scarico il modello ' + pc + '%'));
    p.immagini.profondita = await caricaProfondita(casa, p, png);
    passo('prof', 'fatto', 'Profondità');
  } catch(e) { passo('prof', 'errore', 'Profondità non calcolata (la finestra fa da sé): ' + e.message); }
}
async function faiAnimazione(p, foto, ora, elementi){
  const mv = MODELLI_VIDEO.find(m => m.id === imp.video.modello) || MODELLI_VIDEO[0];
  passo('anim', 'ora', `Animazione con ${mv.nome}: in coda…`); lavoro.av = 0;
  const mp4 = await Ai.anima({chiave:imp.chiavi.google, modello:mv.id, foto, fuoco:p.fuoco, prompt:promptAnima(elementi, imp.video.secondi),
    progresso:(pc, st) => { lavoro.av = pc; passo('anim', 'ora', `Animazione con ${mv.nome}: ${st === 'invio' ? 'la mando' : st === 'scarico' ? 'la scarico' : 'la sta girando'}… ${Math.round(pc)}%`); }});
  passo('anim', 'ora', 'Animazione: la salvo…');
  p.animati[ora] = await caricaAnimazione(casa, p, ora, mp4);
  lavoro.av = null; passo('anim', 'fatto', 'Animazione (' + imp.video.secondi + ' s, in loop)');
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
    await faiLuci(p, jpg, ['alba','tramonto','notte'].filter(o => imp.luci[o]), misura);
    aggiornaInLibreria(p);
    await faiProfondita(p, jpg); aggiornaInLibreria(p);
    if (imp.anima){ try { await faiAnimazione(p, jpg, 'giorno', imp.elementi); aggiornaInLibreria(p); } catch(e) { passo('anim', 'errore', 'Animazione: ' + e.message); segnala(e); } }
  });
}

function disegnaCrea(){
  const s = $('#s-crea'); const m = Ai.modello(imp.modello), mv = MODELLI_VIDEO.find(x => x.id === imp.video.modello) || MODELLI_VIDEO[0] || {nome:'', euroSecondo:0};
  const nLuci = ['alba','tramonto','notte'].filter(o => imp.luci[o]).length;
  const costo = (m.costo[imp.qualita] || m.costo.alta) * (1 + nLuci * 1.15) + (imp.anima ? mv.euroSecondo * imp.video.secondi : 0);
  const desc = $('#creaDesc') ? $('#creaDesc').value : '', nome = $('#creaNome') ? $('#creaNome').value : '';
  s.innerHTML = testa('scintilla', 'Crea', 'Un paesaggio nuovo, dipinto dall\'AI') + `<div class="problema" hidden></div>
    <div class="pannello" style="display:flex;align-items:center;gap:12px">${icona('tavolozza', 22)}<div style="flex:1;min-width:0"><b style="font:500 12.5px var(--display);letter-spacing:.1em;text-transform:uppercase">${esc(m.nome)}</b><div class="nota" style="margin:0">qualità ${esc(imp.qualita)}${imp.chiavi[m.fornitore] ? '' : ' · manca la chiave'}</div></div><button class="btn piccolo" data-fai="vaiImp">Cambia</button></div>
    <div class="sezione">${titolo('tavolozza', 'Stile', 'quelli di DMaster')}
      <div class="stili">${STILI.map(st => `<button class="stile" data-fai="stile" data-v="${st.id}" aria-pressed="${imp.stile === st.id}"><div class="tela" style="background:${st.tela}"></div><b>${st.nome}</b><small>${st.nota}</small></button>`).join('')}</div></div>
    <div class="sezione">${titolo('occhio', 'Che cosa si vede')}
      <label class="campo"><span>Nome</span><input id="creaNome" maxlength="40" placeholder="Es. Valle col castello" value="${esc(nome)}"></label>
      <label class="campo"><span>Descrizione</span><textarea id="creaDesc" placeholder="Descrivi il paesaggio fuori dalla finestra, anche in poche parole.">${esc(desc)}</textarea></label>
      <div class="pillole">${IDEE.map(([n], i) => `<button class="pillola" data-fai="idea" data-v="${i}">${esc(n)}</button>`).join('')}</div></div>
    <div class="sezione">${titolo('alba', 'Le luci del giorno')}
      <div class="scelte c4">${['giorno','alba','tramonto','notte'].map(o => `<button class="scelta" data-fai="luce" data-v="${o}" aria-pressed="${o === 'giorno' || !!imp.luci[o]}" ${o === 'giorno' ? 'disabled style="opacity:1"' : ''}>${icona(o === 'giorno' ? 'sole' : o === 'notte' ? 'luna' : o, 22)}<span>${NOME_ORA[o]}</span></button>`).join('')}</div>
      <p class="nota">Alba, tramonto e notte sono lo stesso paesaggio con un'altra luce: quando cambia l'ora, le finestre sfumano dall'una all'altra senza cambiare vista.</p></div>
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
  const linkPi = new URL('../finestra/?casa=' + casa, location.href).href, linkTel = location.origin + location.pathname + '?casa=' + casa;
  s.innerHTML = testa('manopole', 'Impostazioni', 'Modelli, chiavi e finestre') + `<div class="problema" hidden></div>
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
      ${titolo('nuvola', 'Che cosa si muove')}<div class="pillole" id="animEl">${ELEMENTI.map(([e, ic, t]) => `<button class="pillola" data-fai="elemento" data-v="${e}" aria-pressed="${imp.elementi.includes(e)}">${icona(ic, 15)}${t}</button>`).join('')}</div>
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
  idea: v => { const [n, d] = IDEE[+v]; $('#creaNome').value = n; $('#creaDesc').value = d; },
  luce: v => { imp.luci[v] = !imp.luci[v]; salvaImp(); disegnaCrea(); },
  animaToggle: () => { imp.anima = !imp.anima; salvaImp(); disegnaCrea(); },
  crea: () => crea(),
  modello: v => { imp.modello = v; salvaImp(); disegnaImpostazioni(); },
  qualita: v => { imp.qualita = v; salvaImp(); disegnaImpostazioni(); },
  modelloVideo: v => { imp.video.modello = v; salvaImp(); disegnaImpostazioni(); },
  secondi: v => { imp.video.secondi = +v; salvaImp(); disegnaImpostazioni(); },
  vediChiave: v => { const el = document.getElementById(v); el.type = el.type === 'password' ? 'text' : 'password'; },
  nFinestre: v => { assetto = assettoOPredefinito(); assetto.n = +v; mandaFori(); disegnaImpostazioni(); if (scheda === 'finestre') aggiornaFinestre(); },
  bordi: () => { mostraBordi = !mostraBordi; canale.manda('fori', Object.assign({mostra: mostraBordi}, assettoOPredefinito())); disegnaImpostazioni(); },
  copia: v => { navigator.clipboard?.writeText(v).then(() => avviso('Link copiato')).catch(() => avviso(v)); },
  ricaricaFinestre: () => { if (canale.manda('ricarica')){ rimanda = true; avviso('Le finestre si ricaricano'); } else avviso('Non collegato', true); },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fai]'); if (!b || b.disabled) return;
  if (comandaDM() && BLOCCATE_DA_DM.has(b.dataset.fai)){ e.preventDefault(); avvisoInMano(); return; }
  const f = AZIONI[b.dataset.fai]; if (f){ e.preventDefault(); f(b.dataset.v, b); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="switch"]')){ e.preventDefault(); e.target.click(); } });

/* via */
caricaLibreria();
disegnaScheda();
