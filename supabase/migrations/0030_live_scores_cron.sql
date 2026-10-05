-- BetriX — live scores on a schedule, only while games are on.
--
-- pg_cron ticks every minute; invoke_live_scores() asks the database whether
-- anything is in play or due to kick off, and only then calls the
-- live-scores Edge Function (supabase/functions/live-scores). Most minutes
-- of most days cost one cheap query and no invocation.
--
-- It also calls the site's odds snapshot route once an hour
-- (/api/cron/odds-snapshot), which costs no GitHub Actions minutes this way.
--
-- Before either does anything, store four Vault secrets (SQL editor):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'betrix_functions_url');
--   select vault.create_secret('<same value as the INGEST_SECRET function secret>', 'betrix_ingest_secret');
--   select vault.create_secret('https://betrix.com.ng', 'betrix_site_url');
--   select vault.create_secret('<same value as CRON_SECRET on Vercel>', 'betrix_cron_secret');
--   select vault.create_secret('<TheSportsDB paid key>', 'thesportsdb_api_key');
-- Until they exist the functions return without calling anything.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

create or replace function public.invoke_live_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.matches
     where status in ('live', 'halftime')
        or (status = 'scheduled' and kickoff between now() - interval '150 minutes' and now() + interval '5 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'betrix_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'betrix_ingest_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/live-scores',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke all on function public.invoke_live_scores() from public, anon, authenticated;

-- The live-scores function's own secrets, read from Vault so they can be
-- managed in SQL alongside the ones above. (Function secrets set with
-- `supabase secrets set` still win when present.) Service role only.
create or replace function public.ingest_secret_ok(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return p_secret is not null and exists (
    select 1 from vault.decrypted_secrets where name = 'betrix_ingest_secret' and decrypted_secret = p_secret
  );
end;
$$;

create or replace function public.thesportsdb_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'thesportsdb_api_key';
  return v;
end;
$$;

revoke all on function public.ingest_secret_ok(text) from public, anon, authenticated;
revoke all on function public.thesportsdb_key() from public, anon, authenticated;
grant execute on function public.ingest_secret_ok(text) to service_role;
grant execute on function public.thesportsdb_key() to service_role;

create or replace function public.invoke_odds_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'betrix_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'betrix_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_get(
    url := v_url || '/api/cron/odds-snapshot',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.invoke_odds_snapshot() from public, anon, authenticated;

-- Scheduled only where pg_cron exists (it does on Supabase; local test
-- databases may not have it).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Scheduling by name updates an existing job of that name.
    perform cron.schedule('betrix-live-scores', '* * * * *', 'select public.invoke_live_scores()');
    perform cron.schedule('betrix-odds-snapshot', '7 * * * *', 'select public.invoke_odds_snapshot()');
    perform cron.schedule('betrix-prune-raw', '17 3 * * *', 'select public.prune_raw_payloads()');
  end if;
end;
$$;
