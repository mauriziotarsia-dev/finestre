/* ═══════════════════════════════════════════════════════════════════════════
   ai.js — immagini e animazioni con la tua chiave (BYOK), direttamente dal telefono.
   Immagini: OpenAI (gpt-image-2, gpt-image-1, gpt-image-1-mini) o Google (Nano Banana Pro / Nano Banana).
   Animazioni: OpenAI Sora 2 (sora-2, sora-2-pro), da un'immagine ferma a un breve video.
   ═══════════════════════════════════════════════════════════════════════════ */

const MODELLI_IMMAGINE = [
  /* 13/11 sera · Maurizio: «aumentiamo risoluzione, dettagli, realismo, ombre, luci». GPT Image 2.5 (OpenAI, 8/9/2026,
     «sunburst» = il più capace) ha due livelli in più sopra «alta» (xhigh, max) e arriva al 4K (3840×2160).
     Costi: per immagine alla misura normale; costo4k: alla misura 4K, per livello. */
  {id:'openai:gpt-image-2.5-sunburst', nome:'GPT Image 2.5', fornitore:'openai', note:'Il più nuovo di OpenAI: luci più credibili e più dettaglio, fino al 4K.', costo:{alta:.06, media:.016, bassa:.007}, costo4k:{alta:.10, altissima:.18, massima:.40, media:.026, bassa:.011}},
  {id:'openai:gpt-image-2',       nome:'GPT Image 2',        fornitore:'openai', note:'Proporzione esatta del foro (2:5).', costo:{alta:.19, media:.05, bassa:.012}, costo4k:{alta:.40, media:.10, bassa:.025}},
  {id:'openai:gpt-image-1',       nome:'GPT Image 1',        fornitore:'openai', note:'Il modello di DMaster. Verticale 2:3, la finestra taglia i lati.', costo:{alta:.25, media:.063, bassa:.016}},
  {id:'openai:gpt-image-1-mini',  nome:'GPT Image 1 mini',   fornitore:'openai', note:'Economico, per le prove.', costo:{alta:.052, media:.015, bassa:.006}},
  {id:'google:gemini-3-pro-image-preview', nome:'Nano Banana Pro', fornitore:'google', note:'Google, molto realistico, fino al 4K. Verticale 9:16.', costo:{alta:.14, media:.14, bassa:.14}, costo4k:{alta:.24, altissima:.24, massima:.24, media:.24, bassa:.24}},
  {id:'google:gemini-2.5-flash-image',     nome:'Nano Banana',     fornitore:'google', note:'Google, veloce ed economico. Verticale 9:16.', costo:{alta:.039, media:.039, bassa:.039}},
];
/* Animazioni: Gemini Omni Flash di Google (Interactions API), con la chiave Google.
   (L'API Sora di OpenAI è stata spenta il 24 settembre 2026, le Veo 3.1 «preview» di Google il 22 ottobre.)
   Il loop è vero: si chiede la stessa immagine come primo e ultimo fotogramma. */
const MODELLI_VIDEO = [
  /* 10/11 (Maurizio: «mettiamo sempre 1080p, non ci deve essere scelta»): un modello solo, il 720p è tolto */
  {id:'omni-1080p', modello:'gemini-omni-1.1-flash', risoluzione:'1080p', nome:'Gemini Omni Flash · 1080p', euroSecondo:.15, note:'Più definito (ingrandito dall\'AI): si vede meglio da vicino. Costo stimato.'},
];

const Ai = {
  modello(id){ return MODELLI_IMMAGINE.find(m => m.id === id) || MODELLI_IMMAGINE[0]; },

  /* trasforma la risposta d'errore di un servizio in un messaggio chiaro, con un «tipo»:
     credito (soldi finiti o limite di spesa), chiave (non valida o senza accesso), troppe (troppe richieste
     insieme: basta aspettare), regole (contenuto rifiutato), altro. */
  async errore(r, chi){
    let m = '', codice = '';
    try { const t = await r.text(); try { const j = JSON.parse(t); const er = j.error || {}; m = er.message || er.status || t; codice = String(er.code || er.type || er.status || ''); } catch(e) { m = t; } } catch(e) {}
    m = String(m).slice(0, 300);
    const tutto = (codice + ' ' + m).toLowerCase();
    const fai = (tipo, testo) => { const e = new Error(testo); e.tipo = tipo; e.status = r.status; e.testo = m; e.chi = chi; return e; };
    const ricarica = chi.startsWith('OpenAI') ? 'platform.openai.com → Billing' : 'aistudio.google.com → Billing';
    if (/insufficient_quota|billing_hard_limit|billing_not_active|exceeded your current quota|credit balance|out of credit|billing_disabled|billing to be enabled|enable billing|prepayment|credits? (are|is) depleted/.test(tutto))
      return fai('credito', `Credito ${chi} esaurito (o limite di spesa raggiunto). Ricarica su ${ricarica}, poi riprova.`);
    if (r.status === 401 || (r.status === 403 && /key|auth|permission|denied/.test(tutto)) || /invalid_api_key|api key not valid|api_key_invalid/.test(tutto))
      return fai('chiave', `La chiave ${chi} non è valida o non ha accesso a questo modello. Controllala nelle Impostazioni.`);
    /* 14/11 · il 429 di Google per «troppe richieste» dice anche «check quota»: è credito solo se la quota è a zero o giornaliera */
    if (r.status === 429 || /resource_exhausted|rate_limit/.test(tutto))
      return fai(/limit: 0|free tier|per ?day|perday/.test(tutto) ? 'credito' : 'troppe',
        /limit: 0|free tier|per ?day|perday/.test(tutto) ? `${chi}: hai raggiunto la quota (o il limite gratuito). Ricarica o aspetta il rinnovo su ${ricarica}.`
                                                        : `${chi} dice che stai facendo troppe richieste insieme: aspetta un minuto e riprova.`);
    if (/safety|moderation|blocked|content_policy/.test(tutto)) return fai('regole', `${chi} ha rifiutato la richiesta per le sue regole. Prova a cambiare la descrizione.`);
    return fai('altro', `${chi} ha risposto con un errore (${r.status}). ${m}`);
  },
  /* la rete è caduta prima della risposta: non si sa se il servizio ha lavorato; spesso è il telefono (rete debole, schermo spento) */
  rete(chi, e){
    const x = new Error(`La connessione con ${chi} si è interrotta prima che arrivasse la risposta (rete del telefono debole o schermo spento). Ho già riprovato una volta: riprova con una rete stabile. Se succede sempre al primo colpo, controlla anche il credito su ${chi.startsWith('OpenAI') ? 'platform.openai.com' : 'aistudio.google.com'}.`);
    x.tipo = 'rete'; x.chi = chi; x.originale = e && e.message; return x;
  },

  /* ── immagini ────────────────────────────────────────────────────────────── */
  /* crea({modello, chiavi, prompt, qualita, bozza}) → {b64, mime, misura} */
  async crea(o){
    const m = this.modello(o.modello);
    return m.fornitore === 'google' ? this.googleImmagine(o, m.id.split(':')[1], null) : this.openaiImmagine(o, m.id.split(':')[1], null);
  },
  /* modifica({…, foto:Blob, misura}) → stessa vista, altra luce */
  async modifica(o){
    const m = this.modello(o.modello);
    return m.fornitore === 'google' ? this.googleImmagine(o, m.id.split(':')[1], o.foto) : this.openaiImmagine(o, m.id.split(':')[1], o.foto);
  },

  /* quanto costa un'immagine (grande = 4K, quando il modello ci arriva) */
  costoDi(id, qualita = 'alta', grande = false){ const m = this.modello(id), t = grande && m.costo4k ? m.costo4k : m.costo; return t[qualita] || t.alta || m.costo.alta; },
  /* i livelli: bassa, media, alta, altissima (xhigh), massima (max); gli ultimi due solo GPT Image 2.5, gli altri si fermano ad «alta» */
  livelloOpenai(modello, qualita){ const due5 = /^gpt-image-2\.5/.test(modello);
    return qualita === 'media' ? 'medium' : qualita === 'bassa' ? 'low' : qualita === 'altissima' && due5 ? 'xhigh' : qualita === 'massima' && due5 ? 'max' : 'high'; },
  rapporto(misura){ return misura === 'orizzontale' ? '21:9' : misura === 'tv' ? '16:9' : '9:16'; },
  misureOpenai(modello, preferita, grande){
    /* grande: il 4K vero (3840×2160) dove il modello ci arriva (GPT Image 2 e 2.5); se no si scende */
    if (preferita === 'tv' && grande && /^gpt-image-2/.test(modello)) return ['3840x2160', '2560x1440', '2048x1152', '1536x1024'];
    /* orizzontale: il cielo panoramico (largo 5 per 2) */
    if (preferita === 'orizzontale') return /^gpt-image-2/.test(modello) ? ['2080x832', '1536x1024'] : ['1536x1024'];
    /* tv: la vista est del TV, 16:9 (poi il mini PC la porta al 4K vero, pi/cuci-animazione.py) */
    if (preferita === 'tv') return /^gpt-image-2/.test(modello) ? ['2560x1440', '2048x1152', '1536x1024'] : ['1536x1024'];
    const tutte = /^gpt-image-2/.test(modello) ? ['832x2080', '1024x1536'] : ['1024x1536'];
    return preferita ? [preferita, ...tutte.filter(x => x !== preferita)] : tutte;
  },

  async openaiImmagine(o, modello, foto){
    /* 13/11 notte · il 4K ci mette minuti: la prima prova (richiesta diretta) è caduta con «Load failed» (Safari chiude
       una connessione muta). In 4K si chiede in sottofondo e si controlla ogni pochi secondi, come per le animazioni;
       se il sottofondo non va, si torna alla richiesta diretta. */
    if (o.grande){
      try { return await this.openaiSottofondo(o, modello, foto); }
      catch(e){ if (!e.ripiega) throw e; }
    }
    try { return await this.openaiUna(o, modello, foto, this.livelloOpenai(modello, o.qualita)); }
    catch(e){
      /* GPT Image 2.5 non disponibile su questa chiave (modello sconosciuto o non abilitato): stessa richiesta con GPT Image 2 */
      if (/^gpt-image-2\.5/.test(modello) && (e.status === 404 || e.status === 403 || (e.status === 400 && /model/i.test(e.testo || '') && /exist|not found|invalid|unsupported|access|verif/i.test(e.testo || ''))))
        return await this.openaiUna(o, 'gpt-image-2', foto, this.livelloOpenai('gpt-image-2', o.qualita));
      throw e;
    }
  },
  async openaiSottofondo(o, modello, foto){
    const chiave = (o.chiavi || {}).openai;
    if (!chiave) throw new Error('Serve la chiave OpenAI: mettila nelle Impostazioni.');
    const intest = {'Authorization':'Bearer ' + chiave, 'Content-Type':'application/json'};
    const contenuto = [{type:'input_text', text:o.prompt}];
    if (foto) contenuto.push({type:'input_image', image_url:'data:' + (foto.type || 'image/jpeg') + ';base64,' + await this.inBase64(foto)});
    const strumento = {type:'image_generation', model:modello, size:'3840x2160', quality:this.livelloOpenai(modello, o.qualita), action: foto ? 'edit' : 'generate', output_format:'png'};
    const ripiega = e => { e.ripiega = true; return e; };
    let r, it = null, senzaRagiona = false;
    for (const guida of ['gpt-5.5', 'gpt-5']){
      for (let giro = 0; giro < 3; giro++){
        /* 14/11 · il modello guida deve solo passare il testo allo strumento: niente ragionamenti lunghi */
        const corpo = {model:guida, background:true, reasoning: senzaRagiona ? undefined : {effort:'low'}, input:[{role:'user', content:contenuto}], tools:[strumento], tool_choice:{type:'image_generation'},
          instructions:'Call the image generation tool exactly once, passing the user\'s text as the prompt word for word, without rewriting, shortening or adding anything.'};
        try { r = await fetch('https://api.openai.com/v1/responses', {method:'POST', headers:intest, body:JSON.stringify(corpo)}); }
        catch(e){ if (giro < 1) continue; throw ripiega(this.rete('OpenAI', e)); }
        if (r.ok){ it = await r.json(); break; }
        const e = await this.errore(r, 'OpenAI');
        if (r.status === 400 && /reasoning/i.test(e.testo || '') && !senzaRagiona){ senzaRagiona = true; continue; }
        if (r.status === 400 && /quality/i.test(e.testo || '') && strumento.quality !== 'high'){ strumento.quality = 'high'; continue; }
        if (r.status === 400 && /size/i.test(e.testo || '') && strumento.size !== '2560x1440'){ strumento.size = '2560x1440'; continue; }
        if ((r.status === 400 || r.status === 404 || r.status === 403) && /model/i.test(e.testo || '') && !new RegExp(modello.replace(/\./g, '\\.')).test(e.testo || '')) break;   /* manca il modello guida: si prova l'altro */
        if (r.status === 400 || r.status === 404 || r.status === 403) throw ripiega(e);
        throw e;
      }
      if (it) break;
    }
    if (!it) throw ripiega(new Error('Sottofondo non disponibile.'));
    /* 14/11 · prima si fermava a 15 minuti d'orologio: se il telefono si spegneva o l'app andava in sottofondo, al ritorno
       scadeva subito anche se l'immagine era pronta (pagata e persa). Ora conta i controlli fatti davvero (≈ 25 minuti attivi). */
    let controlli = 0;
    while (it.status && !/^(completed|failed|cancelled|incomplete)$/.test(it.status)){
      o.stato && o.stato(it.status === 'queued' ? 'OpenAI: in coda' : 'OpenAI: la sta facendo', controlli * 4);   /* 14/11: si vede a che punto è */
      await new Promise(ok => setTimeout(ok, 4000));
      if (++controlli > 375) throw new Error('OpenAI ci sta mettendo troppo: riprova più tardi.');
      try { r = await fetch('https://api.openai.com/v1/responses/' + encodeURIComponent(it.id), {headers:{'Authorization':'Bearer ' + chiave}}); } catch(e) { continue; }   /* un controllo perso non ferma niente */
      if (!r.ok) throw await this.errore(r, 'OpenAI');
      it = await r.json();
    }
    const chiamata = (it.output || []).filter(x => x.type === 'image_generation_call' && x.result).pop();
    if (!chiamata){
      const testo = (it.output || []).flatMap(x => x.content || []).map(c => c.text || '').join(' ').trim();
      const m = (it.error && it.error.message) || (it.incomplete_details && it.incomplete_details.reason) || testo;
      if (/safety|moderation|policy/i.test(m)){ const e = new Error('OpenAI ha rifiutato la richiesta per le sue regole. Prova a cambiare la descrizione.'); e.tipo = 'regole'; throw e; }
      throw new Error('OpenAI non ha fatto l\'immagine' + (m ? ': ' + String(m).slice(0, 200) : '.'));
    }
    return {b64: chiamata.result, mime: 'image/' + (chiamata.output_format || 'png'), misura: chiamata.size || strumento.size, modello};
  },
  async openaiUna(o, modello, foto, livello){
    const chiave = (o.chiavi || {}).openai;
    if (!chiave) throw new Error('Serve la chiave OpenAI: mettila nelle Impostazioni.');
    const url = 'https://api.openai.com/v1/images/' + (foto ? 'edits' : 'generations');
    let ultimo = null, flusso = true;
    for (const misura of this.misureOpenai(modello, o.misura, o.grande)){
      for (let giro = 0; giro < 4; giro++){
        let corpo, intest = {'Authorization':'Bearer ' + chiave};
        const base = {model:modello, prompt:o.prompt, size:misura, quality:livello, n:1};
        if (foto){
          corpo = new FormData(); for (const k in base) corpo.append(k, base[k]);
          corpo.append('image', foto, 'riferimento.' + (foto.type.includes('png') ? 'png' : 'jpg'));
          if (modello === 'gpt-image-1') corpo.append('input_fidelity', 'high');
          if (flusso){ corpo.append('stream', 'true'); corpo.append('partial_images', '2'); }
        } else {
          intest['Content-Type'] = 'application/json';
          corpo = JSON.stringify(Object.assign(base, flusso ? {stream:true, partial_images:2} : {}));
        }
        let r, b64;
        try {
          r = await fetch(url, {method:'POST', headers:intest, body:corpo});
          if (r.ok) b64 = /event-stream/.test(r.headers.get('content-type') || '') ? await this.leggiFlusso(r, o.bozza) : ((j) => j.data && j.data[0] && j.data[0].b64_json)(await r.json());
        } catch(e) {
          if (e.tipo) throw e;                                 /* errore vero dentro il flusso (credito, regole…) */
          if (giro < 1) continue;                              /* la rete è caduta: riprova una volta */
          throw this.rete('OpenAI', e);
        }
        if (r.ok){
          if (b64) return {b64, mime:'image/png', misura, modello};
          ultimo = new Error('OpenAI non ha mandato l\'immagine.'); break;
        }
        ultimo = await this.errore(r, 'OpenAI');
        if (r.status === 400 && /stream|partial/i.test(ultimo.testo || '') && flusso){ flusso = false; continue; }
        if (r.status === 400 && /quality/i.test(ultimo.testo || '') && (livello === 'xhigh' || livello === 'max')){ livello = 'high'; continue; }   /* livello non accettato: «alta» */
        break;
      }
      if (!(ultimo && ultimo.status === 400 && /size|dimension|resolution/i.test(ultimo.testo || ''))) break;   /* misura non accettata: prova la successiva */
    }
    throw ultimo || new Error('Immagine non creata.');
  },

  /* la risposta a flusso: bozze e poi l'immagine finita. Tiene viva la connessione (Safari chiude dopo un minuto muto). */
  async leggiFlusso(r, bozza){
    const lettore = r.body.getReader(), dec = new TextDecoder();
    let resto = '', finale = null, ultima = null;
    for (;;){
      const {value, done} = await lettore.read(); if (done) break;
      resto += dec.decode(value, {stream:true});
      let i;
      while ((i = resto.indexOf('\n\n')) >= 0){
        const blocco = resto.slice(0, i); resto = resto.slice(i + 2);
        const dati = blocco.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
        if (!dati || dati === '[DONE]') continue;
        let ev; try { ev = JSON.parse(dati); } catch(e) { continue; }
        if (ev.error){ const finto = {status: 400, text: async () => JSON.stringify({error: ev.error})}; throw await this.errore(finto, 'OpenAI'); }
        if (!ev.b64_json) continue;
        if (/completed$/.test(ev.type || '')) finale = ev.b64_json; else { ultima = ev.b64_json; bozza && bozza(ev.b64_json); }
      }
    }
    return finale || ultima;
  },

  async googleImmagine(o, modello, foto){
    const chiave = (o.chiavi || {}).google;
    if (!chiave) throw new Error('Serve la chiave Google (Gemini): mettila nelle Impostazioni.');
    const parti = [];
    if (foto) parti.push({inline_data:{mime_type:foto.type || 'image/jpeg', data: await this.inBase64(foto)}});
    parti.push({text:o.prompt});
    /* 13/11 sera · la misura: senza «imageSize» Nano Banana Pro dà solo l'1K (1376×768). 2K normale, 4K se grande
       (5504×3072 in 16:9). Il 4K ci mette di più: si chiede a flusso, con i «pensieri» del modello che arrivano mentre
       lavora, così la connessione non resta muta (Safari la chiude dopo un minuto senza dati). */
    const tre = /^gemini-3/.test(modello);
    if (tre && o.grande){
      try { return await this.googleSottofondo(o, modello, foto, chiave); }
      catch(e){ if (!e.ripiega) throw e; }
    }
    const config = {responseModalities:['IMAGE'], imageConfig: Object.assign({aspectRatio: Ai.rapporto(o.misura)}, tre ? {imageSize: o.grande ? '4K' : '2K'} : {})};
    const corpo = conPensieri => JSON.stringify({contents:[{parts:parti}], generationConfig: Object.assign({}, config, conPensieri ? {thinkingConfig:{includeThoughts:true}} : {})});
    const intest = {'Content-Type':'application/json', 'x-goog-api-key':chiave};
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${modello}`;
    if (tre){
      for (const conPensieri of [true, false]){
        let r;
        try { r = await fetch(base + ':streamGenerateContent?alt=sse', {method:'POST', headers:intest, body: corpo(conPensieri)}); }
        catch(e) { break; }                                     /* la rete: si riprova sotto, senza flusso */
        if (!r.ok){
          const e = await this.errore(r, 'Google');
          if (r.status === 400 && conPensieri && /think|thought/i.test(e.testo || '')) continue;
          if (r.status === 400 || r.status === 404) break;      /* il flusso non va: si prova la richiesta normale */
          throw e;
        }
        const lettore = r.body.getReader(), dec = new TextDecoder();
        let resto = '', finale = null, fine = '';
        for (;;){
          let pezzo; try { pezzo = await lettore.read(); } catch(e) { throw this.rete('Google', e); }
          const {value, done} = pezzo; if (done) break;
          resto += dec.decode(value, {stream:true});
          let k;
          while ((k = resto.search(/\r?\n\r?\n/)) >= 0){
            const blocco = resto.slice(0, k); resto = resto.slice(k).replace(/^\r?\n\r?\n/, '');
            const dati = blocco.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
            if (!dati) continue;
            let ev; try { ev = JSON.parse(dati); } catch(e) { continue; }
            if (ev.error){ const finto = {status: ev.error.code || 400, text: async () => JSON.stringify({error: ev.error})}; throw await this.errore(finto, 'Google'); }
            for (const c of ev.candidates || []){
              if (c.finishReason) fine = c.finishReason;
              for (const x of (c.content && c.content.parts) || []){
                const d = x.inlineData || x.inline_data;
                if (d && !x.thought) finale = d; else if (d && o.bozza) o.bozza(d.data);
              }
            }
          }
        }
        if (finale) return {b64:finale.data, mime:finale.mimeType || finale.mime_type || 'image/png', misura: Ai.rapporto(o.misura), modello};
        throw new Error('Google non ha mandato l\'immagine' + (fine ? ' (' + fine + ')' : '') + '.');
      }
    }
    const richiesta = () => fetch(base + ':generateContent', {method:'POST', headers:intest, body: corpo(false)});
    let r;
    try { r = await richiesta(); } catch(e) { try { r = await richiesta(); } catch(e2) { throw this.rete('Google', e2); } }
    if (!r.ok) throw await this.errore(r, 'Google');
    const j = await r.json();
    const p = (j.candidates || []).flatMap(c => (c.content && c.content.parts) || []).filter(x => (x.inlineData || x.inline_data) && !x.thought).pop();
    const d = p && (p.inlineData || p.inline_data);
    if (!d) throw new Error('Google non ha mandato l\'immagine' + (j.candidates && j.candidates[0] && j.candidates[0].finishReason ? ' (' + j.candidates[0].finishReason + ')' : '') + '.');
    return {b64:d.data, mime:d.mimeType || d.mime_type || 'image/png', misura: Ai.rapporto(o.misura), modello};
  },

  async googleSottofondo(o, modello, foto, chiave){
    const base = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const intest = {'Content-Type':'application/json', 'x-goog-api-key':chiave};
    const input = [];
    if (foto) input.push({type:'image', data: await this.inBase64(foto), mime_type: foto.type || 'image/jpeg'});
    input.push({type:'text', text:o.prompt});
    const corpo = {model:modello, input, response_format:{type:'image', aspect_ratio: Ai.rapporto(o.misura), image_size:'4K'}, background:true};
    const ripiega = e => { e.ripiega = true; return e; };
    let r;
    try { r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)}); }
    catch(e){ try { r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)}); } catch(e2) { throw ripiega(this.rete('Google', e2)); } }
    if (!r.ok){ const e = await this.errore(r, 'Google'); if (r.status === 400 || r.status === 404) throw ripiega(e); throw e; }
    let it = await r.json();
    let controlli = 0;
    while (it.status && it.status !== 'completed' && it.status !== 'failed' && it.status !== 'cancelled'){
      o.stato && o.stato('Google: la sta facendo', controlli * 4);
      await new Promise(ok => setTimeout(ok, 4000));
      if (++controlli > 375) throw new Error('Google ci sta mettendo troppo: riprova più tardi.');
      try { r = await fetch(base + '/' + encodeURIComponent(it.id), {headers:{'x-goog-api-key':chiave}}); } catch(e) { continue; }
      if (!r.ok) throw await this.errore(r, 'Google');
      it = await r.json();
    }
    if (it.status === 'failed' || it.status === 'cancelled') throw new Error('Google non è riuscito a fare l\'immagine: ' + ((it.error && it.error.message) || it.status));
    const parti = (it.steps || []).filter(x => x.type === 'model_output').flatMap(x => x.content || []).concat(it.outputs || []);
    const img = parti.filter(x => x.type === 'image' && (x.data || x.uri) && !x.thought).pop() || it.output_image;
    if (!img){ const t = parti.find(x => x.type === 'text'); throw new Error('Google non ha mandato l\'immagine' + (t ? ': ' + String(t.text).slice(0, 200) : '.')); }
    if (img.data) return {b64: img.data, mime: img.mime_type || 'image/png', misura: Ai.rapporto(o.misura), modello};
    const d = await fetch(img.uri, {headers:{'x-goog-api-key':chiave}});
    if (!d.ok) throw await this.errore(d, 'Google');
    return {b64: await this.inBase64(await d.blob()), mime: img.mime_type || 'image/png', misura: Ai.rapporto(o.misura), modello};
  },

  inBase64(blob){ return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(blob); }); },

  /* ── dove sono i comignoli (4/11, Maurizio: «l'effetto fumo da comignolo va messo quando possibile, dà un senso
     di movimento e non di staticità») ─────────────────────────────────────────
     Una sola domanda all'AI che guarda l'immagine: dove c'è un comignolo (o, sulle case che non lo mostrano, il
     punto del tetto da cui salirebbe il fumo). Il fumo poi lo disegna la finestra, dal vivo: mai in loop.
     trovaComignoli({chiavi, foto:Blob}) → [{x, y, w}] in frazioni dell'immagine: x, y la cima del comignolo,
     w la larghezza del tetto (dà la scala del pennacchio). Prima Google, poi OpenAI; i nomi dei modelli cambiano,
     si prova il primo che risponde. */
  async trovaComignoli(o){
    const ch = o.chiavi || {};
    if (!ch.google && !ch.openai) throw Object.assign(new Error('Serve una chiave Google o OpenAI nelle Impostazioni.'), {tipo:'chiave'});
    const bmp = await createImageBitmap(o.foto), k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', .88)), b64 = await this.inBase64(jpg);
    const domanda = `This is a painted landscape. Find the places where chimney smoke would rise: every visible chimney on a house, farmhouse, village or castle roof; for houses whose chimney is not visible, the point on the roof ridge where a chimney would be. Only real inhabited buildings (houses, farms, villages), not towers, bell towers, churches, ruins, rocks or trees. At most 6, preferring the most visible ones (near and middle distance); if there are none, return an empty list.
Answer ONLY with JSON: {"comignoli":[{"x":<0-1000>,"y":<0-1000>,"w":<0-1000>}]} where x,y is the top of the chimney (0,0 = top-left of the image, 1000,1000 = bottom-right) and w is the width of that building's roof in the same units.`;
    const leggi = t => {
      const j = JSON.parse(String(t).replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
      return (j.comignoli || []).filter(q => q && isFinite(q.x) && isFinite(q.y)).slice(0, 6)
        .map(q => ({x: Math.min(1, Math.max(0, q.x / 1000)), y: Math.min(1, Math.max(0, q.y / 1000)), w: Math.min(.3, Math.max(.008, (+q.w || 30) / 1000))}));
    };
    let ultimo = null;
    if (ch.google){
      for (const m of ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash']){
        let r;
        try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key':ch.google},
          body: JSON.stringify({contents:[{parts:[{inline_data:{mime_type:'image/jpeg', data:b64}}, {text:domanda}]}], generationConfig:{responseMimeType:'application/json', temperature:0}})}); }
        catch(e) { ultimo = this.rete('Google', e); continue; }
        if (r.status === 404 || r.status === 400){ ultimo = await this.errore(r, 'Google'); continue; }   /* modello che non c'è (più): il prossimo */
        if (!r.ok){ ultimo = await this.errore(r, 'Google'); if (ultimo.tipo === 'credito' || ultimo.tipo === 'chiave') break; continue; }
        const d = await r.json(), t = ((((d.candidates || [])[0] || {}).content || {}).parts || []).map(x => x.text || '').join('');
        try { return leggi(t); } catch(e) { ultimo = new Error('Risposta di Google non leggibile.'); }
      }
    }
    if (ch.openai){
      for (const m of ['gpt-5-mini', 'gpt-4.1-mini']){
        let r;
        try { r = await fetch('https://api.openai.com/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ch.openai},
          body: JSON.stringify({model:m, response_format:{type:'json_object'}, messages:[{role:'user', content:[{type:'text', text:domanda}, {type:'image_url', image_url:{url:'data:image/jpeg;base64,' + b64}}]}]})}); }
        catch(e) { ultimo = this.rete('OpenAI', e); continue; }
        if (r.status === 404 || r.status === 400){ ultimo = await this.errore(r, 'OpenAI'); continue; }
        if (!r.ok){ ultimo = await this.errore(r, 'OpenAI'); break; }
        const d = await r.json();
        try { return leggi(((d.choices || [])[0] || {}).message.content); } catch(e) { ultimo = new Error('Risposta di OpenAI non leggibile.'); }
      }
    }
    throw ultimo || new Error('Nessuna risposta.');
  },

  /* ── animazioni con Gemini Omni Flash ────────────────────────────────────── */
  /* anima({chiave, modello, foto:Blob, prompt, fuoco, progresso(p, stato)}) → Blob mp4.
     Si chiede in sottofondo (background) e si chiede a che punto è ogni pochi secondi:
     così la connessione non resta muta per minuti (Safari la chiuderebbe). */
  async anima(o){
    if (!o.chiave) throw new Error('Serve la chiave Google (Gemini): mettila nelle Impostazioni.');
    const mv = MODELLI_VIDEO.find(m => m.id === o.modello) || MODELLI_VIDEO[0];
    /* o.tv: la vista del TV, orizzontale 16:9 (4/11); se no le finestrelle, verticale 9:16 */
    const lato = mv.risoluzione === '1080p' ? [1080, 1920] : [720, 1280];
    if (o.tv) lato.reverse();
    const rif = await adatta(o.foto, lato[0], lato[1], 'image/jpeg', .92, o.tv ? .5 : o.fuoco && o.fuoco.x != null ? o.fuoco.x : .5);
    const base = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const intest = {'Content-Type':'application/json', 'x-goog-api-key':o.chiave};
    const corpo = {model: mv.modello,
      input: [{type:'image', data: await this.inBase64(rif), mime_type:'image/jpeg'}, {type:'text', text:o.prompt}],
      response_format: {type:'video', aspect_ratio: o.tv ? '16:9' : '9:16', resolution: mv.risoluzione},
      background: true};
    o.progresso && o.progresso(2, 'invio');
    let r;
    try { r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)}); } catch(e) { throw this.rete('Google', e); }
    if (r.status === 400){
      const e = await this.errore(r, 'Google');
      if (!/background/i.test(e.testo || '')) throw e;
      delete corpo.background;                                   /* se il sottofondo non è accettato, chiamata diretta */
      r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)});
    }
    if (!r.ok) throw await this.errore(r, 'Google');
    let it = await r.json();
    const inizio = Date.now(); let controlli = 0;
    while (it.status && it.status !== 'completed' && it.status !== 'failed' && it.status !== 'cancelled'){
      const sec = (Date.now() - inizio) / 1000;
      o.progresso && o.progresso(Math.min(95, 5 + sec / 1.8), it.status);       /* stima: 2-3 minuti */
      await new Promise(ok => setTimeout(ok, 5000));
      if (++controlli > 300) throw new Error('Google ci sta mettendo troppo: riprova più tardi.');   /* 14/11: controlli fatti, non orologio */
      try { r = await fetch(base + '/' + encodeURIComponent(it.id), {headers:{'x-goog-api-key':o.chiave}}); } catch(e) { continue; }   /* un controllo perso non ferma niente */
      if (!r.ok) throw await this.errore(r, 'Google');
      it = await r.json();
    }
    if (it.status === 'failed' || it.status === 'cancelled') throw new Error('Google non è riuscito a fare il video: ' + ((it.error && it.error.message) || it.status));
    const parti = (it.steps || []).filter(x => x.type === 'model_output').flatMap(x => x.content || []);
    const v = parti.find(x => x.type === 'video') || (it.output_video || null);
    if (!v) throw new Error('Google non ha mandato il video' + (parti.find(x => x.type === 'text') ? ': ' + parti.find(x => x.type === 'text').text.slice(0, 200) : '.'));
    o.progresso && o.progresso(98, 'scarico');
    if (v.data) return b64aBlob(v.data, v.mime_type || 'video/mp4');
    if (v.uri){
      const d = await fetch(v.uri, {headers:{'x-goog-api-key':o.chiave}});
      if (!d.ok) throw await this.errore(d, 'Google');
      return await d.blob();
    }
    throw new Error('Video vuoto.');
  },
};

/* ridimensiona un'immagine coprendo esattamente w×h (taglia quello che avanza, centrato) */
async function adatta(blob, w, h, tipo = 'image/jpeg', qualita = .92, fx = .5){
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const s = Math.max(w / bmp.width, h / bmp.height), sw = w / s, sh = h / s;
  c.getContext('2d').drawImage(bmp, (bmp.width - sw) * fx, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  return await new Promise(r => c.toBlob(r, tipo, qualita));
}
function b64aBlob(b64, tipo){ const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], {type:tipo}); }
async function inJpeg(blob, massimo = 2400){
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, massimo / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
}
