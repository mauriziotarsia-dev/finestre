-- DMaster · entrare nell'account dal telefono col QR, senza email (31/10/2026, Maurizio: «Fallo ora»)
--   · DMaster (già entrato con l'email) chiede un QR: dentro c'è un gettone casuale di 64 caratteri
--   · qui si salva solo la sua impronta (sha256), per 3 minuti, una volta sola
--   · il telefono manda il gettone alla funzione «accedi-col-qr» (Edge Function, chiave di servizio):
--     lei lo consuma (atm_consuma_accesso) e restituisce un accesso usa-e-getta per quell'account
--   · al massimo 10 QR ogni 10 minuti per account
-- Solo aggiunte: niente di DMaster Stage viene toccato.

create table if not exists public.atm_accessi (
  impronta text primary key,
  utente uuid not null references auth.users(id) on delete cascade,
  creato timestamptz not null default now(),
  scade timestamptz not null,
  usato timestamptz,
  per text not null default 'atmosfera'
);
create index if not exists atm_accessi_utente_idx on public.atm_accessi (utente, creato);
alter table public.atm_accessi enable row level security;   -- nessuna regola: solo dalle funzioni
revoke all on table public.atm_accessi from anon, authenticated;

-- DMaster: un QR nuovo per entrare nello STESSO account da un altro apparecchio
create or replace function public.atm_crea_accesso(per text default 'atmosfera') returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t text; n int;
begin
  if u is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) or coalesce(auth.jwt() ->> 'email', '') = '' then
    raise exception 'serve un account entrato con l''email';
  end if;
  select count(*) into n from public.atm_accessi a where a.utente = u and a.creato > now() - interval '10 minutes';
  if n >= 10 then raise exception 'troppi QR: riprova fra qualche minuto'; end if;
  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.atm_accessi (impronta, utente, scade, per)
    values (encode(extensions.digest(t, 'sha256'), 'hex'), u, now() + interval '3 minutes',
            case when atm_crea_accesso.per in ('atmosfera', 'dmaster') then atm_crea_accesso.per else 'atmosfera' end);
  return t;
end $$;

-- DMaster guarda se il QR è stato usato (solo i propri)
create or replace function public.atm_stato_accesso(token text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when a.usato is not null then 'usato' when a.scade <= now() then 'scaduto' else 'attesa' end
      from public.atm_accessi a
     where a.impronta = encode(extensions.digest(atm_stato_accesso.token, 'sha256'), 'hex') and a.utente = auth.uid()
  ), 'scaduto')
$$;

-- la Edge Function (chiave di servizio) consuma il gettone: una volta, entro la scadenza
create or replace function public.atm_consuma_accesso(token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; e text; nome text;
begin
  if atm_consuma_accesso.token !~ '^[0-9a-f]{64}$' then return null; end if;
  update public.atm_accessi a set usato = now()
   where a.impronta = encode(extensions.digest(atm_consuma_accesso.token, 'sha256'), 'hex') and a.usato is null and a.scade > now()
  returning a.utente into u;
  if u is null then return null; end if;
  select x.email, x.raw_user_meta_data ->> 'nome' into e, nome from auth.users x where x.id = u;
  return jsonb_build_object('email', e, 'nome', coalesce(nome, ''));
end $$;

revoke all on function public.atm_crea_accesso(text), public.atm_stato_accesso(text), public.atm_consuma_accesso(text) from public, anon, authenticated;
grant execute on function public.atm_crea_accesso(text), public.atm_stato_accesso(text) to authenticated;
grant execute on function public.atm_consuma_accesso(text) to service_role;
