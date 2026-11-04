-- 0091: Match details from FotMob: lineups, every player stat, shots, events,
-- team stats, team profiles, and day-one snapshots of injuries and pre-match
-- lineups (those cannot be backfilled later).
--
-- Written only by ingestion/ (service role, source 'fotmob'). FotMob is an
-- unofficial feed of licensed data, so none of these tables is readable through
-- the Data API: no anon/authenticated grants, RLS on, no policies. Pages read
-- through the bounded functions at the bottom (one match, one team), which is
-- what they show anyway, and nobody can page through the whole set.
--
-- Team ids are deliberately NOT foreign keys on the per-match tables: merge_team
-- (0033) deletes the dropped team, and the side ('home'/'away') plus the match
-- row already say whose player it was. Match rows cascade: a match merged away
-- by merge_team loses its details, and the next run refetches them for the kept
-- match, whose source_ids carry the FotMob id over.

insert into public.ingest_sources (id, label, notes)
values ('fotmob', 'FotMob', 'Lineups, player stats, shots, events, team stats, team profiles and injury snapshots for the top five leagues and the UEFA club competitions. Never trusted for scores.')
on conflict (id) do nothing;

-- Operator switches: fotmob_ui shows the new match/team sections (no row reads
-- as on, see switches.ts); lineup_adjust lets lineups move the model's numbers
-- (off until the walk-forward backtest says it helps).
alter table public.app_switches drop constraint if exists app_switches_key_check;
alter table public.app_switches
  add constraint app_switches_key_check check (key in ('parsebot_live', 'code_hub_open', 'sportybet_direct', 'headline_engine', 'fotmob_ui', 'lineup_adjust'));
insert into public.app_switches (key, enabled)
values ('fotmob_ui', true), ('lineup_adjust', false)
on conflict (key) do nothing;

-- Finding a game by its FotMob id.
create index if not exists matches_fotmob_id_idx on public.matches ((source_ids ->> 'fotmob'));

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  fotmob_id bigint not null unique,
  name text not null check (char_length(name) between 1 and 120),
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  birth_date date,
  country_code text check (char_length(country_code) <= 8),
  usual_position smallint,
  fotmob_team_id bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_details (
  match_id uuid primary key references public.matches (id) on delete cascade,
  fotmob_match_id bigint not null unique,
  finished boolean not null default false,
  coverage text check (char_length(coverage) <= 40),
  lineup_type text check (char_length(lineup_type) <= 40),
  referee text check (char_length(referee) <= 120),
  referee_country text check (char_length(referee_country) <= 8),
  stadium text check (char_length(stadium) <= 160),
  stadium_city text check (char_length(stadium_city) <= 120),
  capacity integer,
  attendance integer,
  has_lineups boolean not null default false,
  has_player_stats boolean not null default false,
  has_shotmap boolean not null default false,
  has_xg boolean not null default false,
  fetched_at timestamptz not null default now()
);

create table if not exists public.match_lineups (
  match_id uuid not null references public.matches (id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  formation text check (char_length(formation) <= 20),
  coach_name text check (char_length(coach_name) <= 120),
  coach_fotmob_id bigint,
  team_rating numeric(4, 2),
  avg_starter_age numeric(4, 1),
  lineup_type text check (char_length(lineup_type) <= 40),
  primary key (match_id, side)
);

-- Starters, substitutes and (for games fetched before kickoff) the unavailable.
-- Unavailable rows are only written while the game is still to be played: on an
-- old game FotMob shows today's injuries, not that day's.
create table if not exists public.match_lineup_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  role text not null check (role in ('starter', 'sub', 'unavailable')),
  shirt text check (char_length(shirt) <= 4),
  position_id smallint,
  usual_position smallint,
  pitch_x real,
  pitch_y real,
  rating numeric(4, 2),
  minutes smallint,
  sub_in smallint,
  sub_out smallint,
  is_captain boolean not null default false,
  age smallint,
  absence_kind text check (char_length(absence_kind) <= 40),
  expected_return text check (char_length(expected_return) <= 80),
  primary key (match_id, player_id)
);
create index if not exists match_lineup_players_player_idx on public.match_lineup_players (player_id);

-- One row per player per game. The ten markets player-prop sites list get
-- columns; everything else FotMob measures is kept in stats, keyed by a
-- normalised stat key (fractions as key + key_total).
create table if not exists public.player_match_stats (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  is_goalkeeper boolean not null default false,
  minutes smallint,
  rating numeric(4, 2),
  goals smallint,
  assists smallint,
  shots smallint,
  shots_on_target smallint,
  tackles smallint,
  clearances smallint,
  fouls_committed smallint,
  fouls_won smallint,
  passes_attempted smallint,
  passes_completed smallint,
  saves smallint,
  xg numeric(6, 3),
  xa numeric(6, 3),
  stats jsonb not null default '{}'::jsonb,
  primary key (match_id, player_id)
);
create index if not exists player_match_stats_player_idx on public.player_match_stats (player_id);

create table if not exists public.match_shots (
  id bigint primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  side text not null check (side in ('home', 'away')),
  minute smallint,
  minute_added smallint,
  period text check (char_length(period) <= 20),
  x real,
  y real,
  xg real,
  xgot real,
  shot_type text check (char_length(shot_type) <= 30),
  situation text check (char_length(situation) <= 30),
  event_type text check (char_length(event_type) <= 30),
  on_target boolean,
  blocked boolean,
  inside_box boolean,
  own_goal boolean,
  goal_y real,
  goal_z real
);
create index if not exists match_shots_match_idx on public.match_shots (match_id);
create index if not exists match_shots_player_idx on public.match_shots (player_id);

create table if not exists public.match_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  seq smallint not null,
  minute smallint,
  minute_added smallint,
  type text not null check (char_length(type) <= 30),
  side text check (side in ('home', 'away')),
  player_id uuid references public.players (id) on delete set null,
  player_name text check (char_length(player_name) <= 120),
  related_player_id uuid references public.players (id) on delete set null,
  related_name text check (char_length(related_name) <= 120),
  card text check (char_length(card) <= 20),
  detail text check (char_length(detail) <= 120),
  home_score smallint,
  away_score smallint,
  primary key (match_id, seq)
);
create index if not exists match_events_player_idx on public.match_events (player_id);

create table if not exists public.match_team_stats (
  match_id uuid primary key references public.matches (id) on delete cascade,
  home_xg real,
  away_xg real,
  home_possession smallint,
  away_possession smallint,
  home_shots smallint,
  away_shots smallint,
  home_shots_on_target smallint,
  away_shots_on_target smallint,
  home_big_chances smallint,
  away_big_chances smallint,
  home_corners smallint,
  away_corners smallint,
  -- {"all": {"key": [home, away], ...}, "first_half": {...}, "second_half": {...}}
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.team_profiles (
  team_id uuid primary key references public.teams (id) on delete cascade,
  fotmob_team_id bigint not null unique,
  coach_name text check (char_length(coach_name) <= 120),
  venue_name text check (char_length(venue_name) <= 160),
  venue_city text check (char_length(venue_city) <= 120),
  venue_capacity integer,
  squad jsonb not null default '[]'::jsonb,
  transfers jsonb not null default '[]'::jsonb,
  honours jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

-- Day-one history that FotMob does not keep: who was out, as known each day.
create table if not exists public.availability_snapshots (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  captured_day date not null,
  side text not null check (side in ('home', 'away')),
  kind text check (char_length(kind) <= 40),
  expected_return text check (char_length(expected_return) <= 80),
  captured_at timestamptz not null default now(),
  primary key (match_id, player_id, captured_day)
);

-- What the lineup looked like before kickoff, each time it changed.
create table if not exists public.prematch_lineup_snapshots (
  match_id uuid not null references public.matches (id) on delete cascade,
  captured_at timestamptz not null default now(),
  lineup_type text check (char_length(lineup_type) <= 40),
  minutes_to_kickoff integer,
  payload jsonb not null,
  primary key (match_id, captured_at)
);

alter table public.players enable row level security;
alter table public.match_details enable row level security;
alter table public.match_lineups enable row level security;
alter table public.match_lineup_players enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.match_shots enable row level security;
alter table public.match_events enable row level security;
alter table public.match_team_stats enable row level security;
alter table public.team_profiles enable row level security;
alter table public.availability_snapshots enable row level security;
alter table public.prematch_lineup_snapshots enable row level security;

grant select, insert, update, delete on public.players to service_role;
grant select, insert, update, delete on public.match_details to service_role;
grant select, insert, update, delete on public.match_lineups to service_role;
grant select, insert, update, delete on public.match_lineup_players to service_role;
grant select, insert, update, delete on public.player_match_stats to service_role;
grant select, insert, update, delete on public.match_shots to service_role;
grant select, insert, update, delete on public.match_events to service_role;
grant select, insert, update, delete on public.match_team_stats to service_role;
grant select, insert, update, delete on public.team_profiles to service_role;
grant select, insert, update, delete on public.availability_snapshots to service_role;
grant select, insert, update, delete on public.prematch_lineup_snapshots to service_role;
revoke all on public.players, public.match_details, public.match_lineups, public.match_lineup_players,
  public.player_match_stats, public.match_shots, public.match_events, public.match_team_stats,
  public.team_profiles, public.availability_snapshots, public.prematch_lineup_snapshots
  from anon, authenticated;

-- Link a FotMob game to an existing match. Never creates a match, never moves
-- an id that already belongs to another match. True when linked (or already).
create or replace function public.link_fotmob_match(p_match_id uuid, p_fotmob_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_fotmob_id is null or p_fotmob_id !~ '^[0-9]{1,12}$' then
    return false;
  end if;
  if exists (select 1 from public.matches where source_ids ->> 'fotmob' = p_fotmob_id and id <> p_match_id) then
    return false;
  end if;
  select source_ids ->> 'fotmob' into v_current from public.matches where id = p_match_id;
  if not found then
    return false;
  end if;
  if v_current is not null then
    return v_current = p_fotmob_id;
  end if;
  update public.matches
     set source_ids = source_ids || jsonb_build_object('fotmob', p_fotmob_id), updated_at = now()
   where id = p_match_id;
  return true;
end;
$$;
revoke all on function public.link_fotmob_match(uuid, text) from public, anon, authenticated;
grant execute on function public.link_fotmob_match(uuid, text) to service_role;

-- Everything the match page shows for one game, in one round trip.
create or replace function public.match_details_bundle(p_match uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when d.match_id is null then null else jsonb_build_object(
    'details', jsonb_build_object(
      'finished', d.finished, 'coverage', d.coverage, 'lineupType', d.lineup_type,
      'referee', d.referee, 'refereeCountry', d.referee_country, 'stadium', d.stadium,
      'stadiumCity', d.stadium_city, 'capacity', d.capacity, 'attendance', d.attendance,
      'hasLineups', d.has_lineups, 'hasPlayerStats', d.has_player_stats,
      'hasShotmap', d.has_shotmap, 'hasXg', d.has_xg, 'fetchedAt', d.fetched_at),
    'lineups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'side', l.side, 'formation', l.formation, 'coach', l.coach_name,
        'rating', l.team_rating, 'avgAge', l.avg_starter_age, 'lineupType', l.lineup_type))
        from public.match_lineups l where l.match_id = p_match), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'lastName', p.last_name, 'side', lp.side, 'role', lp.role,
        'shirt', lp.shirt, 'positionId', lp.position_id, 'usualPosition', lp.usual_position,
        'x', lp.pitch_x, 'y', lp.pitch_y, 'rating', lp.rating, 'minutes', lp.minutes,
        'subIn', lp.sub_in, 'subOut', lp.sub_out, 'captain', lp.is_captain, 'age', lp.age,
        'absence', lp.absence_kind, 'expectedReturn', lp.expected_return,
        'goals', s.goals, 'assists', s.assists, 'shots', s.shots, 'shotsOnTarget', s.shots_on_target,
        'xg', s.xg, 'xa', s.xa, 'tackles', s.tackles, 'saves', s.saves,
        'passes', s.passes_completed, 'passesAttempted', s.passes_attempted)
        order by lp.side, lp.role, lp.pitch_y nulls last, lp.pitch_x nulls last)
        from public.match_lineup_players lp
        join public.players p on p.id = lp.player_id
        left join public.player_match_stats s on s.match_id = lp.match_id and s.player_id = lp.player_id
       where lp.match_id = p_match), '[]'::jsonb),
    'shots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'side', sh.side, 'minute', sh.minute, 'x', sh.x, 'y', sh.y, 'xg', sh.xg,
        'type', sh.shot_type, 'situation', sh.situation, 'event', sh.event_type,
        'onTarget', sh.on_target, 'player', p.name) order by sh.minute, sh.id)
        from public.match_shots sh left join public.players p on p.id = sh.player_id
       where sh.match_id = p_match), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'minute', e.minute, 'added', e.minute_added, 'type', e.type, 'side', e.side,
        'player', e.player_name, 'related', e.related_name, 'card', e.card, 'detail', e.detail,
        'homeScore', e.home_score, 'awayScore', e.away_score) order by e.seq)
        from public.match_events e where e.match_id = p_match), '[]'::jsonb),
    'teamStats', (select to_jsonb(ts) - 'match_id' from public.match_team_stats ts where ts.match_id = p_match)
  ) end
  from (select p_match as id) x
  left join public.match_details d on d.match_id = x.id;
$$;
revoke all on function public.match_details_bundle(uuid) from public;
grant execute on function public.match_details_bundle(uuid) to anon, authenticated, service_role;

-- A club's games either side of now, newest results first then upcoming.
create or replace function public.team_fixtures(p_team uuid, p_past integer default 10, p_future integer default 6)
returns table (
  id uuid, league_code text, kickoff timestamptz, status text, round text,
  home_team_id uuid, away_team_id uuid, home_name text, away_name text,
  home_crest text, away_crest text, home_goals integer, away_goals integer, source_ids jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  (select m.id, m.league_code, m.kickoff, m.status, m.round, m.home_team_id, m.away_team_id,
          m.home_name, m.away_name, th.crest, ta.crest, m.home_goals, m.away_goals, m.source_ids
     from public.matches m
     join public.teams th on th.id = m.home_team_id
     join public.teams ta on ta.id = m.away_team_id
    where (m.home_team_id = p_team or m.away_team_id = p_team)
      and m.status = 'finished'
    order by m.kickoff desc
    limit least(greatest(p_past, 0), 40))
  union all
  (select m.id, m.league_code, m.kickoff, m.status, m.round, m.home_team_id, m.away_team_id,
          m.home_name, m.away_name, th.crest, ta.crest, m.home_goals, m.away_goals, m.source_ids
     from public.matches m
     join public.teams th on th.id = m.home_team_id
     join public.teams ta on ta.id = m.away_team_id
    where (m.home_team_id = p_team or m.away_team_id = p_team)
      and m.status in ('scheduled', 'live', 'halftime')
      and m.kickoff > now() - interval '3 hours'
    order by m.kickoff
    limit least(greatest(p_future, 0), 20));
$$;
grant execute on function public.team_fixtures(uuid, integer, integer) to anon, authenticated, service_role;

-- A club's profile (coach, venue, squad, transfers, honours) for its page.
create or replace function public.team_profile(p_team uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'coach', tp.coach_name, 'venue', tp.venue_name, 'city', tp.venue_city,
    'capacity', tp.venue_capacity, 'squad', tp.squad, 'transfers', tp.transfers,
    'honours', tp.honours, 'fetchedAt', tp.fetched_at)
    from public.team_profiles tp where tp.team_id = p_team;
$$;
revoke all on function public.team_profile(uuid) from public;
grant execute on function public.team_profile(uuid) to anon, authenticated, service_role;

-- A club's players over its games since p_since (season leaders on its page).
create or replace function public.team_season_leaders(p_team uuid, p_since timestamptz)
returns table (
  player_id uuid, name text, apps integer, starts integer, minutes integer,
  goals integer, assists integer, shots integer, shots_on_target integer,
  xg numeric, xa numeric, avg_rating numeric, yellow integer, red integer
)
language sql
stable
security definer
set search_path = public
as $$
  with games as (
    select m.id, case when m.home_team_id = p_team then 'home' else 'away' end as side
      from public.matches m
     where (m.home_team_id = p_team or m.away_team_id = p_team)
       and m.status = 'finished' and m.kickoff >= p_since
  ), cards as (
    select e.player_id,
           count(*) filter (where e.card = 'Yellow')::integer as yellow,
           count(*) filter (where e.card in ('Red', 'YellowRed'))::integer as red
      from public.match_events e join games g on g.id = e.match_id and g.side = e.side
     where e.type = 'Card' and e.player_id is not null
     group by e.player_id
  )
  select s.player_id, p.name,
         count(*)::integer,
         count(*) filter (where lp.role = 'starter')::integer,
         coalesce(sum(s.minutes), 0)::integer,
         coalesce(sum(s.goals), 0)::integer,
         coalesce(sum(s.assists), 0)::integer,
         coalesce(sum(s.shots), 0)::integer,
         coalesce(sum(s.shots_on_target), 0)::integer,
         round(coalesce(sum(s.xg), 0), 2),
         round(coalesce(sum(s.xa), 0), 2),
         round(avg(s.rating), 2),
         coalesce(max(c.yellow), 0),
         coalesce(max(c.red), 0)
    from public.player_match_stats s
    join games g on g.id = s.match_id and g.side = s.side
    join public.players p on p.id = s.player_id
    left join public.match_lineup_players lp on lp.match_id = s.match_id and lp.player_id = s.player_id
    left join cards c on c.player_id = s.player_id
   where coalesce(s.minutes, 0) > 0
   group by s.player_id, p.name;
$$;
revoke all on function public.team_season_leaders(uuid, timestamptz) from public;
grant execute on function public.team_season_leaders(uuid, timestamptz) to anon, authenticated, service_role;
