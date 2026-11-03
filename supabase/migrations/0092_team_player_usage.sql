-- 0092: A club's players over its last few games before a moment: who started,
-- minutes, and their share of the side's chances (xG and xA). Feeds the
-- "who is missing and how much it matters" read on the match page, and the
-- lineup backtest, without exposing the tables (0091 keeps them service-role).
--
-- Point in time by construction: only games that kicked off before p_before.

create or replace function public.team_player_usage(p_team uuid, p_before timestamptz, p_games integer default 6)
returns table (
  player_id uuid, name text, usual_position smallint,
  games integer, starts integer, minutes integer,
  goals integer, assists integer, xg numeric, xa numeric,
  team_games integer, team_xg numeric, team_xa numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with g as (
    select m.id, case when m.home_team_id = p_team then 'home' else 'away' end as side
      from public.matches m
      join public.match_details d on d.match_id = m.id and d.has_lineups
     where (m.home_team_id = p_team or m.away_team_id = p_team)
       and m.status = 'finished'
       and m.kickoff < p_before
     order by m.kickoff desc
     limit least(greatest(coalesce(p_games, 6), 1), 10)
  ), usage as (
    select lp.player_id,
           count(*)::integer as games,
           count(*) filter (where lp.role = 'starter')::integer as starts
      from public.match_lineup_players lp
      join g on g.id = lp.match_id and g.side = lp.side
     where lp.role = 'starter' or (lp.role = 'sub' and lp.sub_in is not null)
     group by lp.player_id
  ), stats as (
    select s.player_id,
           coalesce(sum(s.minutes), 0)::integer as minutes,
           coalesce(sum(s.goals), 0)::integer as goals,
           coalesce(sum(s.assists), 0)::integer as assists,
           coalesce(sum(s.xg), 0) as xg,
           coalesce(sum(s.xa), 0) as xa
      from public.player_match_stats s
      join g on g.id = s.match_id and g.side = s.side
     group by s.player_id
  ), team as (
    select (select count(*) from g)::integer as games,
           coalesce(sum(xg), 0) as xg,
           coalesce(sum(xa), 0) as xa
      from stats
  )
  select u.player_id, p.name, p.usual_position,
         u.games, u.starts, coalesce(st.minutes, 0), coalesce(st.goals, 0), coalesce(st.assists, 0),
         round(coalesce(st.xg, 0), 3), round(coalesce(st.xa, 0), 3),
         team.games, round(team.xg, 3), round(team.xa, 3)
    from usage u
    join public.players p on p.id = u.player_id
    left join stats st on st.player_id = u.player_id
    cross join team;
$$;
revoke all on function public.team_player_usage(uuid, timestamptz, integer) from public;
grant execute on function public.team_player_usage(uuid, timestamptz, integer) to anon, authenticated, service_role;
