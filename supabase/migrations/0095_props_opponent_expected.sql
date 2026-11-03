-- 0095: the props opponent factor, measured against each player's usual output.
--
-- team_conceded_by_position (0094) gives what a club's opponents recorded per
-- game and position; the factor compared that with the position average, so
-- a strong club looked like it suppressed everything simply because its
-- opponents are weaker teams. This adds, per game and position, what those
-- same players usually record in those minutes (their per-90 rates from their
-- games before that one, shrunk toward the position average by 5 pseudo-90s),
-- so the factor becomes "actual / usual" (src/lib/model/player-props.ts
-- opponentFactor). Backtested in scripts/props-lab.ts (docs/props-backtest.md).
--
-- Read-only, bounded (a club's last 200 games, three years at most) and for
-- the server only, like the other props inputs.

create or replace function public.team_conceded_expected(p_team uuid, p_since timestamptz)
returns table (
  match_id uuid, kickoff timestamptz, pos smallint, minutes integer,
  goals integer, assists integer, shots integer, shots_on_target integer,
  tackles integer, clearances integer, fouls_committed integer, passes_attempted integer, saves integer,
  e_goals numeric, e_assists numeric, e_shots numeric, e_shots_on_target numeric,
  e_tackles numeric, e_clearances numeric, e_fouls_committed numeric, e_passes_attempted numeric, e_saves numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (select greatest(p_since, now() - interval '3 years') as t),
  games as (
    select m.id, m.kickoff, case when m.home_team_id = p_team then 'away' else 'home' end as opp_side
      from public.matches m, bounds b
     where (m.home_team_id = p_team or m.away_team_id = p_team)
       and m.status = 'finished' and m.kickoff >= b.t
     order by m.kickoff desc
     limit 200
  ),
  faced as (
    select s.player_id, g.id as match_id, g.kickoff, p.usual_position as pos, s.minutes,
           coalesce(s.goals, 0) as goals, coalesce(s.assists, 0) as assists, coalesce(s.shots, 0) as shots,
           coalesce(s.shots_on_target, 0) as sot, coalesce(s.tackles, 0) as tackles, coalesce(s.clearances, 0) as clearances,
           coalesce(s.fouls_committed, 0) as fouls, coalesce(s.passes_attempted, 0) as passes, coalesce(s.saves, 0) as saves
      from games g
      join public.player_match_stats s on s.match_id = g.id and s.side = g.opp_side
      join public.players p on p.id = s.player_id
     where coalesce(s.minutes, 0) > 0 and p.usual_position is not null
  ),
  hist as (
    select s.player_id, s.match_id,
           sum(case when s.minutes >= 15 then s.minutes else 0 end) over w as c_min,
           sum(case when s.minutes >= 15 then coalesce(s.goals, 0) else 0 end) over w as c_goals,
           sum(case when s.minutes >= 15 then coalesce(s.assists, 0) else 0 end) over w as c_assists,
           sum(case when s.minutes >= 15 then coalesce(s.shots, 0) else 0 end) over w as c_shots,
           sum(case when s.minutes >= 15 then coalesce(s.shots_on_target, 0) else 0 end) over w as c_sot,
           sum(case when s.minutes >= 15 then coalesce(s.tackles, 0) else 0 end) over w as c_tackles,
           sum(case when s.minutes >= 15 then coalesce(s.clearances, 0) else 0 end) over w as c_clearances,
           sum(case when s.minutes >= 15 then coalesce(s.fouls_committed, 0) else 0 end) over w as c_fouls,
           sum(case when s.minutes >= 15 then coalesce(s.passes_attempted, 0) else 0 end) over w as c_passes,
           sum(case when s.minutes >= 15 then coalesce(s.saves, 0) else 0 end) over w as c_saves
      from public.player_match_stats s
      join public.matches m on m.id = s.match_id, bounds b
     where s.player_id in (select distinct player_id from faced)
       and m.kickoff >= b.t - interval '1 year'
       and coalesce(s.minutes, 0) > 0
    window w as (partition by s.player_id order by m.kickoff rows between unbounded preceding and 1 preceding)
  ),
  priors as (
    select p.usual_position as pos,
           90.0 * sum(coalesce(s.goals, 0)) / sum(s.minutes) as goals, 90.0 * sum(coalesce(s.assists, 0)) / sum(s.minutes) as assists,
           90.0 * sum(coalesce(s.shots, 0)) / sum(s.minutes) as shots, 90.0 * sum(coalesce(s.shots_on_target, 0)) / sum(s.minutes) as sot,
           90.0 * sum(coalesce(s.tackles, 0)) / sum(s.minutes) as tackles, 90.0 * sum(coalesce(s.clearances, 0)) / sum(s.minutes) as clearances,
           90.0 * sum(coalesce(s.fouls_committed, 0)) / sum(s.minutes) as fouls, 90.0 * sum(coalesce(s.passes_attempted, 0)) / sum(s.minutes) as passes,
           90.0 * sum(coalesce(s.saves, 0)) / sum(s.minutes) as saves
      from public.player_match_stats s
      join public.matches m on m.id = s.match_id
      join public.players p on p.id = s.player_id, bounds b
     where m.kickoff >= b.t and s.minutes >= 15 and p.usual_position is not null
     group by p.usual_position
  )
  select f.match_id, f.kickoff, f.pos::smallint, sum(f.minutes)::integer,
         sum(f.goals)::integer, sum(f.assists)::integer, sum(f.shots)::integer, sum(f.sot)::integer,
         sum(f.tackles)::integer, sum(f.clearances)::integer, sum(f.fouls)::integer, sum(f.passes)::integer, sum(f.saves)::integer,
         round(sum((coalesce(h.c_goals, 0) + 5 * pr.goals) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_assists, 0) + 5 * pr.assists) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_shots, 0) + 5 * pr.shots) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_sot, 0) + 5 * pr.sot) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_tackles, 0) + 5 * pr.tackles) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_clearances, 0) + 5 * pr.clearances) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_fouls, 0) + 5 * pr.fouls) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_passes, 0) + 5 * pr.passes) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3),
         round(sum((coalesce(h.c_saves, 0) + 5 * pr.saves) / (coalesce(h.c_min, 0) / 90.0 + 5) * f.minutes / 90.0), 3)
    from faced f
    left join hist h on h.player_id = f.player_id and h.match_id = f.match_id
    join priors pr on pr.pos = f.pos
   group by f.match_id, f.kickoff, f.pos
   order by f.kickoff;
$$;
revoke all on function public.team_conceded_expected(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.team_conceded_expected(uuid, timestamptz) to service_role;
