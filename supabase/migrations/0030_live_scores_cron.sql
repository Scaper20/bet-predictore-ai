-- BetriX — live scores on a schedule, only while games are on.
--
-- pg_cron ticks every minute; invoke_live_scores() asks the database whether
-- anything is in play or due to kick off, and only then calls the
-- live-scores Edge Function (supabase/functions/live-scores). Most minutes
-- of most days cost one cheap query and no invocation.
--
-- Before this does anything, store two Vault secrets (SQL editor):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'betrix_functions_url');
--   select vault.create_secret('<same value as the INGEST_SECRET function secret>', 'betrix_ingest_secret');
-- Until both exist the function returns without calling anything.

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

-- Scheduled only where pg_cron exists (it does on Supabase; local test
-- databases may not have it).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname in ('betrix-live-scores', 'betrix-prune-raw');
    perform cron.schedule('betrix-live-scores', '* * * * *', 'select public.invoke_live_scores()');
    perform cron.schedule('betrix-prune-raw', '17 3 * * *', 'select public.prune_raw_payloads()');
  end if;
end;
$$;
