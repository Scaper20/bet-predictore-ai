-- Database load relief, found while looking into Supabase's "Disk IO Budget"
-- warning (October 2026). Both changes are additive and safe to run on the
-- live project.
--
-- 1. Head-to-head lookups were timing out.
--    dbH2H (providers/db-source.ts) asks historical_results for games where
--    home_name and away_name are among a pair of clubs' spellings, newest
--    first. Nothing indexes those columns, so each lookup read all ~150,000
--    rows and sorted them; 69 a day hit the statement timeout and were
--    thrown away. With this index the same query touches a few dozen rows.
--
-- 2. cron.job_run_details grew without limit.
--    Two jobs run every minute (live scores, push events) and pg_cron logs
--    every run to this table, which now holds 33,000+ rows and gains about
--    3,000 a day. Nothing reads it. A daily job keeps two days.

create index if not exists historical_results_names_idx
  on public.historical_results (home_name, away_name, kickoff desc);

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule(
      'betrix-prune-cron-log',
      '31 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '2 days'$job$
    );
  end if;
end;
$$;
