-- 0102: the goals each finished game's closing prices implied.
--
-- The rating fit can lean part-way on these instead of only on the final score
-- (model/params.ts, goals-v3; model/market-goals.ts; docs/model-audit-teams-2026-11.md
-- section L). They are solved from the market-average closing 1X2 and over/under
-- 2.5 prices. The past is backfilled through
-- /api/cron/refresh-archive (?seasons=... for the division files,
-- ?only=market&marketDays=400&marketSkip=... for the rest).
--
-- Two routes fill them: the nightly archive top-up solves them from the closing
-- prices on the same football-data.co.uk row that carries the score
-- (upsert_historical_results below), and set_market_goals, used by
-- archive/market-goals.ts, solves them from odds_snapshots for the leagues
-- whose files carry no over/under price.
--
-- Null where the game has no closing prices: the fit uses the score alone for
-- those rows, exactly as before. Nothing reads these columns until a fixture
-- kicks off on or after MARKET_MODEL_FROM and its league has the coverage.

alter table public.historical_results
  add column if not exists home_mkt_goals real check (home_mkt_goals > 0 and home_mkt_goals < 10),
  add column if not exists away_mkt_goals real check (away_mkt_goals > 0 and away_mkt_goals < 10);

-- Writes the solved goals onto the matching archive rows; returns how many it touched.
-- Rows are {league_code, day (UTC date), home_name, away_name, home, away}.
create or replace function public.set_market_goals(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.historical_results h
       set home_mkt_goals = (r ->> 'home')::real,
           away_mkt_goals = (r ->> 'away')::real
      from jsonb_array_elements(p_rows) r
     where h.league_code = r ->> 'league_code'
       and (h.kickoff at time zone 'UTC')::date = (r ->> 'day')::date
       and h.home_name = r ->> 'home_name'
       and h.away_name = r ->> 'away_name'
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.set_market_goals(jsonb) from public, anon, authenticated;
grant execute on function public.set_market_goals(jsonb) to service_role;

-- upsert_historical_results as 0076 left it, plus the two columns. A row without
-- them never erases ones another route stored, and an unchanged row is still
-- not rewritten.
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
                                           home_reds, away_reds, home_mkt_goals, away_mkt_goals)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           (r ->> 'home_goals')::int, (r ->> 'away_goals')::int, coalesce(r ->> 'source', 'football-data-uk'),
           (r ->> 'home_shots_on_target')::smallint, (r ->> 'away_shots_on_target')::smallint,
           (r ->> 'home_corners')::smallint, (r ->> 'away_corners')::smallint,
           (r ->> 'home_cards')::smallint, (r ->> 'away_cards')::smallint,
           (r ->> 'home_shots')::smallint, (r ->> 'away_shots')::smallint,
           nullif(r ->> 'referee', ''),
           (r ->> 'home_reds')::smallint, (r ->> 'away_reds')::smallint,
           (r ->> 'home_mkt_goals')::real, (r ->> 'away_mkt_goals')::real
      from jsonb_array_elements(p_rows) r
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
    do update set home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
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
                  away_reds = coalesce(excluded.away_reds, historical_results.away_reds),
                  home_mkt_goals = coalesce(excluded.home_mkt_goals, historical_results.home_mkt_goals),
                  away_mkt_goals = coalesce(excluded.away_mkt_goals, historical_results.away_mkt_goals)
      where (historical_results.home_goals, historical_results.away_goals,
             historical_results.home_shots_on_target, historical_results.away_shots_on_target,
             historical_results.home_corners, historical_results.away_corners,
             historical_results.home_cards, historical_results.away_cards,
             historical_results.home_shots, historical_results.away_shots,
             historical_results.referee, historical_results.home_reds, historical_results.away_reds,
             historical_results.home_mkt_goals, historical_results.away_mkt_goals)
        is distinct from
            (excluded.home_goals, excluded.away_goals,
             coalesce(excluded.home_shots_on_target, historical_results.home_shots_on_target),
             coalesce(excluded.away_shots_on_target, historical_results.away_shots_on_target),
             coalesce(excluded.home_corners, historical_results.home_corners),
             coalesce(excluded.away_corners, historical_results.away_corners),
             coalesce(excluded.home_cards, historical_results.home_cards),
             coalesce(excluded.away_cards, historical_results.away_cards),
             coalesce(excluded.home_shots, historical_results.home_shots),
             coalesce(excluded.away_shots, historical_results.away_shots),
             coalesce(excluded.referee, historical_results.referee),
             coalesce(excluded.home_reds, historical_results.home_reds),
             coalesce(excluded.away_reds, historical_results.away_reds),
             coalesce(excluded.home_mkt_goals, historical_results.home_mkt_goals),
             coalesce(excluded.away_mkt_goals, historical_results.away_mkt_goals))
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_historical_results(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_historical_results(jsonb) to service_role;
