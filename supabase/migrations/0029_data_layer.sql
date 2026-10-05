-- BetriX — scheduled data layer.
--
-- Third-party sports data stops being fetched while a page renders. Scheduled
-- jobs (GitHub Actions for the Python scrapers, a Supabase Edge Function for
-- live scores) write it here, and pages read it from here. See ingestion/.
--
-- Tables, in the order data flows through them:
--   ingest_sources       one row per upstream; flipping `enabled` turns it off
--   ingest_runs          every job run, per source and competition
--   raw_payloads         upstream responses as received, before transforming
--   competitions         the league catalogue (synced from src/lib/leagues.ts)
--   teams, team_aliases  one club, many spellings; unresolved_entities holds
--                        the spellings no rule could place
--   matches              fixtures, live state and results
--   standings, odds_snapshots, elo_ratings
--   season_coverage      what each season should hold against what loaded,
--                        so known gaps (abridged NPFL seasons) are flagged,
--                        never filled in
--
-- Ingestion tables have RLS on and no policies: only the service role (jobs,
-- admin pages) touches them. Public sports facts get a read-all policy, like
-- historical_results and match_results before them.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Sources and runs

create table if not exists public.ingest_sources (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  label text not null,
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.ingest_sources (id, label, notes) values
  ('thesportsdb', 'TheSportsDB', 'Paid key. Live scores, fixtures, results and tables for every competition.'),
  ('espn', 'ESPN (soccerdata)', 'Fixture cross-check, including NPFL as a custom league. No scores: soccerdata 1.9.1 cannot read them.'),
  ('football-data-org', 'football-data.org', 'Free key. Fixtures, tables and crests for its 12 competitions; scores not used (delayed on the free plan).'),
  ('football-data-uk', 'football-data.co.uk', 'Free CSVs. European results with opening and closing odds.'),
  ('openfootball', 'openfootball', 'CC0 text files. Historical backfill, NPFL 2009-2026 and CAF Champions League.'),
  ('clubelo', 'ClubElo', 'Free CSV API. Daily Elo for European and South American clubs.'),
  ('betrix', 'BetriX (computed)', 'Ratings BetriX computes itself, such as Elo for leagues ClubElo does not cover.'),
  ('odds', 'Odds snapshots', 'SportyBet and The Odds API prices captured on a schedule.')
on conflict (id) do nothing;

create table if not exists public.ingest_runs (
  id bigint generated always as identity primary key,
  job text not null,
  source text not null references public.ingest_sources (id),
  league_code text,
  status text not null check (status in ('running', 'ok', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_in integer not null default 0,
  rows_written integer not null default 0,
  error text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists ingest_runs_source_started_idx on public.ingest_runs (source, started_at desc);
create index if not exists ingest_runs_league_started_idx on public.ingest_runs (league_code, started_at desc);

alter table public.ingest_sources enable row level security;
alter table public.ingest_runs enable row level security;

-- ---------------------------------------------------------------------------
-- Raw payloads
--
-- A payload is stored only when it differs from the last one stored for the
-- same call; an identical response just extends the existing row. Rows expire
-- after their source's window (7 days for live scores, 90 for the rest), but
-- the latest payload for each call is always kept, so a source that breaks
-- leaves its last good answer behind.

create table if not exists public.raw_payloads (
  id bigint generated always as identity primary key,
  source text not null references public.ingest_sources (id),
  endpoint text not null,
  params jsonb not null default '{}'::jsonb,
  params_hash text not null,
  content_hash text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  retain_until timestamptz not null
);

create index if not exists raw_payloads_call_idx
  on public.raw_payloads (source, endpoint, params_hash, fetched_at desc);
create index if not exists raw_payloads_retain_idx on public.raw_payloads (retain_until);

alter table public.raw_payloads enable row level security;

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
  select id, content_hash into v_latest
    from public.raw_payloads
   where source = p_source and endpoint = p_endpoint and params_hash = v_params_hash
   order by fetched_at desc
   limit 1;

  if v_latest.id is not null and v_latest.content_hash = v_content_hash then
    update public.raw_payloads
       set last_seen_at = now(),
           retain_until = greatest(retain_until, now() + make_interval(days => p_retain_days))
     where id = v_latest.id;
    return v_latest.id;
  end if;

  insert into public.raw_payloads (source, endpoint, params, params_hash, content_hash, payload, retain_until)
  values (p_source, p_endpoint, coalesce(p_params, '{}'::jsonb), v_params_hash, v_content_hash, p_payload,
          now() + make_interval(days => p_retain_days))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prune_raw_payloads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.raw_payloads r
   where r.retain_until < now()
     and exists (
       select 1 from public.raw_payloads newer
        where newer.source = r.source
          and newer.endpoint = r.endpoint
          and newer.params_hash = r.params_hash
          and newer.fetched_at > r.fetched_at
     );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.store_raw_payload(text, text, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.prune_raw_payloads() from public, anon, authenticated;
grant execute on function public.store_raw_payload(text, text, jsonb, jsonb, integer) to service_role;
grant execute on function public.prune_raw_payloads() to service_role;

-- ---------------------------------------------------------------------------
-- Competitions and teams

create table if not exists public.competitions (
  code text primary key,
  sport text not null default 'football',
  name text not null,
  country text not null,
  is_international boolean not null default false,
  -- Source coordinates, as in src/lib/leagues.ts: {"theSportsDb": "4827", ...}
  source_ids jsonb not null default '{}'::jsonb,
  -- Which feed's finished results the model trains on (historical_results).
  -- 'football-data-uk' leagues keep their nightly CSV archive as the one
  -- writer; 'matches' leagues get finished games copied in from matches.
  -- One writer per league, so the same game is never counted twice under two
  -- spellings of a club's name.
  history_owner text not null default 'matches' check (history_owner in ('matches', 'football-data-uk')),
  logo text,
  updated_at timestamptz not null default now()
);

alter table public.competitions enable row level security;
create policy "competitions_select_all" on public.competitions for select using (true);

-- Same rules as normaliseKey() in src/lib/model/fit.ts, so the database and
-- the model agree on when two spellings are the same club.
create or replace function public.team_key(p_name text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(extensions.unaccent(coalesce(p_name, ''))),
              '\m(fc|afc|cf|sc|ac|as|ss|ssc|bk|sk|if|club|de|the)\M', '', 'g'),
            '\mmanchester\M', 'man', 'g'),
          '\munited\M', 'utd', 'g'),
        '\mwolverhampton wanderers\M', 'wolves', 'g'),
      '\mtottenham hotspur\M', 'tottenham', 'g'),
    '[^a-z0-9]', '', 'g');
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'football',
  -- Display and training name. For clubs TheSportsDB lists, its spelling,
  -- since that is the feed live scores and fixtures arrive under.
  name text not null,
  -- Scope that keeps two clubs with the same name apart: a country
  -- ("nigeria"), or "international" for national teams.
  scope text not null,
  created_from text not null references public.ingest_sources (id),
  -- Badge URL from TheSportsDB's club list, shown beside the name.
  crest text,
  created_at timestamptz not null default now()
);

create unique index if not exists teams_scope_key_idx on public.teams (scope, (public.team_key(name)));

create table if not exists public.team_aliases (
  scope text not null,
  alias_key text not null,
  alias text not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  source text not null references public.ingest_sources (id),
  method text not null check (method in ('canonical', 'seed', 'normalised', 'contains', 'manual')),
  created_at timestamptz not null default now(),
  primary key (scope, alias_key)
);

create index if not exists team_aliases_team_idx on public.team_aliases (team_id);

create table if not exists public.unresolved_entities (
  id bigint generated always as identity primary key,
  source text not null references public.ingest_sources (id),
  entity_type text not null default 'team',
  scope text not null,
  league_code text,
  raw_name text not null,
  alias_key text not null,
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_team_id uuid references public.teams (id) on delete set null,
  unique (source, entity_type, scope, alias_key)
);

alter table public.teams enable row level security;
alter table public.team_aliases enable row level security;
alter table public.unresolved_entities enable row level security;
create policy "teams_select_all" on public.teams for select using (true);

-- ---------------------------------------------------------------------------
-- Matches

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_code text not null references public.competitions (code),
  season text,
  kickoff timestamptz not null,
  kickoff_day date generated always as ((kickoff at time zone 'UTC')::date) stored,
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  home_name text not null,
  away_name text not null,
  status text not null check (status in ('scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled')),
  minute integer,
  home_goals integer,
  away_goals integer,
  ht_home integer,
  ht_away integer,
  round text,
  venue text,
  -- Each feed's own id for this game: {"thesportsdb": "2598057", "espn": "754696"}
  source_ids jsonb not null default '{}'::jsonb,
  -- Which feed last set the status/score.
  score_source text references public.ingest_sources (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_code, home_team_id, away_team_id, kickoff_day)
);

create index if not exists matches_kickoff_idx on public.matches (kickoff);
create index if not exists matches_league_kickoff_idx on public.matches (league_code, kickoff desc);
create index if not exists matches_in_play_idx on public.matches (kickoff) where status in ('live', 'halftime');
create index if not exists matches_sdb_id_idx on public.matches ((source_ids ->> 'thesportsdb'));
-- Pages look games up by any feed's id: source_ids @> '{"football-data-org": "537785"}'.
create index if not exists matches_source_ids_idx on public.matches using gin (source_ids jsonb_path_ops);

alter table public.matches enable row level security;
create policy "matches_select_all" on public.matches for select using (true);

-- Finished games feed the training set for leagues whose history this table
-- owns (see competitions.history_owner). Names are the canonical team names,
-- the same ones the openfootball backfill writes, so a game the backfill
-- already loaded lands on the same historical_results row.
create or replace function public.mirror_finished_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'finished' or new.home_goals is null or new.away_goals is null then
    return new;
  end if;
  if not exists (
    select 1 from public.competitions c where c.code = new.league_code and c.history_owner = 'matches'
  ) then
    return new;
  end if;

  insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source)
  values (new.league_code, new.kickoff, new.home_name, new.away_name, new.home_goals, new.away_goals,
          coalesce(new.score_source, 'matches'))
  on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
  do update set home_goals = excluded.home_goals,
                away_goals = excluded.away_goals,
                source = excluded.source,
                captured_at = now();
  return new;
end;
$$;

drop trigger if exists matches_mirror_finished on public.matches;
create trigger matches_mirror_finished
  after insert or update of status, home_goals, away_goals on public.matches
  for each row execute function public.mirror_finished_match();

-- Trigger-only; see 0015 for why PUBLIC (not anon/authenticated) is the grant to drop.
revoke execute on function public.mirror_finished_match() from public;

-- Writes a batch of matches from one source, merging into what is there.
--
-- Each row is a JSON object with league_code, kickoff, home_team_id,
-- away_team_id, home_name, away_name, source_id, and optionally season,
-- status, minute, home_goals, away_goals, ht_home, ht_away, round, venue.
--
-- A game is found by this source's own id first (so a rescheduled fixture
-- moves instead of duplicating), then by league + teams + kickoff day. Every
-- source adds its id to source_ids. Only sources trusted for scores
-- (TheSportsDB live and results; openfootball and football-data.co.uk for
-- finished history) may set status and score; the rest may only fill in
-- fixture details while a game is still scheduled, and never blank a field.
create or replace function public.ingest_matches(p_source text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_id uuid;
  v_scores boolean := p_source in ('thesportsdb', 'openfootball', 'football-data-uk');
  v_count integer := 0;
  v_kickoff timestamptz;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_kickoff := (r ->> 'kickoff')::timestamptz;
    v_id := null;

    if r ? 'source_id' and (r ->> 'source_id') is not null then
      select id into v_id from public.matches
       where source_ids ->> p_source = r ->> 'source_id'
       limit 1;
    end if;
    if v_id is null then
      select id into v_id from public.matches
       where league_code = r ->> 'league_code'
         and home_team_id = (r ->> 'home_team_id')::uuid
         and away_team_id = (r ->> 'away_team_id')::uuid
         and kickoff_day = (v_kickoff at time zone 'UTC')::date
       limit 1;
    end if;

    if v_id is null then
      insert into public.matches (
        league_code, season, kickoff, home_team_id, away_team_id, home_name, away_name,
        status, minute, home_goals, away_goals, ht_home, ht_away, round, venue, source_ids, score_source
      ) values (
        r ->> 'league_code', r ->> 'season', v_kickoff,
        (r ->> 'home_team_id')::uuid, (r ->> 'away_team_id')::uuid, r ->> 'home_name', r ->> 'away_name',
        case when v_scores then coalesce(r ->> 'status', 'scheduled') else 'scheduled' end,
        case when v_scores then (r ->> 'minute')::int end,
        case when v_scores then (r ->> 'home_goals')::int end,
        case when v_scores then (r ->> 'away_goals')::int end,
        case when v_scores then (r ->> 'ht_home')::int end,
        case when v_scores then (r ->> 'ht_away')::int end,
        r ->> 'round', r ->> 'venue',
        case when r ->> 'source_id' is not null then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        case when v_scores and r ? 'status' then p_source end
      );
    elsif v_scores then
      update public.matches m set
        season = coalesce(r ->> 'season', m.season),
        kickoff = v_kickoff,
        status = coalesce(r ->> 'status', m.status),
        minute = case when r ? 'minute' then (r ->> 'minute')::int else m.minute end,
        home_goals = coalesce((r ->> 'home_goals')::int, m.home_goals),
        away_goals = coalesce((r ->> 'away_goals')::int, m.away_goals),
        ht_home = coalesce((r ->> 'ht_home')::int, m.ht_home),
        ht_away = coalesce((r ->> 'ht_away')::int, m.ht_away),
        round = coalesce(r ->> 'round', m.round),
        venue = coalesce(r ->> 'venue', m.venue),
        source_ids = m.source_ids || case when r ->> 'source_id' is not null
                                          then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        score_source = case when r ? 'status' then p_source else m.score_source end,
        updated_at = now()
      where m.id = v_id;
    else
      update public.matches m set
        kickoff = case when m.status = 'scheduled' then v_kickoff else m.kickoff end,
        season = coalesce(m.season, r ->> 'season'),
        round = coalesce(m.round, r ->> 'round'),
        venue = coalesce(m.venue, r ->> 'venue'),
        source_ids = m.source_ids || case when r ->> 'source_id' is not null
                                          then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        updated_at = now()
      where m.id = v_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Gives a team a new canonical name and carries it everywhere the old one
-- was written, including the training rows this table owns. Without the
-- carry, a club renamed from openfootball's spelling to TheSportsDB's would
-- train under one name and be predicted under another.
create or replace function public.rename_team(p_team_id uuid, p_name text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  select name into v_old from public.teams where id = p_team_id for update;
  if v_old is null or v_old = p_name then
    return;
  end if;
  update public.teams set name = p_name, created_from = p_source where id = p_team_id;
  update public.matches set home_name = p_name where home_team_id = p_team_id;
  update public.matches set away_name = p_name where away_team_id = p_team_id;
  update public.historical_results h set home_name = p_name
   where h.home_name = v_old
     and h.league_code in (select code from public.competitions where history_owner = 'matches')
     and h.league_code in (select distinct league_code from public.matches
                            where home_team_id = p_team_id or away_team_id = p_team_id);
  update public.historical_results h set away_name = p_name
   where h.away_name = v_old
     and h.league_code in (select code from public.competitions where history_owner = 'matches')
     and h.league_code in (select distinct league_code from public.matches
                            where home_team_id = p_team_id or away_team_id = p_team_id);
end;
$$;

revoke all on function public.ingest_matches(text, jsonb) from public, anon, authenticated;
revoke all on function public.rename_team(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ingest_matches(text, jsonb) to service_role;
grant execute on function public.rename_team(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Standings, odds, ratings

create table if not exists public.standings (
  league_code text not null references public.competitions (code),
  season text not null,
  team_id uuid references public.teams (id),
  team_name text not null,
  position integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  points integer not null default 0,
  source text not null references public.ingest_sources (id),
  fetched_at timestamptz not null default now(),
  primary key (league_code, season, team_name)
);

alter table public.standings enable row level security;
create policy "standings_select_all" on public.standings for select using (true);

-- One row per match, bookmaker, market and moment. Prices sit in one jsonb
-- object per row ({"home": 2.1, "draw": 3.4, "away": 3.6} or
-- {"line": 2.5, "over": 1.9, "under": 1.95}) rather than a row per
-- selection: ten seasons of closing odds would otherwise take most of the
-- free database on their own.
create table if not exists public.odds_snapshots (
  id bigint generated always as identity primary key,
  match_id uuid references public.matches (id) on delete set null,
  league_code text not null,
  kickoff timestamptz not null,
  home_name text not null,
  away_name text not null,
  source text not null references public.ingest_sources (id),
  bookmaker text not null,
  market text not null check (market in ('1x2', 'over_under', 'asian_handicap', 'btts', 'double_chance')),
  prices jsonb not null,
  is_opening boolean not null default false,
  is_closing boolean not null default false,
  captured_at timestamptz not null default now()
);

create unique index if not exists odds_snapshots_historic_key
  on public.odds_snapshots (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name, source, bookmaker, market, is_opening, is_closing)
  where is_opening or is_closing;
create index if not exists odds_snapshots_match_idx on public.odds_snapshots (match_id, captured_at desc);
create index if not exists odds_snapshots_kickoff_idx on public.odds_snapshots (kickoff desc);

alter table public.odds_snapshots enable row level security;
create policy "odds_snapshots_select_all" on public.odds_snapshots for select using (true);

-- Latest odds "board" per competition and market, exactly as the odds
-- modules fetch it (src/lib/odds), captured on a schedule by
-- /api/cron/odds-snapshot. In db modes the odds modules read these instead
-- of calling SportyBet or The Odds API while a page renders; matching a
-- fixture to a board stays in the app, unchanged. Service role only.
create table if not exists public.odds_boards (
  key text primary key,
  source text not null references public.ingest_sources (id),
  payload jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.odds_boards enable row level security;

create table if not exists public.elo_ratings (
  source text not null references public.ingest_sources (id),
  scope text not null,
  team_name text not null,
  team_id uuid references public.teams (id) on delete set null,
  rated_on date not null,
  rating numeric(7, 2) not null,
  primary key (source, scope, team_name, rated_on)
);

create index if not exists elo_ratings_team_idx on public.elo_ratings (team_id, rated_on desc);

alter table public.elo_ratings enable row level security;
create policy "elo_ratings_select_all" on public.elo_ratings for select using (true);

-- Batch writers for the two tables whose natural keys are expressions
-- (kickoff day), which PostgREST's on_conflict can't target.

-- Archive results under the archive's own club names, the same rows
-- src/lib/archive/refresh.ts writes. A row already there keeps its source.
create or replace function public.upsert_historical_results(p_rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source)
    select r ->> 'league_code', (r ->> 'kickoff')::timestamptz, r ->> 'home_name', r ->> 'away_name',
           (r ->> 'home_goals')::int, (r ->> 'away_goals')::int, coalesce(r ->> 'source', 'football-data-uk')
      from jsonb_array_elements(p_rows) r
    on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
    do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals
    returning 1
  )
  select count(*)::int from ins;
$$;

-- Opening and closing prices from archives: one row per match, book, market
-- and phase, replaced if the archive is re-read.
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
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.upsert_historical_results(jsonb) from public, anon, authenticated;
revoke all on function public.upsert_historic_odds(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_historical_results(jsonb) to service_role;
grant execute on function public.upsert_historic_odds(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Coverage and health

create table if not exists public.season_coverage (
  league_code text not null references public.competitions (code),
  season text not null,
  source text not null references public.ingest_sources (id),
  expected integer,
  loaded integer not null,
  -- Human note for a known gap: "abridged season", "no file published".
  gap_note text,
  updated_at timestamptz not null default now(),
  primary key (league_code, season, source)
);

alter table public.season_coverage enable row level security;
create policy "season_coverage_select_all" on public.season_coverage for select using (true);

create or replace view public.data_health
with (security_invoker = true)
as
select
  c.code as league_code,
  c.name,
  (select count(*) from public.matches m where m.league_code = c.code) as matches_loaded,
  (select count(*) from public.historical_results h where h.league_code = c.code) as results_in_training,
  (select max(m.updated_at) from public.matches m where m.league_code = c.code) as last_match_update,
  (select jsonb_object_agg(r.source, r.last_ok)
     from (select source, max(finished_at) as last_ok
             from public.ingest_runs
            where league_code = c.code and status in ('ok', 'partial')
            group by source) r) as last_success_by_source,
  (select count(*) from public.ingest_runs r
    where r.league_code = c.code and r.status = 'failed' and r.started_at > now() - interval '7 days') as failed_runs_7d,
  (select count(*) from public.unresolved_entities u
    where u.league_code = c.code and u.resolved_team_id is null) as unresolved_entities,
  (select count(*) from public.season_coverage s
    where s.league_code = c.code and s.gap_note is not null) as flagged_gaps
from public.competitions c;

-- Clubs that may be one club under two names: same scope, one named by
-- TheSportsDB and one created by another source, sharing a first word of
-- four letters or more ("Bendel FC" / "Bendel Insurance"). For a person to
-- check on the data-health page; nothing merges automatically.
create or replace view public.team_duplicate_candidates
with (security_invoker = true)
as
select a.scope, a.id as canonical_id, a.name as canonical_name, b.id as other_id, b.name as other_name,
       b.created_from as other_source
  from public.teams a
  join public.teams b
    on a.scope = b.scope and a.id <> b.id
   and a.created_from = 'thesportsdb' and b.created_from <> 'thesportsdb'
   and split_part(lower(extensions.unaccent(a.name)), ' ', 1) = split_part(lower(extensions.unaccent(b.name)), ' ', 1)
   and length(split_part(a.name, ' ', 1)) >= 4;

-- ---------------------------------------------------------------------------
-- Which data layer pages read (admin toggle, next to maintenance mode)
--   live        today's behaviour: pages call the provider APIs
--   db_fallback pages read these tables, falling back to the APIs when empty
--   db          pages read these tables only

alter table public.site_settings
  add column if not exists data_layer text not null default 'live'
  check (data_layer in ('live', 'db_fallback', 'db'));
