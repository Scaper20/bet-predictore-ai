-- Shots on target for archived results (goals-v2).
--
-- The model now fits team ratings on a blend of goals and shots on target:
-- walk-forward over eight leagues, that improved 1X2 and over/under log loss
-- and the headline return on held-out seasons (src/lib/model/fit.ts,
-- shotWeight). football-data.co.uk records HST/AST for the leagues it carries;
-- other sources leave these null and the fit falls back to goals for those rows.

alter table public.historical_results
  add column if not exists home_shots_on_target smallint check (home_shots_on_target >= 0),
  add column if not exists away_shots_on_target smallint check (away_shots_on_target >= 0);

create or replace function public.upsert_historical_results(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source,
                                           home_shots_on_target, away_shots_on_target)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           (r ->> 'home_goals')::int, (r ->> 'away_goals')::int, coalesce(r ->> 'source', 'football-data-uk'),
           (r ->> 'home_shots_on_target')::smallint, (r ->> 'away_shots_on_target')::smallint
      from jsonb_array_elements(p_rows) r
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
    do update set home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
                  -- A source without shots never erases the ones another source recorded.
                  home_shots_on_target = coalesce(excluded.home_shots_on_target, historical_results.home_shots_on_target),
                  away_shots_on_target = coalesce(excluded.away_shots_on_target, historical_results.away_shots_on_target)
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_historical_results(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_historical_results(jsonb) to service_role;
