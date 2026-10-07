-- Corners, cards, shots and referees, for the count-market model
-- (src/lib/model/match-stats.ts, docs/stats-markets.md).
--
-- football-data.co.uk records these for the leagues it carries per division
-- (HC/AC, HY+HR/AY+AR, HS/AS, Referee in the English files). Other sources
-- leave them null. Cards are yellows plus reds, one each.
--
-- match_referees holds referees named for UPCOMING fixtures (football-data's
-- fixtures.csv, about a week ahead, English divisions), shown on the match
-- page and fed to the cards model.

alter table public.historical_results
  add column if not exists home_corners smallint check (home_corners >= 0),
  add column if not exists away_corners smallint check (away_corners >= 0),
  add column if not exists home_cards smallint check (home_cards >= 0),
  add column if not exists away_cards smallint check (away_cards >= 0),
  add column if not exists home_shots smallint check (home_shots >= 0),
  add column if not exists away_shots smallint check (away_shots >= 0),
  add column if not exists referee text check (char_length(referee) <= 60);

create or replace function public.upsert_historical_results(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source,
                                           home_shots_on_target, away_shots_on_target,
                                           home_corners, away_corners, home_cards, away_cards, home_shots, away_shots, referee)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           (r ->> 'home_goals')::int, (r ->> 'away_goals')::int, coalesce(r ->> 'source', 'football-data-uk'),
           (r ->> 'home_shots_on_target')::smallint, (r ->> 'away_shots_on_target')::smallint,
           (r ->> 'home_corners')::smallint, (r ->> 'away_corners')::smallint,
           (r ->> 'home_cards')::smallint, (r ->> 'away_cards')::smallint,
           (r ->> 'home_shots')::smallint, (r ->> 'away_shots')::smallint,
           nullif(r ->> 'referee', '')
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
                  referee = coalesce(excluded.referee, historical_results.referee)
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_historical_results(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_historical_results(jsonb) to service_role;

create table if not exists public.match_referees (
  league_code text not null,
  kickoff timestamptz not null,
  home_name text not null,
  away_name text not null,
  referee text not null check (char_length(referee) between 1 and 60),
  source text not null default 'football-data.co.uk',
  captured_at timestamptz not null default now()
);
create unique index if not exists match_referees_key
  on public.match_referees (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name);
create index if not exists match_referees_kickoff_idx on public.match_referees (kickoff);

-- Read by the server only; names are public facts but there is no reason to
-- open another table to the browser.
alter table public.match_referees enable row level security;

create or replace function public.upsert_match_referees(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.match_referees (league_code, kickoff, home_name, away_name, referee)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name', r ->> 'referee'
      from jsonb_array_elements(p_rows) r
     where coalesce(r ->> 'referee', '') <> ''
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
    do update set referee = excluded.referee, kickoff = excluded.kickoff, captured_at = now()
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_match_referees(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_match_referees(jsonb) to service_role;
