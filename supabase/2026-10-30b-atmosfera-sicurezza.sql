-- DMaster Atmosphere · sicurezza e semplicità (30/10/2026 sera, Maurizio: «Rendiamo semplice, intuitivo, sicuro tutto questo sistema»)
--   · vecchio link chiudibile: atm_case.vecchio_chiuso (lo legge ogni membro; lo cambia solo il proprietario)
--   · abbinamento con limite di tentativi: al massimo 8 codici sbagliati in 15 minuti per account;
--     il codice usato non si cancella, scade subito (così resta traccia)
--   · membri con un nome che il proprietario può cambiare
-- Solo aggiunte e sostituzioni di funzioni Atmosphere: niente di DMaster Stage viene toccato.

alter table public.atm_case add column if not exists vecchio_chiuso boolean not null default false;

create table if not exists public.atm_tentativi (
  utente uuid not null references auth.users(id) on delete cascade,
  quando timestamptz not null default now()
);
create index if not exists atm_tentativi_idx on public.atm_tentativi (utente, quando);
alter table public.atm_tentativi enable row level security;   -- nessuna regola: solo dalle funzioni

-- abbina: niente eccezioni per il codice sbagliato (annullerebbero anche il tentativo registrato): risponde {errore}
create or replace function public.atm_abbina(codice text, casa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.atm_abbinamenti; u uuid := auth.uid(); n int;
begin
  if not atm_privato.proprietario(casa) then return jsonb_build_object('errore', 'solo il proprietario della stanza può aggiungere schermi'); end if;
  select count(*) into n from public.atm_tentativi t where t.utente = u and t.quando > now() - interval '15 minutes';
  if n >= 8 then return jsonb_build_object('errore', 'troppi codici sbagliati: riprova fra un quarto d''ora'); end if;
  select * into a from public.atm_abbinamenti x where x.codice = regexp_replace(atm_abbina.codice, '\D', '', 'g') and x.scade > now();
  if a.codice is null then
    insert into public.atm_tentativi (utente) values (u);
    return jsonb_build_object('errore', 'codice sbagliato o scaduto');
  end if;
  insert into public.atm_membri (casa, utente, ruolo, nome) values (casa, a.utente, a.ruolo, a.nome)
    on conflict (casa, utente) do update set ruolo = excluded.ruolo, nome = excluded.nome;
  update public.atm_abbinamenti x set scade = now() where x.codice = a.codice;
  return jsonb_build_object('ruolo', a.ruolo, 'nome', a.nome);
end $$;

-- prima di aggiungere: che schermo è? (per chiedere «Aggiungere “TV” alla stanza?»). Conta come tentativo se sbagliato
create or replace function public.atm_vedi_codice(codice text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.atm_abbinamenti; u uuid := auth.uid(); n int;
begin
  if u is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then return jsonb_build_object('errore', 'serve un account'); end if;
  select count(*) into n from public.atm_tentativi t where t.utente = u and t.quando > now() - interval '15 minutes';
  if n >= 8 then return jsonb_build_object('errore', 'troppi codici sbagliati: riprova fra un quarto d''ora'); end if;
  select * into a from public.atm_abbinamenti x where x.codice = regexp_replace(atm_vedi_codice.codice, '\D', '', 'g') and x.scade > now();
  if a.codice is null then
    insert into public.atm_tentativi (utente) values (u);
    return jsonb_build_object('errore', 'codice sbagliato o scaduto');
  end if;
  return jsonb_build_object('ruolo', a.ruolo, 'nome', a.nome);
end $$;

-- il nome di un membro (es. «Finestra sinistra», «TV del salone»): lo cambia il proprietario
create or replace function public.atm_rinomina_membro(casa uuid, utente uuid, nome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not atm_privato.proprietario(casa) then raise exception 'solo il proprietario della stanza'; end if;
  update public.atm_membri m set nome = left(trim(atm_rinomina_membro.nome), 60) where m.casa = atm_rinomina_membro.casa and m.utente = atm_rinomina_membro.utente;
end $$;

revoke all on function public.atm_abbina(text, uuid), public.atm_vedi_codice(text), public.atm_rinomina_membro(uuid, uuid, text) from public, anon;
grant execute on function public.atm_abbina(text, uuid), public.atm_vedi_codice(text), public.atm_rinomina_membro(uuid, uuid, text) to authenticated;
