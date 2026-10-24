-- Quieter database: stop the work that changes nothing, and stop one query
-- spilling to disk. Found while looking into Supabase's "Disk IO Budget"
-- warning (October 2026); the numbers are in docs/database-load.md.
-- Functions only, no tables: safe to run on the live project, and each part
-- can be reverted by re-running its function from the migration that last
-- defined it (0034, 0029, 0072).
--
-- 1. team_recent_results spilled to disk.
--    It numbered every finished game of every club asked for, then kept the
--    newest few. A 150-club chunk sorts 11,000 rows in 2,040 kB against 2,184
--    kB of working memory, so a chunk with slightly longer histories spilled:
--    6.3 GB of temporary files (and 6.3 GB read back) in two months, 84% of
--    all the temporary-file traffic since 21 August. Now each club reads only
--    its own newest few games, from each side, through the indexes it already
--    has. The largest sort is 26 kB, and the same chunk takes 38 ms, not 139.
--    Same rows (checked on four call shapes); the only change is that two
--    stored copies of one game at the same kickoff now come back in a fixed
--    order (by match id) instead of an arbitrary one.
--
-- 2. Writes that wrote the same thing again.
--    Each of these ran an UPDATE when the row was already right, which still
--    writes a new row version and a new entry in every index:
--      upsert_historic_odds       re-set `prices` to the value it had
--      upsert_historical_results  re-set the same score and statistics
--      store_raw_payload          bumped last_seen_at / retain_until on every
--                                 unchanged live feed, once a minute
--    Each now skips a row that would not change. They return the number of
--    rows inserted or changed, not touched; callers only log that count.
--    store_raw_payload refreshes an unchanged payload at most hourly, which
--    keeps it retained as long as before (the retention is days).
--
-- Not changed, deliberately: ingest_matches and the Elo ratings upsert, which
-- write more but need a careful look at their own matching logic (see the doc).

-- 1 -------------------------------------------------------------------------

create or replace function public.team_recent_results(
  p_team_ids uuid[],
  p_per_team integer default 10,
  p_league text default null
)
returns table (
  team_id uuid,
  match_id uuid,
  league_code text,
  kickoff timestamptz,
  is_home boolean,
  opponent_id uuid,
  opponent_name text,
  opponent_crest text,
  goals_for integer,
  goals_against integer,
  source_ids jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select x.team_id, x.match_id, x.league_code, x.kickoff, x.is_home, x.opponent_id, x.opponent_name,
         o.crest, x.goals_for, x.goals_against, x.source_ids
    from unnest(p_team_ids) as t(tid)
   cross join lateral (
     -- A club's newest games are its newest home games and its newest away
     -- games, so the top few of each side is enough to find the top few overall.
     select u.*
       from (
         (select t.tid as team_id, m.id as match_id, m.league_code, m.kickoff, true as is_home,
                 m.away_team_id as opponent_id, m.away_name as opponent_name,
                 m.home_goals as goals_for, m.away_goals as goals_against, m.source_ids
            from public.matches m
           where m.home_team_id = t.tid
             and m.status = 'finished'
             and m.home_goals is not null and m.away_goals is not null
             and (p_league is null or m.league_code = p_league)
           order by m.kickoff desc, m.id
           limit p_per_team)
         union all
         (select t.tid, m.id, m.league_code, m.kickoff, false,
                 m.home_team_id, m.home_name,
                 m.away_goals, m.home_goals, m.source_ids
            from public.matches m
           where m.away_team_id = t.tid
             and m.status = 'finished'
             and m.home_goals is not null and m.away_goals is not null
             and (p_league is null or m.league_code = p_league)
           order by m.kickoff desc, m.id
           limit p_per_team)
       ) u
      order by u.kickoff desc, u.match_id
      limit p_per_team
   ) x
   left join public.teams o on o.id = x.opponent_id
   order by x.team_id, x.kickoff desc, x.match_id;
$$;

-- 2 -------------------------------------------------------------------------

create or replace function public.upsert_historic_odds(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.odds_snapshots (league_code, kickoff, home_name, away_name, source, bookmaker, market,
                                       prices, is_opening, is_closing, captured_at)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           r ->> 'source', r ->> 'bookmaker', r ->> 'market', r -> 'prices',
           coalesce((r ->> 'is_opening')::boolean, false), coalesce((r ->> 'is_closing')::boolean, false),
           (r ->> 'kickoff')::timestamptz
      from jsonb_array_elements(p_rows) r
     where coalesce((r ->> 'is_opening')::boolean, false) or coalesce((r ->> 'is_closing')::boolean, false)
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name, source, bookmaker, market,
                 is_opening, is_closing)
      where is_opening or is_closing
    do update set prices = excluded.prices
      where odds_snapshots.prices is distinct from excluded.prices
    returning 1
  )
  select count(*)::int from ins;
$$;

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
      -- The same values the SET above would write: a stored row that already
      -- holds them is left alone. A missing statistic still never erases one.
      where (historical_results.home_goals, historical_results.away_goals,
             historical_results.home_shots_on_target, historical_results.away_shots_on_target,
             historical_results.home_corners, historical_results.away_corners,
             historical_results.home_cards, historical_results.away_cards,
             historical_results.home_shots, historical_results.away_shots,
             historical_results.referee, historical_results.home_reds, historical_results.away_reds)
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
             coalesce(excluded.away_reds, historical_results.away_reds))
    returning 1
  )
  select count(*)::int from ins;
$$;

create or replace function public.store_raw_payload(
  p_source text,
  p_endpoint text,
  p_params jsonb,
  p_payload jsonb,
  p_retain_days integer default 90
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params_hash text := md5(coalesce(p_params, '{}'::jsonb)::text);
  v_content_hash text := md5(p_payload::text);
  v_latest record;
  v_id bigint;
begin
  select id, content_hash into v_latest from public.raw_payloads
   where source = p_source and endpoint = p_endpoint and params_hash = v_params_hash
   order by fetched_at desc limit 1;
  if v_latest.id is not null and v_latest.content_hash = v_content_hash then
    -- Seen again, unchanged. Noting it every minute rewrote the row and all
    -- three of its indexes for a timestamp nothing reads closer than an hour.
    update public.raw_payloads
       set last_seen_at = now(), retain_until = greatest(retain_until, now() + make_interval(days => p_retain_days))
     where id = v_latest.id
       and last_seen_at < now() - interval '1 hour';
    return v_latest.id;
  end if;
  insert into public.raw_payloads (source, endpoint, params, params_hash, content_hash, payload, retain_until)
  values (p_source, p_endpoint, coalesce(p_params, '{}'::jsonb), v_params_hash, v_content_hash, p_payload,
          now() + make_interval(days => p_retain_days))
  returning id into v_id;
  return v_id;
end;
$$;
