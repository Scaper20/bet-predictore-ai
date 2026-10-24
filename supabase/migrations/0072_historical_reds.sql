-- Red cards on their own, for SportyBet's bookings markets (src/lib/odds/markets.ts).
--
-- home_cards / away_cards keep yellow + red, one each (0049). SportyBet counts
-- bookings as yellow = 1, red = 2, so a booking count is cards + reds; the
-- archive needs the reds apart to model it (stat-markets-service.ts). Same
-- source columns (football-data.co.uk HR / AR); filled for past seasons by
-- /api/cron/refresh-archive?seasons=… and kept current by the nightly run.
--
-- No new table: historical_results keeps its grants from 0029 / 0063.

alter table public.historical_results add column if not exists home_reds smallint;
alter table public.historical_results add column if not exists away_reds smallint;

create or replace function public.upsert_historical_results(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source,
                                           home_shots_on_target, away_shots_on_target,
                                           home_corners, away_corners, home_cards, away_cards, home_shots, away_shots, referee,
                                           home_reds, away_reds)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           (r ->> 'home_goals')::int, (r ->> 'away_goals')::int, coalesce(r ->> 'source', 'football-data-uk'),
           (r ->> 'home_shots_on_target')::smallint, (r ->> 'away_shots_on_target')::smallint,
           (r ->> 'home_corners')::smallint, (r ->> 'away_corners')::smallint,
           (r ->> 'home_cards')::smallint, (r ->> 'away_cards')::smallint,
           (r ->> 'home_shots')::smallint, (r ->> 'away_shots')::smallint,
           nullif(r ->> 'referee', ''),
           (r ->> 'home_reds')::smallint, (r ->> 'away_reds')::smallint
      from jsonb_array_elements(p_rows) r
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
    do update set home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
                  -- A source without a statistic never erases one another source recorded.
                  home_shots_on_target = coalesce(excluded.home_shots_on_target, historical_results.home_shots_on_target),
                  away_shots_on_target = coalesce(excluded.away_shots_on_target, historical_results.away_shots_on_target),
                  home_corners = coalesce(excluded.home_corners, historical_results.home_corners),
                  away_corners = coalesce(excluded.away_corners, historical_results.away_corners),
                  home_cards = coalesce(excluded.home_cards, historical_results.home_cards),
                  away_cards = coalesce(excluded.away_cards, historical_results.away_cards),
                  home_shots = coalesce(excluded.home_shots, historical_results.home_shots),
                  away_shots = coalesce(excluded.away_shots, historical_results.away_shots),
                  referee = coalesce(excluded.referee, historical_results.referee),
                  home_reds = coalesce(excluded.home_reds, historical_results.home_reds),
                  away_reds = coalesce(excluded.away_reds, historical_results.away_reds)
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_historical_results(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_historical_results(jsonb) to service_role;
