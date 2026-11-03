-- Lineup features for scripts/lineup-backtest.ts: for every finished top-five
-- league game with a FotMob lineup, each side's missing regulars, computed the
-- way src/lib/model/availability.ts does (keep the two in step):
--   regulars      started >= half of the side's previous 6 games with lineups
--                 (at least 3 such games, all before this kickoff)
--   missing       regulars not in this game's starting eleven
--   attack_loss   missing regulars' share of the side's xG + xA in those games
--   defence_loss  missing regular defenders and keeper, by start share
--   keeper        a regular keeper is missing
-- Point in time: only games that kicked off before this one are looked at. The
-- eleven itself is known about an hour before kickoff, which is when the
-- adjusted prediction would be shown.
--
-- Read-only. Run in the SQL editor (or the Supabase connector) and save the
-- result as .backtest-cache/lineup-features.json (an array of these rows).

with games as (
  select m.id, m.league_code, m.kickoff, m.home_team_id, m.away_team_id, m.home_name, m.away_name
    from public.matches m
    join public.match_details d on d.match_id = m.id and d.has_lineups and d.finished
   where m.status = 'finished'
     and m.league_code in ('premier-league', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1')
     and m.kickoff >= '2024-07-01'
), sides as (
  select g.id, g.kickoff, 'home' as side, g.home_team_id as team from games g
  union all
  select g.id, g.kickoff, 'away', g.away_team_id from games g
), prior as (
  -- each side's previous six games with lineups (any competition)
  select s.id, s.side, p.match_id, p.pside
    from sides s
    cross join lateral (
      select m.id as match_id, case when m.home_team_id = s.team then 'home' else 'away' end as pside
        from public.matches m
        join public.match_details d on d.match_id = m.id and d.has_lineups
       where (m.home_team_id = s.team or m.away_team_id = s.team)
         and m.status = 'finished' and m.kickoff < s.kickoff
       order by m.kickoff desc
       limit 6
    ) p
), n_prior as (
  select id, side, count(*) as n from prior group by id, side
), usage as (
  select pr.id, pr.side, lp.player_id,
         count(*) filter (where lp.role = 'starter') as starts
    from prior pr
    join public.match_lineup_players lp on lp.match_id = pr.match_id and lp.side = pr.pside
   group by pr.id, pr.side, lp.player_id
), output as (
  select pr.id, pr.side, s.player_id, sum(coalesce(s.xg, 0) + coalesce(s.xa, 0)) as xgxa
    from prior pr
    join public.player_match_stats s on s.match_id = pr.match_id and s.side = pr.pside
   group by pr.id, pr.side, s.player_id
), team_out as (
  select id, side, sum(xgxa) as total from output group by id, side
), regulars as (
  select u.id, u.side, u.player_id, u.starts::numeric / np.n as share,
         coalesce(o.xgxa, 0) as xgxa, pl.usual_position
    from usage u
    join n_prior np on np.id = u.id and np.side = u.side and np.n >= 3
    left join output o on o.id = u.id and o.side = u.side and o.player_id = u.player_id
    join public.players pl on pl.id = u.player_id
   where u.starts::numeric / np.n >= 0.5
), missing as (
  select r.* from regulars r
   where not exists (
     select 1 from public.match_lineup_players lp
      where lp.match_id = r.id and lp.side = r.side and lp.player_id = r.player_id and lp.role = 'starter'
   )
), feats as (
  select np.id, np.side, np.n,
         (select count(*) from regulars r where r.id = np.id and r.side = np.side) as regulars,
         coalesce(least(1, sum(m.xgxa) / nullif(t.total, 0)), 0) as attack_loss,
         coalesce(sum(m.share) filter (where m.usual_position in (0, 1)), 0) as defence_loss,
         coalesce(bool_or(m.usual_position = 0), false) as keeper,
         count(m.player_id) as missing
    from n_prior np
    left join missing m on m.id = np.id and m.side = np.side
    left join team_out t on t.id = np.id and t.side = np.side
   where np.n >= 3
   group by np.id, np.side, np.n, t.total
)
select g.league_code as league, g.kickoff::date as day, g.home_name as home, g.away_name as away,
       round(h.attack_loss::numeric, 4) as h_att, round(h.defence_loss::numeric, 3) as h_def, h.keeper as h_gk, h.missing as h_miss,
       round(a.attack_loss::numeric, 4) as a_att, round(a.defence_loss::numeric, 3) as a_def, a.keeper as a_gk, a.missing as a_miss
  from games g
  join feats h on h.id = g.id and h.side = 'home'
  join feats a on a.id = g.id and a.side = 'away'
 order by g.kickoff;
