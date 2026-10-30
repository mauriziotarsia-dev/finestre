# Finestre

Finestre virtuali per la stanza medievale: schermi in cantina dietro i trafori, comandati dal telefono.

- `telecomando/` — l'app sul telefono (Finestre · Paesaggi · Crea · Impostazioni), nello stile di DMaster Stage.
- `finestra/` — la pagina che il Raspberry mostra a schermo intero (`?casa=CODICE`).
- `js/vista.js` — il motore grafico (WebGL): profondità, nuvole e alberi in movimento, nebbia, pioggia, neve, lampi.
- `js/canale.js` — telefono ↔ finestre su Supabase Realtime (canale privato della casa).
- `js/libreria.js` — i paesaggi nel deposito di DMaster (`dmaster-media/finestre/<cartella>/`), tutto nei nomi dei file.
- `js/ai.js` — immagini (OpenAI GPT Image, Google Nano Banana) e animazioni (Gemini Omni) con la propria chiave.
- `pi/sensore.py` — il radar della prospettiva viva (porta 8788), `esp32/radar-udp/` la schedina accanto al radar.
- `pi/cuci-animazione.py` — ripulisce le animazioni dell'AI: case e campi fermi, cielo senza uccelli spuntati dal nulla, giro invisibile, 30 immagini al secondo. Sul Raspberry: `python3 pi/cuci-animazione.py --casa CODICE` le cuce da sole appena create (serve `sudo apt install python3-opencv ffmpeg`).
  Sul mini PC e sul laptop ingrandisce anche foto, cieli e fermi con l'AI (Real-ESRGAN sulla scheda video): 2560 di altezza per le finestrelle, 4608 di larghezza per il TV 4K. Windows: `winget install Python.Python.3.12 Gyan.FFmpeg`, poi `py -3.12 -m pip install opencv-python numpy realesrgan-ncnn-py`, poi `py -3.12 pi\cuci-animazione.py --casa CODICE --forza 3` (laptop: `--forza 2`).
- `js/fermo.js` — appena fatta un'animazione, sul telefono: il paesaggio fermo e la maschera di ciò che si muove davvero, così le finestre non tremano mai (poi il Raspberry cuce il video a piena qualità).
- `js/profondita.js` — mappa di profondità sul telefono (Depth Anything V2, transformers.js).
- `js/foto-online.js` — foto vere da Wikimedia Commons e Pexels.

Le foto da Wikimedia e Pexels restano dei loro autori, con le loro licenze (mostrate nell'app).

## Il TV (vista verso est)
Lo stesso indirizzo delle finestre con `&vista=est`: `https://mauriziotarsia-dev.github.io/finestre/finestra/?casa=CODICE&vista=est`.
Tutto lo schermo è la finestra; mostra la vista «est-…» del paesaggio (creata dal telefono: Crea → «Verso est · il TV», o dal dettaglio di un paesaggio → «Crea la vista TV"). Stessa ora, stesso tempo e stesso cielo delle finestrelle.
Sul G10 tutto si prepara con `pi/installa-g10.ps1` (istruzioni in testa al file): TV in Edge a tutto schermo, radar, rifinitura e ingrandimento AI all'accesso. Per la prospettiva viva anche sul TV, sul mini PC gira `pi/sensore.py` (riceve il radar dal Wi-Fi come il Raspberry); `&tvx=…&tvy=…` = posizione del centro del TV rispetto al radar, in mm (x verso destra guardando le finestrelle, y verso la stanza).

## Account e casa privata (30/10)
- Telefono: Impostazioni → Account e casa → email → codice di 6 cifre (una volta sola) → «Collega questa casa al mio account» (copia le immagini nel deposito privato `atmosfera/<casa>/`).
- Schermi (finestre, TV): dal telefono «Mostra i codici sugli schermi», poi scrivi ogni codice in «Abbina». Una pagina aperta senza `?casa=` mostra il codice da sola.
- Computer che rifinisce i video: `python3 pi/cuci-animazione.py --abbina` (una volta; poi basta lanciarlo senza `--casa`). Sul G10: `installa-g10.ps1 -Abbina`.
- Finché ci sono schermi col vecchio link, il telefono parla su tutti e due i canali. Regole e funzioni: `supabase/2026-10-30-atmosfera-case-private.sql`; codice: `js/accesso.js`.

