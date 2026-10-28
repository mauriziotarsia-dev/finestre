# Finestre

Finestre virtuali per la stanza medievale: schermi in cantina dietro i trafori, comandati dal telefono.

- `telecomando/` — l'app sul telefono (Finestre · Paesaggi · Crea · Impostazioni), nello stile di DMaster Stage.
- `finestra/` — la pagina che il Raspberry mostra a schermo intero (`?casa=CODICE`).
- `js/vista.js` — il motore grafico (WebGL): profondità, nuvole e alberi in movimento, nebbia, pioggia, neve, lampi.
- `js/canale.js` — telefono ↔ finestre su Supabase Realtime (canale privato della casa).
- `js/libreria.js` — i paesaggi nel deposito di DMaster (`dmaster-media/finestre/<cartella>/`), tutto nei nomi dei file.
- `js/ai.js` — immagini (OpenAI GPT Image, Google Nano Banana) e animazioni (Sora 2) con la propria chiave.
- `js/profondita.js` — mappa di profondità sul telefono (Depth Anything V2, transformers.js).
- `js/foto-online.js` — foto vere da Wikimedia Commons e Pexels.

Le foto da Wikimedia e Pexels restano dei loro autori, con le loro licenze (mostrate nell'app).
