-- 0094: player props (phase 2): bookmaker player lines, projections, picks.
--
-- Everything here is written and read by the server only (service_role):
-- projections and picks are paid content, so they are never exposed to the
-- Data API's anon or authenticated roles. The one public read is the
-- aggregated track record (player_prop_record), as for team picks.
--
--   player_lines              bookmaker player lines as captured (SportyBet now,
--                             others later), kept 14 days
--   player_aliases            a bookmaker's player id -> our player
--   player_prop_projections   the model's mean and ladder per starter and market
--   player_prop_picks         the published (or shadow) pick per player and
--                             market, settled from FotMob counts; a player who
--                             did not play is void, never a loss
--   app_switches.player_props publish props (default off: shadow only)
--
-- Inputs for the model, bounded and service-only:
--   prop_game_logs(players[], since)        up to 60 players' games
--   team_conceded_by_position(team, since)  what a club conceded per game and position
--   prop_position_priors(since)             per-90 averages per position

alter table public.app_switches drop constraint if exists app_switches_key_check;
alter table public.app_switches
  add constraint app_switches_key_check check (key in ('parsebot_live', 'code_hub_open', 'sportybet_direct', 'headline_engine', 'fotmob_ui', 'lineup_adjust', 'player_props'));
insert into public.app_switches (key, enabled) values ('player_props', false) on conflict (key) do nothing;

create table if not exists public.player_aliases (
  platform text not null check (platform in ('sportybet')),
  platform_player_id text not null check (char_length(platform_player_id) between 1 and 80),
  player_id uuid not null references public.players (id) on delete cascade,
  platform_name text check (char_length(platform_name) <= 120),
  method text not null check (method in ('id', 'name', 'manual')),
  created_at timestamptz not null default now(),
  primary key (platform, platform_player_id)
);

create table if not exists public.player_lines (
  id bigserial primary key,
  platform text not null check (platform in ('sportybet')),
  match_id uuid not null references public.matches (id) on delete cascade,
  event_id text not null check (char_length(event_id) <= 60),
  market text not null check (market in ('goals', 'assists', 'goalsAssists', 'shots', 'shotsOnTarget', 'tackles', 'fouls', 'clearances', 'passes', 'saves')),
  platform_market text not null check (char_length(platform_market) <= 20),
  specifier text not null default '' check (char_length(specifier) <= 200),
  line numeric(5, 1) not null,
  platform_player_id text check (char_length(platform_player_id) <= 80),
  platform_player_name text not null check (char_length(platform_player_name) <= 120),
  player_id uuid references public.players (id) on delete set null,
  over_odds numeric(7, 2),
  under_odds numeric(7, 2),
  over_outcome text check (char_length(over_outcome) <= 40),
  under_outcome text check (char_length(under_outcome) <= 40),
  captured_at timestamptz not null default now(),
  unique (platform, match_id, market, platform_player_name, line)
);
create index if not exists player_lines_match_idx on public.player_lines (match_id);
create index if not exists player_lines_captured_idx on public.player_lines (captured_at);

create table if not exists public.player_prop_projections (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  market text not null check (market in ('goals', 'assists', 'goalsAssists', 'shots', 'shotsOnTarget', 'tackles', 'fouls', 'clearances', 'passes', 'saves')),
  team_id uuid references public.teams (id) on delete set null,
  position smallint check (position between 0 and 3),
  lineup text not null check (lineup in ('confirmed', 'predicted')),
  mean numeric(7, 3) not null,
  size numeric(8, 3),
  minutes numeric(5, 1),
  ladder jsonb not null default '[]'::jsonb,
  model_version text not null check (char_length(model_version) <= 40),
  computed_at timestamptz not null default now(),
  primary key (match_id, player_id, market)
);

create table if not exists public.player_prop_picks (
  id bigserial primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  market text not null check (market in ('goals', 'assists', 'goalsAssists', 'shots', 'shotsOnTarget', 'tackles', 'fouls', 'clearances', 'passes', 'saves')),
  line numeric(5, 1) not null,
  side text not null check (side in ('over', 'under')),
  probability numeric(5, 4) not null check (probability between 0 and 1),
  market_probability numeric(5, 4) check (market_probability between 0 and 1),
  price numeric(7, 2),
  platform text check (platform in ('sportybet')),
  selection text check (char_length(selection) <= 120),
  risk text not null check (risk in ('low', 'medium', 'high')),
  lineup text not null check (lineup in ('confirmed', 'predicted')),
  published boolean not null default false,
  kickoff timestamptz not null,
  model_version text not null check (char_length(model_version) <= 40),
  logged_at timestamptz not null default now(),
  result text check (result in ('win', 'lose', 'push', 'void')),
  actual numeric(6, 1),
  void_reason text check (char_length(void_reason) <= 80),
  settled_at timestamptz,
  unique (match_id, player_id, market)
);
create index if not exists player_prop_picks_kickoff_idx on public.player_prop_picks (kickoff);
create index if not exists player_prop_picks_unsettled_idx on public.player_prop_picks (kickoff) where result is null;

alter table public.player_aliases enable row level security;
alter table public.player_lines enable row level security;
alter table public.player_prop_projections enable row level security;
alter table public.player_prop_picks enable row level security;

grant select, insert, update, delete on public.player_aliases, public.player_lines, public.player_prop_projections, public.player_prop_picks to service_role;
grant usage, select on sequence public.player_lines_id_seq, public.player_prop_picks_id_seq to service_role;
revoke all on public.player_aliases, public.player_lines, public.player_prop_projections, public.player_prop_picks from anon, authenticated;

-- Up to 60 players' games since a date, for the projections (one call per match).
create or replace function public.prop_game_logs(p_players uuid[], p_since timestamptz)
returns table (
  player_id uuid, kickoff timestamptz, started boolean, minutes smallint,
  goals smallint, assists smallint, shots smallint, shots_on_target smallint, xg numeric, xa numeric,
  tackles smallint, clearances smallint, fouls_committed smallint, passes_attempted smallint, saves smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.player_id, m.kickoff, coalesce(lp.role = 'starter', false), s.minutes,
         s.goals, s.assists, s.shots, s.shots_on_target, s.xg, s.xa,
         s.tackles, s.clearances, s.fouls_committed, s.passes_attempted, s.saves
    from public.player_match_stats s
    join public.matches m on m.id = s.match_id
    left join public.match_lineup_players lp on lp.match_id = s.match_id and lp.player_id = s.player_id
   where s.player_id = any (p_players[1:60])
     and m.kickoff >= greatest(p_since, now() - interval '3 years')
     and m.kickoff < now()
     and coalesce(s.minutes, 0) > 0
   order by m.kickoff;
$$;
revoke all on function public.prop_game_logs(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.prop_game_logs(uuid[], timestamptz) to service_role;

-- What a club's opponents recorded against it, per game and position (the
-- opponent factor): one row per game and position, totals of each stat.
create or replace function public.team_conceded_by_position(p_team uuid, p_since timestamptz)
returns table (
  match_id uuid, kickoff timestamptz, pos smallint, minutes integer,
  goals integer, assists integer, shots integer, shots_on_target integer,
  tackles integer, clearances integer, fouls_committed integer, passes_attempted integer, saves integer
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.kickoff, p.usual_position, sum(s.minutes)::integer,
         sum(coalesce(s.goals, 0))::integer, sum(coalesce(s.assists, 0))::integer,
         sum(coalesce(s.shots, 0))::integer, sum(coalesce(s.shots_on_target, 0))::integer,
         sum(coalesce(s.tackles, 0))::integer, sum(coalesce(s.clearances, 0))::integer,
         sum(coalesce(s.fouls_committed, 0))::integer, sum(coalesce(s.passes_attempted, 0))::integer,
         sum(coalesce(s.saves, 0))::integer
    from public.matches m
    join public.player_match_stats s on s.match_id = m.id
     and s.side = case when m.home_team_id = p_team then 'away' else 'home' end
    join public.players p on p.id = s.player_id
   where (m.home_team_id = p_team or m.away_team_id = p_team)
     and m.status = 'finished'
     and m.kickoff >= greatest(p_since, now() - interval '3 years')
     and coalesce(s.minutes, 0) > 0
     and p.usual_position is not null
   group by m.id, m.kickoff, p.usual_position
   order by m.kickoff
   limit 800;
$$;
revoke all on function public.team_conceded_by_position(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.team_conceded_by_position(uuid, timestamptz) to service_role;

-- Per-90 averages per position since a date (appearances of 15+ minutes).
create or replace function public.prop_position_priors(p_since timestamptz)
returns table (
  pos smallint, minutes bigint, goals numeric, assists numeric, xg numeric, xa numeric,
  shots numeric, shots_on_target numeric, tackles numeric, clearances numeric,
  fouls_committed numeric, passes_attempted numeric, saves numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.usual_position, sum(s.minutes)::bigint,
         90 * sum(coalesce(s.goals, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.assists, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.xg, 0)) / sum(s.minutes),
         90 * sum(coalesce(s.xa, 0)) / sum(s.minutes),
         90 * sum(coalesce(s.shots, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.shots_on_target, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.tackles, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.clearances, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.fouls_committed, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.passes_attempted, 0))::numeric / sum(s.minutes),
         90 * sum(coalesce(s.saves, 0))::numeric / sum(s.minutes)
    from public.player_match_stats s
    join public.matches m on m.id = s.match_id
    join public.players p on p.id = s.player_id
   where m.kickoff >= greatest(p_since, now() - interval '3 years')
     and s.minutes >= 15
     and p.usual_position is not null
   group by p.usual_position;
$$;
revoke all on function public.prop_position_priors(timestamptz) from public, anon, authenticated;
grant execute on function public.prop_position_priors(timestamptz) to service_role;

-- The public track record: published picks only, per market, settled ones.
create or replace function public.player_prop_record(p_since timestamptz default now() - interval '365 days')
returns table (market text, picks integer, won integer, lost integer, voided integer, stated numeric)
language sql
stable
security definer
set search_path = public
as $$
  select market,
         count(*) filter (where result in ('win', 'lose'))::integer,
         count(*) filter (where result = 'win')::integer,
         count(*) filter (where result = 'lose')::integer,
         count(*) filter (where result in ('void', 'push'))::integer,
         round(avg(probability) filter (where result in ('win', 'lose')), 4)
    from public.player_prop_picks
   where published and result is not null and kickoff >= p_since
   group by market;
$$;
revoke all on function public.player_prop_record(timestamptz) from public;
grant execute on function public.player_prop_record(timestamptz) to anon, authenticated, service_role;

-- Retention: lines are only needed until the game is settled.
create or replace function public.prune_player_lines()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.player_lines where captured_at < now() - interval '14 days';
  delete from public.player_prop_projections where computed_at < now() - interval '14 days';
$$;
revoke all on function public.prune_player_lines() from public, anon, authenticated;

-- Every 15 minutes, call the app only when there is work: a game in the
-- FotMob competitions within 36 hours, or a pick waiting to be settled whose
-- game now has player stats.
create or replace function public.invoke_player_props()
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
      select 1 from public.matches m
       where m.kickoff > now() and m.kickoff <= now() + interval '36 hours'
         and m.league_code in ('premier-league', 'la-liga', 'bundesliga', 'serie-a', 'ligue-1', 'champions-league', 'europa-league', 'conference-league')
    )
    or exists (
      select 1 from public.player_prop_picks p
        join public.match_details d on d.match_id = p.match_id and d.finished and d.has_player_stats
       where p.result is null
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
    url := v_url || '/api/cron/player-props',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function public.invoke_player_props() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('betrix-player-props', '7-59/15 * * * *', 'select public.invoke_player_props()');
    perform cron.schedule('betrix-prune-player-lines', '41 3 * * *', 'select public.prune_player_lines()');
  end if;
end;
$$;
