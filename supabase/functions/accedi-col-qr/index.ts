// accedi-col-qr — un apparecchio entra nell'account di DMaster senza email (31/10/2026): col QR di DMaster
// (gettone di 64 caratteri) o col codice di 8 caratteri che mostra l'app del telefono.
// Riceve il gettone del QR (64 caratteri), lo consuma (una volta, entro 3 minuti: atm_consuma_accesso)
// e restituisce un accesso usa-e-getta (token_hash) per quell'account; il telefono lo scambia con
// supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }). Nessuna email parte.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINI = [/^https:\/\/mauriziotarsia-dev\.github\.io$/, /^https:\/\/([a-z0-9-]+\.)?dmaster-stage\.pages\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

function intestazioni(origine: string | null) {
  const ok = origine && ORIGINI.some(r => r.test(origine));
  return {
    'Access-Control-Allow-Origin': ok ? origine! : 'https://mauriziotarsia-dev.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

Deno.serve(async (req: Request) => {
  const h = intestazioni(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response(JSON.stringify({ errore: 'metodo' }), { status: 405, headers: h });
  let token = '', codice = false;
  try {
    const b = await req.json();
    token = String(b.token || '');
    /* il codice che mostra l'app del telefono (31/10): 8 caratteri, maiuscole o minuscole, con o senza trattino */
    if (!token && b.codice) { token = String(b.codice).toUpperCase().replace(/[^0-9A-Z]/g, ''); codice = true; }
  } catch { /* niente */ }
  const valido = codice ? /^[2-9A-HJKMNP-Z]{8}$/.test(token) : /^[0-9a-f]{64}$/.test(token);
  if (!valido) return new Response(JSON.stringify({ errore: codice ? 'il codice ha 8 caratteri (lettere e cifre)' : 'QR non valido' }), { status: 400, headers: h });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '?').split(',')[0].trim();
  const { data: bloccato } = await admin.rpc('atm_ip_bloccato', { ip });
  if (bloccato) return new Response(JSON.stringify({ errore: 'troppi tentativi sbagliati: riprova fra un quarto d\'ora' }), { status: 429, headers: h });
  const { data: chi, error } = await admin.rpc('atm_consuma_accesso', { token });
  if (error) return new Response(JSON.stringify({ errore: 'non riesco a controllare ' + (codice ? 'il codice' : 'il QR') }), { status: 500, headers: h });
  if (!chi || !chi.email) {
    await admin.rpc('atm_ip_sbaglio', { ip });
    return new Response(JSON.stringify({ errore: codice ? 'codice sbagliato o scaduto: chiedine uno nuovo nell\'app' : 'QR scaduto o già usato: chiedine uno nuovo in DMaster' }), { status: 410, headers: h });
  }

  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: 'magiclink', email: chi.email });
  const hash = link?.properties?.hashed_token;
  if (e2 || !hash) return new Response(JSON.stringify({ errore: 'non riesco a preparare l\'accesso' }), { status: 500, headers: h });
  return new Response(JSON.stringify({ token_hash: hash, email: chi.email, nome: chi.nome || '' }), { headers: h });
});
