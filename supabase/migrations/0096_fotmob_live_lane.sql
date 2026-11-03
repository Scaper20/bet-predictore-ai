-- 0096: the live FotMob lane, every two minutes.
--
-- Lineups, in-play events and final player stats were fetched by GitHub
-- Actions jobs, which start 5-25 minutes late and ran hourly at best. The app
-- now fetches the games that need it itself (/api/cron/fotmob-live,
-- src/lib/fotmob/live.ts), writing the same rows as the Python job, and runs
-- player props for a game the moment its lineup is confirmed or its final
-- stats land. pg_cron is precise to the minute, so we trail FotMob by about
-- two minutes.
--
-- The check below is a couple of indexed lookups; the app is only called while
-- a game in the FotMob competitions
--   * kicks off within 90 minutes and its eleven is not yet confirmed, or
--   * kicked off in the last six hours and its final player stats are not in
--     (a finished game FotMob has no player stats for is retried every 20
--     minutes, not every run).
-- No tables, no grants: a function and a schedule.

create or replace function public.invoke_fotmob_live()
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
    select 1
      from public.matches m
      left join public.match_details d on d.match_id = m.id
     where m.kickoff between now() - interval '6 hours' and now() + interval '90 minutes'
       and m.league_code in ('premier-league', 'la-liga', 'bundesliga', 'serie-a', 'ligue-1', 'champions-league', 'europa-league', 'conference-league')
       and m.source_ids ? 'fotmob'
       and m.status not in ('postponed', 'cancelled')
       and (
         (m.kickoff > now() and coalesce(d.lineup_type, '') <> 'standard')
         or (
           m.kickoff <= now()
           and not coalesce(d.finished and d.has_player_stats, false)
           and not (coalesce(d.finished, false) and d.fetched_at > now() - interval '20 minutes')
         )
       )
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'betrix_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'betrix_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_get(
    url := v_url || '/api/cron/fotmob-live',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function public.invoke_fotmob_live() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('betrix-fotmob-live', '*/2 * * * *', 'select public.invoke_fotmob_live()');
  end if;
end;
$$;
