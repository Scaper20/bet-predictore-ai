-- 0093: Player pages. FotMob's profile of each player (position, shirt,
-- height, foot, country, market value, contract, club, career, trophies,
-- current injury), and bounded reads of our own match data for one player at
-- a time: their page header, game log and season shots, position peers' rates
-- for percentiles, name search, and FotMob-id links for squad lists.
--
-- Same rules as 0091: the table is service-role only (FotMob is an unofficial
-- feed of licensed data); pages read one player at a time through the
-- functions below, so nobody can page through the whole set.

create table if not exists public.player_profiles (
  player_id uuid primary key references public.players (id) on delete cascade,
  fotmob_id bigint not null unique,
  position_label text check (char_length(position_label) <= 40),
  position_short text check (char_length(position_short) <= 8),
  other_positions text[] not null default '{}',
  shirt smallint,
  height_cm smallint,
  foot text check (char_length(foot) <= 10),
  country text check (char_length(country) <= 60),
  country_code text check (char_length(country_code) <= 8),
  birth_date date,
  market_value bigint,
  contract_end date,
  fotmob_team_id bigint,
  team_name text check (char_length(team_name) <= 120),
  on_loan boolean not null default false,
  injury jsonb,
  career jsonb not null default '[]'::jsonb,
  trophies jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists player_profiles_team_idx on public.player_profiles (fotmob_team_id);
create index if not exists player_profiles_fetched_idx on public.player_profiles (fetched_at);
create index if not exists players_name_trgm_idx on public.players (lower(name));

alter table public.player_profiles enable row level security;
grant select, insert, update, delete on public.player_profiles to service_role;
revoke all on public.player_profiles from anon, authenticated;

-- One player's page header: who they are, their profile, and their club as we
-- know it (FotMob team id -> our club through the id:fotmob alias).
create or replace function public.player_page(p_player uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'fotmobId', p.fotmob_id, 'name', p.name, 'firstName', p.first_name,
    'lastName', p.last_name, 'countryCode', coalesce(pp.country_code, p.country_code),
    'usualPosition', p.usual_position,
    'profile', case when pp.player_id is null then null else jsonb_build_object(
      'position', pp.position_label, 'positionShort', pp.position_short, 'otherPositions', pp.other_positions,
      'shirt', pp.shirt, 'height', pp.height_cm, 'foot', pp.foot, 'country', pp.country,
      'birthDate', pp.birth_date, 'marketValue', pp.market_value, 'contractEnd', pp.contract_end,
      'teamName', pp.team_name, 'onLoan', pp.on_loan, 'injury', pp.injury,
      'career', pp.career, 'trophies', pp.trophies, 'fetchedAt', pp.fetched_at) end,
    'team', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'crest', t.crest)
        from public.team_aliases a join public.teams t on t.id = a.team_id
       where a.scope = 'id:fotmob'
         and a.alias_key = coalesce(pp.fotmob_team_id, p.fotmob_team_id)::text
       limit 1)
  )
  from public.players p
  left join public.player_profiles pp on pp.player_id = p.id
  where p.id = p_player;
$$;
revoke all on function public.player_page(uuid) from public;
grant execute on function public.player_page(uuid) to anon, authenticated, service_role;

-- Every game we hold for one player, newest first (at most 120).
create or replace function public.player_game_log(p_player uuid, p_limit integer default 60)
returns table (
  match_id uuid, source_ids jsonb, kickoff timestamptz, league_code text, side text,
  team_id uuid, opponent_id uuid, opponent_name text, opponent_crest text,
  goals_for integer, goals_against integer, role text, minutes smallint, rating numeric,
  goals smallint, assists smallint, shots smallint, shots_on_target smallint,
  xg numeric, xa numeric, tackles smallint, clearances smallint,
  fouls_committed smallint, fouls_won smallint, passes_completed smallint,
  passes_attempted smallint, saves smallint, is_goalkeeper boolean,
  yellow integer, red integer
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.source_ids, m.kickoff, m.league_code, s.side,
         case when s.side = 'home' then m.home_team_id else m.away_team_id end,
         case when s.side = 'home' then m.away_team_id else m.home_team_id end,
         case when s.side = 'home' then m.away_name else m.home_name end,
         ot.crest,
         case when s.side = 'home' then m.home_goals else m.away_goals end,
         case when s.side = 'home' then m.away_goals else m.home_goals end,
         coalesce(lp.role, case when s.minutes is null then null else 'sub' end),
         s.minutes, s.rating, s.goals, s.assists, s.shots, s.shots_on_target,
         s.xg, s.xa, s.tackles, s.clearances, s.fouls_committed, s.fouls_won,
         s.passes_completed, s.passes_attempted, s.saves, s.is_goalkeeper,
         (select count(*)::integer from public.match_events e
           where e.match_id = m.id and e.player_id = p_player and e.type = 'Card' and e.card = 'Yellow'),
         (select count(*)::integer from public.match_events e
           where e.match_id = m.id and e.player_id = p_player and e.type = 'Card' and e.card in ('Red', 'YellowRed'))
    from public.player_match_stats s
    join public.matches m on m.id = s.match_id
    left join public.match_lineup_players lp on lp.match_id = s.match_id and lp.player_id = s.player_id
    left join public.teams ot on ot.id = case when s.side = 'home' then m.away_team_id else m.home_team_id end
   where s.player_id = p_player
   order by m.kickoff desc
   limit least(greatest(coalesce(p_limit, 60), 1), 120);
$$;
revoke all on function public.player_game_log(uuid, integer) from public;
grant execute on function public.player_game_log(uuid, integer) to anon, authenticated, service_role;

-- One player's shots since a date (their season shot map).
create or replace function public.player_shots(p_player uuid, p_since timestamptz)
returns table (
  match_id uuid, kickoff timestamptz, minute smallint, x real, y real, xg real, xgot real,
  shot_type text, situation text, event_type text, on_target boolean, inside_box boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select sh.match_id, m.kickoff, sh.minute, sh.x, sh.y, sh.xg, sh.xgot,
         sh.shot_type, sh.situation, sh.event_type, sh.on_target, sh.inside_box
    from public.match_shots sh
    join public.matches m on m.id = sh.match_id
   where sh.player_id = p_player and m.kickoff >= p_since
   order by m.kickoff desc, sh.minute
   limit 400;
$$;
revoke all on function public.player_shots(uuid, timestamptz) from public;
grant execute on function public.player_shots(uuid, timestamptz) to anon, authenticated, service_role;

-- Per-90 rates of every player in a position group with enough minutes since a
-- date: the peer pool for a player page's percentiles. Bounded by the minute
-- floor (a few hundred players per position) and returns rates only.
create or replace function public.position_peer_rates(p_position smallint, p_since timestamptz, p_min_minutes integer default 900)
returns table (
  player_id uuid, minutes integer, goals numeric, assists numeric, xg numeric, xa numeric,
  shots numeric, shots_on_target numeric, tackles numeric, clearances numeric,
  fouls_committed numeric, fouls_won numeric, passes numeric, saves numeric, rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.player_id, sum(s.minutes)::integer,
         round(90 * sum(coalesce(s.goals, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.assists, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.xg, 0)) / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.xa, 0)) / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.shots, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.shots_on_target, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.tackles, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.clearances, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.fouls_committed, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.fouls_won, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.passes_attempted, 0))::numeric / sum(s.minutes), 3),
         round(90 * sum(coalesce(s.saves, 0))::numeric / sum(s.minutes), 3),
         round(avg(s.rating), 2)
    from public.player_match_stats s
    join public.matches m on m.id = s.match_id
    join public.players p on p.id = s.player_id
   where m.kickoff >= p_since
     and coalesce(s.minutes, 0) > 0
     and p.usual_position = p_position
   group by s.player_id
  having sum(s.minutes) >= greatest(coalesce(p_min_minutes, 900), 300);
$$;
revoke all on function public.position_peer_rates(smallint, timestamptz, integer) from public;
grant execute on function public.position_peer_rates(smallint, timestamptz, integer) to anon, authenticated, service_role;

-- Players by name for the header search: at most 8, recent regulars first.
create or replace function public.search_players(p_q text)
returns table (id uuid, name text, team_name text, position_short text, apps integer)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(trim(left(coalesce(p_q, ''), 40))) as s)
  select p.id, p.name, pp.team_name, pp.position_short,
         (select count(*)::integer from public.player_match_stats s
            join public.matches m on m.id = s.match_id
           where s.player_id = p.id and m.kickoff > now() - interval '365 days') as apps
    from public.players p
    left join public.player_profiles pp on pp.player_id = p.id
    cross join q
   where char_length(q.s) >= 2
     and lower(p.name) like '%' || replace(replace(q.s, '%', ''), '_', '') || '%'
   order by (lower(p.name) like q.s || '%' or lower(coalesce(p.last_name, '')) like q.s || '%') desc,
            apps desc, p.name
   limit 8;
$$;
revoke all on function public.search_players(text) from public;
grant execute on function public.search_players(text) to anon, authenticated, service_role;

-- Our player ids for FotMob ids (club squad lists link only to players we hold).
create or replace function public.player_ids_by_fotmob(p_ids bigint[])
returns table (fotmob_id bigint, id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.fotmob_id, p.id from public.players p
   where p.fotmob_id = any (p_ids[1:80]);
$$;
revoke all on function public.player_ids_by_fotmob(bigint[]) from public;
grant execute on function public.player_ids_by_fotmob(bigint[]) to anon, authenticated, service_role;

-- For the fotmob-players job only: who needs a (fresh) profile. Regulars of
-- the last two seasons plus everyone in a club squad we hold, stalest first.
create or replace function public.fotmob_player_candidates(p_since timestamptz, p_min_apps integer, p_stale_days integer, p_limit integer)
returns table (fotmob_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  with regulars as (
    select p.fotmob_id
      from public.player_match_stats s
      join public.matches m on m.id = s.match_id
      join public.players p on p.id = s.player_id
     where m.kickoff >= p_since and coalesce(s.minutes, 0) > 0
     group by p.fotmob_id
    having count(*) >= p_min_apps
  ), squads as (
    select (m ->> 'id')::bigint as fotmob_id
      from public.team_profiles tp, jsonb_array_elements(tp.squad) m
     where (m ->> 'id') ~ '^[0-9]{1,12}$'
  ), wanted as (
    select fotmob_id from regulars union select fotmob_id from squads
  )
  select w.fotmob_id
    from wanted w
    left join public.player_profiles pp on pp.fotmob_id = w.fotmob_id
   where pp.fetched_at is null or pp.fetched_at < now() - make_interval(days => greatest(p_stale_days, 1))
   order by pp.fetched_at nulls first
   limit least(greatest(p_limit, 1), 5000);
$$;
revoke all on function public.fotmob_player_candidates(timestamptz, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.fotmob_player_candidates(timestamptz, integer, integer, integer) to service_role;
