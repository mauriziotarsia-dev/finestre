/* ═══════════════════════════════════════════════════════════════════════════
   ai.js — immagini e animazioni con la tua chiave (BYOK), direttamente dal telefono.
   Immagini: OpenAI (gpt-image-2, gpt-image-1, gpt-image-1-mini) o Google (Nano Banana Pro / Nano Banana).
   Animazioni: OpenAI Sora 2 (sora-2, sora-2-pro), da un'immagine ferma a un breve video.
   ═══════════════════════════════════════════════════════════════════════════ */

const MODELLI_IMMAGINE = [
  {id:'openai:gpt-image-2',       nome:'GPT Image 2',        fornitore:'openai', note:'Il più recente di OpenAI. Proporzione esatta del foro (2:5).', costo:{alta:.19, media:.05, bassa:.012}},
  {id:'openai:gpt-image-1',       nome:'GPT Image 1',        fornitore:'openai', note:'Il modello di DMaster. Verticale 2:3, la finestra taglia i lati.', costo:{alta:.25, media:.063, bassa:.016}},
  {id:'openai:gpt-image-1-mini',  nome:'GPT Image 1 mini',   fornitore:'openai', note:'Economico, per le prove.', costo:{alta:.052, media:.015, bassa:.006}},
  {id:'google:gemini-3-pro-image-preview', nome:'Nano Banana Pro', fornitore:'google', note:'Google, molto realistico. Verticale 9:16.', costo:{alta:.14, media:.14, bassa:.14}},
  {id:'google:gemini-2.5-flash-image',     nome:'Nano Banana',     fornitore:'google', note:'Google, veloce ed economico. Verticale 9:16.', costo:{alta:.039, media:.039, bassa:.039}},
];
/* Animazioni: Gemini Omni Flash di Google (Interactions API), con la chiave Google.
   (L'API Sora di OpenAI è stata spenta il 24 settembre 2026, le Veo 3.1 «preview» di Google il 22 ottobre.)
   Il loop è vero: si chiede la stessa immagine come primo e ultimo fotogramma. */
const MODELLI_VIDEO = [
  {id:'omni-720p',  modello:'gemini-omni-1.1-flash', risoluzione:'720p',  nome:'Gemini Omni Flash',        euroSecondo:.10, note:'Google, 720p verticale. Loop vero: primo e ultimo fotogramma uguali.'},
  {id:'omni-1080p', modello:'gemini-omni-1.1-flash', risoluzione:'1080p', nome:'Gemini Omni Flash · 1080p', euroSecondo:.15, note:'Più definito (ingrandito dall\'AI): si vede meglio da vicino. Costo stimato.'},
];

const Ai = {
  modello(id){ return MODELLI_IMMAGINE.find(m => m.id === id) || MODELLI_IMMAGINE[0]; },

  async errore(r, chi){
    let m = ''; try { const t = await r.text(); try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error.status)) || t; } catch(e) { m = t; } } catch(e) {}
    m = String(m).slice(0, 300);
    if (r.status === 401 || r.status === 403 && /key|auth|permission/i.test(m)) return new Error(`La chiave ${chi} non è valida o non ha accesso a questo modello. ${m}`);
    if (r.status === 429) return new Error(`${chi} dice che hai finito il credito o che stai facendo troppe richieste. ${m}`);
    if (/safety|moderation|blocked/i.test(m)) return new Error(`${chi} ha rifiutato la richiesta per le sue regole. Prova a cambiare la descrizione.`);
    const e = new Error(`${chi} ha risposto con un errore (${r.status}). ${m}`); e.status = r.status; e.testo = m; return e;
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

  misureOpenai(modello, preferita){
    const tutte = modello === 'gpt-image-2' ? ['832x2080', '1024x1536'] : ['1024x1536'];
    return preferita ? [preferita, ...tutte.filter(x => x !== preferita)] : tutte;
  },

  async openaiImmagine(o, modello, foto){
    const chiave = (o.chiavi || {}).openai;
    if (!chiave) throw new Error('Serve la chiave OpenAI: mettila nelle Impostazioni.');
    const url = 'https://api.openai.com/v1/images/' + (foto ? 'edits' : 'generations');
    let ultimo = null, flusso = true;
    for (const misura of this.misureOpenai(modello, o.misura)){
      for (let giro = 0; giro < 3; giro++){
        let corpo, intest = {'Authorization':'Bearer ' + chiave};
        const base = {model:modello, prompt:o.prompt, size:misura, quality:o.qualita === 'media' ? 'medium' : o.qualita === 'bassa' ? 'low' : 'high', n:1};
        if (foto){
          corpo = new FormData(); for (const k in base) corpo.append(k, base[k]);
          corpo.append('image', foto, 'riferimento.' + (foto.type.includes('png') ? 'png' : 'jpg'));
          if (modello === 'gpt-image-1') corpo.append('input_fidelity', 'high');
          if (flusso){ corpo.append('stream', 'true'); corpo.append('partial_images', '2'); }
        } else {
          intest['Content-Type'] = 'application/json';
          corpo = JSON.stringify(Object.assign(base, flusso ? {stream:true, partial_images:2} : {}));
        }
        let r;
        try { r = await fetch(url, {method:'POST', headers:intest, body:corpo}); }
        catch(e) { ultimo = new Error('La connessione con OpenAI si è interrotta. Riprovo…'); if (giro < 1) continue; throw new Error('La connessione con OpenAI si è interrotta (' + e.message + ').'); }
        if (r.ok){
          const b64 = /event-stream/.test(r.headers.get('content-type') || '') ? await this.leggiFlusso(r, o.bozza) : ((j) => j.data && j.data[0] && j.data[0].b64_json)(await r.json());
          if (b64) return {b64, mime:'image/png', misura};
          ultimo = new Error('OpenAI non ha mandato l\'immagine.'); break;
        }
        ultimo = await this.errore(r, 'OpenAI');
        if (r.status === 400 && /stream|partial/i.test(ultimo.testo || '') && flusso){ flusso = false; continue; }
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
        if (ev.error) throw new Error(ev.error.message || 'Errore da OpenAI');
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
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
      method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key':chiave},
      body: JSON.stringify({contents:[{parts:parti}], generationConfig:{responseModalities:['IMAGE'], imageConfig:{aspectRatio:'9:16'}}})
    });
    if (!r.ok) throw await this.errore(r, 'Google');
    const j = await r.json();
    const p = (j.candidates || []).flatMap(c => (c.content && c.content.parts) || []).find(x => (x.inlineData || x.inline_data));
    const d = p && (p.inlineData || p.inline_data);
    if (!d) throw new Error('Google non ha mandato l\'immagine' + (j.candidates && j.candidates[0] && j.candidates[0].finishReason ? ' (' + j.candidates[0].finishReason + ')' : '') + '.');
    return {b64:d.data, mime:d.mimeType || d.mime_type || 'image/png', misura:'9:16'};
  },

  inBase64(blob){ return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(blob); }); },

  /* ── animazioni con Gemini Omni Flash ────────────────────────────────────── */
  /* anima({chiave, modello, foto:Blob, prompt, fuoco, progresso(p, stato)}) → Blob mp4.
     Si chiede in sottofondo (background) e si chiede a che punto è ogni pochi secondi:
     così la connessione non resta muta per minuti (Safari la chiuderebbe). */
  async anima(o){
    if (!o.chiave) throw new Error('Serve la chiave Google (Gemini): mettila nelle Impostazioni.');
    const mv = MODELLI_VIDEO.find(m => m.id === o.modello) || MODELLI_VIDEO[0];
    const lato = mv.risoluzione === '1080p' ? [1080, 1920] : [720, 1280];
    const rif = await adatta(o.foto, lato[0], lato[1], 'image/jpeg', .92, o.fuoco && o.fuoco.x != null ? o.fuoco.x : .5);   /* già verticale 9:16 */
    const base = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const intest = {'Content-Type':'application/json', 'x-goog-api-key':o.chiave};
    const corpo = {model: mv.modello,
      input: [{type:'image', data: await this.inBase64(rif), mime_type:'image/jpeg'}, {type:'text', text:o.prompt}],
      response_format: {type:'video', aspect_ratio:'9:16', resolution: mv.risoluzione},
      background: true};
    o.progresso && o.progresso(2, 'invio');
    let r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)});
    if (r.status === 400){
      const e = await this.errore(r, 'Google');
      if (!/background/i.test(e.testo || '')) throw e;
      delete corpo.background;                                   /* se il sottofondo non è accettato, chiamata diretta */
      r = await fetch(base, {method:'POST', headers:intest, body:JSON.stringify(corpo)});
    }
    if (!r.ok) throw await this.errore(r, 'Google');
    let it = await r.json();
    const inizio = Date.now();
    while (it.status && it.status !== 'completed' && it.status !== 'failed' && it.status !== 'cancelled'){
      const sec = (Date.now() - inizio) / 1000;
      o.progresso && o.progresso(Math.min(95, 5 + sec / 1.8), it.status);       /* stima: 2-3 minuti */
      await new Promise(ok => setTimeout(ok, 5000));
      if (sec > 15 * 60) throw new Error('Google ci sta mettendo troppo: riprova più tardi.');
      r = await fetch(base + '/' + encodeURIComponent(it.id), {headers:{'x-goog-api-key':o.chiave}});
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
