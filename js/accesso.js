/* ═══════════════════════════════════════════════════════════════════════════
   accesso.js — account, case private e abbinamento degli schermi (DMaster Atmosphere).

   Maurizio (30/10): «Rendiamo scalabile l'approccio per quando metteremo in commercio l'app» → account subito.
   Fino ad oggi la casa era un link con dentro una chiave: chi aveva il link comandava le finestre e il
   deposito era pubblico. Adesso:
     · il telefono entra con l'email (un codice di 6 cifre via email; niente password) e la casa ha un proprietario;
     · ogni schermo (finestre, TV), DMaster e il computer che rifinisce i video entrano con un accesso anonimo
       e diventano «membri» della casa quando il proprietario scrive sul telefono il codice che mostrano;
     · le immagini stanno nel deposito privato «atmosfera/<casa>/…»: le legge solo chi è membro, con indirizzi
       firmati a tempo; i comandi passano sul canale privato «atm:<casa>».
   Le regole stanno nel database (supabase/2026-10-30-atmosfera-case-private.sql).
   Durante il passaggio il vecchio link continua a funzionare: il telefono scrive in tutti e due i depositi e
   parla su tutti e due i canali, finché non si chiude il vecchio accesso.
   ═══════════════════════════════════════════════════════════════════════════ */
const DEPOSITO_PRIVATO = 'atmosfera';
const SCADENZA_FIRMA = 30 * 24 * 3600;      /* gli indirizzi firmati valgono 30 giorni; le pagine li rifanno a ogni avvio */

const Accesso = {
  _sb: null,
  get sb(){
    if (!this._sb) this._sb = supabase.createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA, {
      auth:{persistSession:true, autoRefreshToken:true, storageKey:'atm-accesso', detectSessionInUrl:true},
      realtime:{params:{eventsPerSecond:20}}});
    return this._sb;
  },
  async utente(){ const {data} = await this.sb.auth.getSession(); return data.session ? data.session.user : null; },
  async conAccount(){ const u = await this.utente(); return u && !u.is_anonymous ? u : null; },

  /* ── il telefono: email e codice ─────────────────────────────────────────── */
  async chiediCodiceEmail(email){
    const {error} = await this.sb.auth.signInWithOtp({email: email.trim(), options:{shouldCreateUser:true, emailRedirectTo: location.href.split('#')[0]}});
    if (error) throw new Error(error.message.includes('rate') ? 'Troppe richieste: aspetta un minuto e riprova.' : 'Email non mandata: ' + error.message);
  },
  async verificaCodiceEmail(email, codice){
    const {data, error} = await this.sb.auth.verifyOtp({email: email.trim(), token: String(codice).replace(/\D/g, ''), type:'email'});
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'Codice sbagliato o scaduto.' : error.message);
    return data.user;
  },
  async esci(ovunque = false){ await this.sb.auth.signOut(ovunque ? {scope:'global'} : undefined); },

  /* ── le case ─────────────────────────────────────────────────────────────── */
  async mieCase(){
    const {data, error} = await this.sb.from('atm_case').select('*').order('creata');
    if (error) throw new Error('Case non lette: ' + error.message);
    return data || [];
  },
  async reclama(chiaveVecchia, nome = 'Casa'){
    const {data, error} = await this.sb.rpc('atm_reclama', {chiave: chiaveVecchia, nome});
    if (error) throw new Error(error.message);
    return data;
  },
  async nuovaCasa(nome = 'Casa'){
    const {data, error} = await this.sb.rpc('atm_nuova_casa', {nome});
    if (error) throw new Error(error.message);
    return data;
  },
  async membri(casa){
    const {data, error} = await this.sb.from('atm_membri').select('utente, ruolo, nome, aggiunto').eq('casa', casa).order('aggiunto');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async togliMembro(casa, utente){
    const {error} = await this.sb.from('atm_membri').delete().eq('casa', casa).eq('utente', utente);
    if (error) throw new Error(error.message);
  },

  /* ── abbinamento: lo schermo chiede un codice, il proprietario lo scrive ───── */
  async entraAnonimo(){
    const u = await this.utente(); if (u) return u;
    const {data, error} = await this.sb.auth.signInAnonymously();
    if (error) throw new Error('Accesso anonimo non riuscito: ' + error.message);
    return data.user;
  },
  async codiceSchermo(ruolo = 'schermo', nome = ''){
    await this.entraAnonimo();
    const {data, error} = await this.sb.rpc('atm_chiedi_codice', {ruolo, nome});
    if (error) throw new Error(error.message);
    return data;
  },
  async abbina(codice, casa){
    const {data, error} = await this.sb.rpc('atm_abbina', {codice: String(codice).replace(/\D/g, ''), casa});
    if (error) throw new Error(error.message);
    if (data && data.errore) throw new Error(data.errore[0].toUpperCase() + data.errore.slice(1) + '.');
    return data;
  },
  /* che schermo c'è dietro un codice (prima di aggiungerlo); se la funzione non c'è ancora, null */
  async vediCodice(codice){
    const {data, error} = await this.sb.rpc('atm_vedi_codice', {codice: String(codice).replace(/\D/g, '')});
    if (error) return null;
    if (data && data.errore) throw new Error(data.errore[0].toUpperCase() + data.errore.slice(1) + '.');
    return data;
  },
  async rinomina(casa, utente, nome){
    const {error} = await this.sb.rpc('atm_rinomina_membro', {casa, utente, nome});
    if (error) throw new Error(error.message);
  },
  /* il vecchio link: chiuso dal proprietario quando tutti gli schermi sono nella casa */
  async vecchioChiuso(casa){
    const {data, error} = await this.sb.from('atm_case').select('vecchio_chiuso').eq('id', casa).limit(1);
    return !error && data && data[0] ? !!data[0].vecchio_chiuso : false;
  },
  async chiudiVecchio(casa){
    const {error} = await this.sb.from('atm_case').update({vecchio_chiuso: true}).eq('id', casa);
    if (error) throw new Error(error.message);
  },
  /* ── il telefono entra senza email: QR d'invito mostrato da DMaster (Maurizio, 30/10: «Dovrei farlo una volta su
     DMaster e poi tutto il resto, anche Atmosphere se lo ricorda») ── */
  async creaInvito(casa){
    const {data, error} = await this.sb.rpc('atm_crea_invito', {casa});
    if (error) throw new Error(error.message);
    return data;
  },
  async usaInvito(token, nome = 'Telefono'){
    await this.entraAnonimo();
    const {data, error} = await this.sb.rpc('atm_usa_invito', {token, nome});
    if (error) throw new Error(error.message);
    if (data && data.errore) throw new Error(data.errore[0].toUpperCase() + data.errore.slice(1) + '.');
    return data.casa;
  },
  invitoDa(testo){ const m = String(testo || '').match(/[?&]invito=([0-9a-f]{64})/); return m ? m[1] : null; },
  /* la stanza che questo apparecchio comanda (proprietario o telefono collegato da DMaster), con la sua riga */
  async stanzaComandata(){
    const u = await this.utente(); if (!u) return null;
    const {data} = await this.sb.from('atm_membri').select('casa, ruolo').eq('utente', u.id).in('ruolo', ['proprietario', 'comando']).limit(1);
    if (!data || !data.length) return null;
    const {data: c} = await this.sb.from('atm_case').select('*').eq('id', data[0].casa).limit(1);
    return c && c[0] ? Object.assign({}, c[0], {mioRuolo: data[0].ruolo}) : null;
  },
  /* un codice da un QR («…/telecomando/?abbina=123456») o scritto a mano */
  codiceDa(testo){
    const t = String(testo || ''); let m = t.match(/[?&]abbina=(\d{6})/); if (m) return m[1];
    m = t.replace(/\s/g, '').match(/^\d{6}$/); return m ? m[0] : null;
  },
  /* la casa di cui questo apparecchio è membro (uno schermo ne ha una sola) */
  async miaCasa(){
    const u = await this.utente(); if (!u) return null;
    const {data, error} = await this.sb.from('atm_membri').select('casa, ruolo, nome').eq('utente', u.id).limit(1);
    if (error || !data || !data.length) return null;
    return data[0];
  },

  /* ── deposito privato ────────────────────────────────────────────────────── */
  deposito(){ return this.sb.storage.from(DEPOSITO_PRIVATO); },
  async elenco(casa){
    const {data, error} = await this.deposito().list(casa, {limit:1000, sortBy:{column:'name', order:'desc'}});
    if (error) throw new Error('Lettura del deposito non riuscita: ' + error.message);
    return data || [];
  },
  _firme: (() => { const m = new Map(); try { const o = JSON.parse(localStorage.getItem('atm-firme') || '{}'), ora = Date.now();
    for (const k in o) if (o[k].fino > ora + 86400e3) m.set(k, o[k]); } catch(e) {} return m; })(),
  _ricordaFirme(){ try { localStorage.setItem('atm-firme', JSON.stringify(Object.fromEntries(this._firme))); } catch(e) {} },
  /* indirizzi firmati per una lista di nomi di file della casa. Si ricordano (stesso indirizzo = il browser non
     riscarica): ver = {nome: data dell'ultima modifica}; se il file è stato riscritto (cucito, ingrandito) la firma si rifà */
  async firma(casa, nomi, ver = {}){
    const ora = Date.now(), fuori = {}, mancano = [], chiave = n => casa + '/' + n;
    for (const n of nomi){ const f = this._firme.get(chiave(n)); if (f && f.fino > ora + 3600e3 && (f.v || '') === (ver[n] || f.v || '')) fuori[n] = f.url; else mancano.push(n); }
    if (mancano.length){
      for (let i = 0; i < mancano.length; i += 200){
        const blocco = mancano.slice(i, i + 200);
        const {data, error} = await this.deposito().createSignedUrls(blocco.map(n => casa + '/' + n), SCADENZA_FIRMA);
        if (error) throw new Error('Indirizzi non firmati: ' + error.message);
        for (const d of data || []){
          if (!d.signedUrl || !d.path) continue;
          const n = d.path.slice(casa.length + 1), url = /^https?:/.test(d.signedUrl) ? d.signedUrl : SUPABASE_URL + '/storage/v1' + d.signedUrl;
          this._firme.set(chiave(n), {url, fino: ora + SCADENZA_FIRMA * 1000, v: ver[n] || ''}); fuori[n] = url;
        }
      }
      this._ricordaFirme();
    }
    return fuori;
  },
  async carica(casa, nome, blob, tipo){
    const {error} = await this.deposito().upload(casa + '/' + nome, blob, {upsert:true, contentType:tipo, cacheControl:'31536000'});
    if (error) throw new Error('Caricamento nel deposito privato non riuscito: ' + error.message);
  },
  async togli(casa, nomi){
    if (!nomi.length) return;
    const {error} = await this.deposito().remove(nomi.map(n => casa + '/' + n));
    if (error) throw new Error(error.message);
  },

  /* ── canale privato ──────────────────────────────────────────────────────── */
  /* stessa forma di apriCanale (js/canale.js): {manda(evento, dati), pronto} */
  canale(casa, {suMessaggio, suStato}){
    const ch = this.sb.channel('atm:' + casa, {config:{private:true, broadcast:{self:false, ack:false}}});
    let pronto = false;
    ch.on('broadcast', {event:'*'}, m => suMessaggio && suMessaggio(m.event, m.payload || {}));
    const via = () => ch.subscribe(s => {
      pronto = s === 'SUBSCRIBED'; suStato && suStato(pronto, s);
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setTimeout(() => { try { ch.unsubscribe(); } catch(e) {} via(); }, 8000);
    });
    /* il canale privato vuole il gettone dell'accesso: prima la sessione, poi l'iscrizione */
    this.sb.auth.getSession().then(({data}) => { if (data.session) this.sb.realtime.setAuth(data.session.access_token); via(); });
    return {
      manda(evento, dati = {}){ if (pronto) ch.send({type:'broadcast', event:evento, payload:dati}); return pronto; },
      get pronto(){ return pronto; },
      chiudi(){ try { ch.unsubscribe(); } catch(e) {} }
    };
  }
};
if (typeof module !== 'undefined') module.exports = {Accesso};
