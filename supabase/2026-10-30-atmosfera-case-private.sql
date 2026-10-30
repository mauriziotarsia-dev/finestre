-- DMaster Atmosphere: case con proprietario e membri, abbinamento degli schermi con un codice,
-- deposito privato «atmosfera/<casa>/…» e canale Realtime privato «atm:<casa>».
-- (30/10/2026, Maurizio: «Rendiamo scalabile l'approccio per quando metteremo in commercio l'app» → account subito)
-- Solo aggiunte: nessuna tabella, regola o dato esistente di DMaster Stage viene toccato.

create schema if not exists atm_privato;
grant usage on schema atm_privato to authenticated;

create table public.atm_case (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Casa',
  proprietario uuid not null references auth.users(id) on delete cascade,
  chiave_vecchia uuid unique,                 -- la chiave del vecchio link (passaggio dal sistema aperto)
  creata timestamptz not null default now()
);
create index atm_case_proprietario_idx on public.atm_case (proprietario);

create table public.atm_membri (
  casa uuid not null references public.atm_case(id) on delete cascade,
  utente uuid not null references auth.users(id) on delete cascade,
  ruolo text not null check (ruolo in ('proprietario', 'comando', 'schermo', 'lavoratore')),
  nome text not null default '',
  aggiunto timestamptz not null default now(),
  primary key (casa, utente)
);
create index atm_membri_utente_idx on public.atm_membri (utente);

create table public.atm_abbinamenti (
  codice text primary key,
  utente uuid not null references auth.users(id) on delete cascade,
  ruolo text not null check (ruolo in ('comando', 'schermo', 'lavoratore')),
  nome text not null default '',
  scade timestamptz not null default now() + interval '10 minutes'
);
create index atm_abbinamenti_utente_idx on public.atm_abbinamenti (utente);

alter table public.atm_case enable row level security;
alter table public.atm_membri enable row level security;
alter table public.atm_abbinamenti enable row level security;

-- ── controlli (fuori dalle API) ──────────────────────────────────────────────
create or replace function atm_privato.uuid_sicuro(t text) returns uuid
language sql immutable set search_path = '' as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end
$$;

create or replace function atm_privato.membro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atm_membri m where m.casa = c and m.utente = (select auth.uid()))
$$;

create or replace function atm_privato.scrive(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atm_membri m where m.casa = c and m.utente = (select auth.uid())
                 and m.ruolo in ('proprietario', 'comando', 'lavoratore'))
$$;

create or replace function atm_privato.proprietario(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atm_case k where k.id = c and k.proprietario = (select auth.uid()))
$$;

revoke all on all functions in schema atm_privato from public, anon;
grant execute on all functions in schema atm_privato to authenticated;

-- ── regole sulle tabelle ─────────────────────────────────────────────────────
create policy atm_case_leggi on public.atm_case for select to authenticated
  using ((select atm_privato.membro(id)));
create policy atm_case_modifica on public.atm_case for update to authenticated
  using (proprietario = (select auth.uid())) with check (proprietario = (select auth.uid()));
create policy atm_case_togli on public.atm_case for delete to authenticated
  using (proprietario = (select auth.uid()));

create policy atm_membri_leggi on public.atm_membri for select to authenticated
  using (utente = (select auth.uid()) or (select atm_privato.membro(casa)));
create policy atm_membri_togli on public.atm_membri for delete to authenticated
  using (utente = (select auth.uid()) or (select atm_privato.proprietario(casa)));
-- atm_abbinamenti: nessuna regola, solo dalle funzioni qui sotto

-- ── funzioni per l'app ───────────────────────────────────────────────────────
-- una casa nuova (serve un account vero, non anonimo)
create or replace function public.atm_nuova_casa(nome text default 'Casa') returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c uuid;
begin
  if u is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'serve un account'; end if;
  insert into public.atm_case (nome, proprietario) values (coalesce(nullif(trim(nome), ''), 'Casa'), u) returning id into c;
  insert into public.atm_membri (casa, utente, ruolo, nome) values (c, u, 'proprietario', '');
  return c;
end $$;

-- la casa del vecchio link diventa tua (una volta sola)
create or replace function public.atm_reclama(chiave uuid, nome text default 'Casa') returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c uuid; p uuid;
begin
  if u is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'serve un account'; end if;
  select id, proprietario into c, p from public.atm_case where chiave_vecchia = chiave;
  if c is not null then
    if p <> u then raise exception 'questa casa ha già un proprietario'; end if;
    return c;
  end if;
  insert into public.atm_case (nome, proprietario, chiave_vecchia) values (coalesce(nullif(trim(nome), ''), 'Casa'), u, chiave) returning id into c;
  insert into public.atm_membri (casa, utente, ruolo, nome) values (c, u, 'proprietario', '');
  return c;
end $$;

-- uno schermo (o DMaster, o un lavoratore di casa) chiede un codice da mostrare
create or replace function public.atm_chiedi_codice(ruolo text default 'schermo', nome text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); k text; giri int := 0;
begin
  if u is null then raise exception 'serve un accesso'; end if;
  if ruolo not in ('comando', 'schermo', 'lavoratore') then raise exception 'ruolo non valido'; end if;
  delete from public.atm_abbinamenti where scade < now() or utente = u;
  loop
    k := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.atm_abbinamenti a where a.codice = k);
    giri := giri + 1; if giri > 20 then raise exception 'riprova'; end if;
  end loop;
  insert into public.atm_abbinamenti (codice, utente, ruolo, nome) values (k, u, ruolo, left(coalesce(nome, ''), 60));
  return k;
end $$;

-- il proprietario approva il codice: quell'apparecchio entra nella casa
create or replace function public.atm_abbina(codice text, casa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.atm_abbinamenti;
begin
  if not atm_privato.proprietario(casa) then raise exception 'solo il proprietario della casa può abbinare'; end if;
  select * into a from public.atm_abbinamenti x where x.codice = trim(atm_abbina.codice) and x.scade > now();
  if a.codice is null then raise exception 'codice sbagliato o scaduto'; end if;
  insert into public.atm_membri (casa, utente, ruolo, nome) values (casa, a.utente, a.ruolo, a.nome)
    on conflict (casa, utente) do update set ruolo = excluded.ruolo, nome = excluded.nome;
  delete from public.atm_abbinamenti x where x.codice = a.codice;
  return jsonb_build_object('ruolo', a.ruolo, 'nome', a.nome);
end $$;

revoke all on function public.atm_nuova_casa(text), public.atm_reclama(uuid, text), public.atm_chiedi_codice(text, text), public.atm_abbina(text, uuid) from public, anon;
grant execute on function public.atm_nuova_casa(text), public.atm_reclama(uuid, text), public.atm_chiedi_codice(text, text), public.atm_abbina(text, uuid) to authenticated;

-- ── deposito privato ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atmosfera', 'atmosfera', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;

create policy atmosfera_leggi on storage.objects for select to authenticated
  using (bucket_id = 'atmosfera' and (select atm_privato.membro(atm_privato.uuid_sicuro((storage.foldername(name))[1]))));
create policy atmosfera_scrivi on storage.objects for insert to authenticated
  with check (bucket_id = 'atmosfera' and (select atm_privato.scrive(atm_privato.uuid_sicuro((storage.foldername(name))[1]))));
create policy atmosfera_cambia on storage.objects for update to authenticated
  using (bucket_id = 'atmosfera' and (select atm_privato.scrive(atm_privato.uuid_sicuro((storage.foldername(name))[1]))))
  with check (bucket_id = 'atmosfera' and (select atm_privato.scrive(atm_privato.uuid_sicuro((storage.foldername(name))[1]))));
create policy atmosfera_togli on storage.objects for delete to authenticated
  using (bucket_id = 'atmosfera' and (select atm_privato.scrive(atm_privato.uuid_sicuro((storage.foldername(name))[1]))));

-- ── canale privato «atm:<casa>» ─────────────────────────────────────────────
create policy atm_canale_ascolta on realtime.messages for select to authenticated
  using (realtime.topic() like 'atm:%' and (select atm_privato.membro(atm_privato.uuid_sicuro(substr(realtime.topic(), 5)))));
create policy atm_canale_parla on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'atm:%' and (select atm_privato.membro(atm_privato.uuid_sicuro(substr(realtime.topic(), 5)))));
