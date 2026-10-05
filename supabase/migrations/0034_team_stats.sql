-- 0034: read-only functions behind the stats pages (form, goals, trends, H2H).
--
-- Each answers "the last N finished games of these clubs" in one round trip:
-- a per-club limit is a window function, which PostgREST can't express, and
-- fetching every game of 200 clubs to keep ten each would move megabytes to
-- throw most of them away. security invoker: they read only tables anon can
-- already select.

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
    from (
      select t.tid as team_id, m.id as match_id, m.league_code, m.kickoff,
             m.home_team_id = t.tid as is_home,
             case when m.home_team_id = t.tid then m.away_team_id else m.home_team_id end as opponent_id,
             case when m.home_team_id = t.tid then m.away_name else m.home_name end as opponent_name,
             case when m.home_team_id = t.tid then m.home_goals else m.away_goals end as goals_for,
             case when m.home_team_id = t.tid then m.away_goals else m.home_goals end as goals_against,
             m.source_ids,
             row_number() over (partition by t.tid order by m.kickoff desc) as rn
        from unnest(p_team_ids) as t(tid)
        join public.matches m
          on (m.home_team_id = t.tid or m.away_team_id = t.tid)
         and m.status = 'finished'
         and m.home_goals is not null and m.away_goals is not null
         and (p_league is null or m.league_code = p_league)
    ) x
    left join public.teams o on o.id = x.opponent_id
   where x.rn <= p_per_team
   order by x.team_id, x.kickoff desc;
$$;

-- The clubs of one competition this season: everyone with a game in its
-- latest season, played or scheduled, so a promoted side appears before it
-- has played and last season's relegated clubs don't.
create or replace function public.league_teams(p_league text)
returns table (team_id uuid, name text, crest text, scope text)
language sql
stable
security invoker
set search_path = public
as $$
  with cur as (
    select max(season) as season
      from public.matches
     where league_code = p_league and kickoff <= now() + interval '30 days'
  )
  select distinct on (t.id) t.id, t.name, t.crest, t.scope
    from public.matches m
    join cur on m.season = cur.season
    join public.teams t on t.id in (m.home_team_id, m.away_team_id)
   where m.league_code = p_league
   order by t.id;
$$;

grant execute on function public.team_recent_results(uuid[], integer, text) to anon, authenticated;
grant execute on function public.league_teams(text) to anon, authenticated;
