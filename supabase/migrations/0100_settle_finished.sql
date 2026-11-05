-- 0100: settle picks the minute a game finishes, not the next morning.
--
-- A pick settled when a visitor's live-board poll happened to run the
-- settlement pass, and otherwise at the 03:00 UTC sweep. The last week shows
-- 241 of 246 picks settled about two hours after kickoff (someone was watching)
-- and the rest at 03:00, up to 2.5 days late; a postponed game kept the kickoff
-- it was logged with and waited for the sweep as well.
--
-- pg_cron now calls /api/cron/settle-finished every minute, but only when
-- something is waiting, like betrix-push-events (0074): a pick or an engine
-- pick whose game started 95 minutes to 8 hours ago and is not settled, a
-- pick whose final score is already stored but not graded (a game played on a
-- new date), or a game that finished in the last ten minutes. A quiet night
-- makes no call at all.
--
-- No tables, no grants: a function and a schedule. Apply after the route is deployed.

create or replace function public.invoke_settle_finished()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not (
    exists (
      select 1 from public.predictions_log pl
       where pl.settled_at is null
         and pl.kickoff < now() - interval '95 minutes'
         and (
           pl.kickoff > now() - interval '8 hours'
           or exists (
             select 1 from public.match_results mr
              where mr.match_id = pl.match_id and mr.status = 'finished' and mr.home_goals is not null and mr.away_goals is not null
           )
         )
    )
    or exists (
      select 1 from public.engine_picks e
       where e.settled_at is null
         and e.kickoff < now() - interval '95 minutes'
         and e.kickoff > now() - interval '8 hours'
    )
    or exists (
      select 1 from public.matches m
       where m.status = 'finished' and m.updated_at > now() - interval '10 minutes'
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
    url := v_url || '/api/cron/settle-finished',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_settle_finished() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('betrix-settle-finished', '* * * * *', 'select public.invoke_settle_finished()');
  end if;
end;
$$;
