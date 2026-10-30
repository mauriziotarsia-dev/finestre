/* Canale tra telecomando e finestre: Supabase Realtime Broadcast.
   Nessuna tabella: i messaggi passano su un canale il cui nome contiene la chiave della casa,
   un codice casuale che conoscono solo il telecomando e il Raspberry. */
const SUPABASE_URL = 'https://olcfvghjfzyazogfsjbk.supabase.co';
const SUPABASE_CHIAVE_PUBBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc';

/* apriCanale(casa, {suMessaggio(evento, dati), suStato(collegato)}) -> {manda(evento, dati)} */
function apriCanale(casa, {suMessaggio, suStato}){
  if (!window.supabase){ console.warn('supabase-js non caricato'); return {manda(){ return false; }, pronto:false}; }
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA, {realtime:{params:{eventsPerSecond:20}}});
  const ch = sb.channel('finestre-' + casa, {config:{broadcast:{self:false, ack:false}}});
  let pronto = false;
  ch.on('broadcast', {event:'*'}, m => suMessaggio && suMessaggio(m.event, m.payload || {}));
  ch.subscribe(s => {
    pronto = s === 'SUBSCRIBED';
    suStato && suStato(pronto, s);
  });
  return {
    manda(evento, dati = {}){ if (pronto) ch.send({type:'broadcast', event:evento, payload:dati}); return pronto; },
    get pronto(){ return pronto; },
    chiudi(){ pronto = false; try { sb.removeChannel(ch); } catch(e) {} }
  };
}

/* ora del giorno vera, con alba e tramonto approssimati per Roma lungo l'anno */
function oraVera(d = new Date()){
  const inizio = new Date(d.getFullYear(), 0, 1), g = (d - inizio) / 864e5;
  const legale = d.getTimezoneOffset() < new Date(d.getFullYear(), 0, 1).getTimezoneOffset() ? 1 : 0;
  const mezzogiorno = 12.2 + legale, meta = 6.08 + 1.52 * Math.cos(2 * Math.PI * (g - 172) / 365);
  const alba = mezzogiorno - meta, tramonto = mezzogiorno + meta, h = d.getHours() + d.getMinutes() / 60;
  if (h >= alba - .6 && h < alba + .9) return 'alba';
  if (h >= alba + .9 && h < tramonto - 1) return 'giorno';
  if (h >= tramonto - 1 && h < tramonto + .7) return 'tramonto';
  return 'notte';
}
