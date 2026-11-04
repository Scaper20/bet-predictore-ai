-- Live Code Hub record: every published code graded on final scores (audit, Nov 2026).
-- A whole-line handicap that refunds counts as a win. Read-only.
-- Run in the Supabase SQL editor or through the MCP execute_sql tool.
with g as (
 select c.day, c.tier, c.odds, c.probability, l->>'market' mk, (l->>'probability')::numeric lp, m.status,
  case when m.status<>'finished' then null else
   case
    when l->>'market'='1x2:home' then case when m.home_goals>m.away_goals then 'w' else 'l' end
    when l->>'market'='1x2:away' then case when m.away_goals>m.home_goals then 'w' else 'l' end
    when l->>'market'='1x2:draw' then case when m.away_goals=m.home_goals then 'w' else 'l' end
    when l->>'market'='dc:home-draw' then case when m.home_goals>=m.away_goals then 'w' else 'l' end
    when l->>'market'='dc:away-draw' then case when m.away_goals>=m.home_goals then 'w' else 'l' end
    when l->>'market'='dc:home-away' then case when m.home_goals<>m.away_goals then 'w' else 'l' end
    when l->>'market'='btts:yes' then case when m.home_goals>0 and m.away_goals>0 then 'w' else 'l' end
    when l->>'market' ~ '^ou:over:' then case when m.home_goals+m.away_goals > split_part(l->>'market',':',3)::numeric then 'w' else 'l' end
    when l->>'market' ~ '^ou:under:' then case when m.home_goals+m.away_goals < split_part(l->>'market',':',3)::numeric then 'w' else 'l' end
    when l->>'market' ~ '^ah:home:' then case when m.home_goals-m.away_goals+split_part(l->>'market',':',3)::numeric>0 then 'w' when m.home_goals-m.away_goals+split_part(l->>'market',':',3)::numeric=0 then 'p' else 'l' end
    when l->>'market' ~ '^ah:away:' then case when m.away_goals-m.home_goals+split_part(l->>'market',':',3)::numeric>0 then 'w' when m.away_goals-m.home_goals+split_part(l->>'market',':',3)::numeric=0 then 'p' else 'l' end
   end end res
 from code_hub_codes c cross join lateral jsonb_array_elements(c.legs) l
 left join match_results m on m.match_id = l->>'matchId'
), code as (
 select day, tier, odds, probability, count(*) legs, count(*) filter (where res='l') lost, count(*) filter (where res is null) open
 from g group by day, tier, odds, probability
)
select tier, count(*) codes,
 count(*) filter (where lost>0 or open=0) settled,
 count(*) filter (where lost=0 and open=0) won,
 round(sum(probability) filter (where lost>0 or open=0)::numeric,2) expected_wins,
 round(avg(odds) filter (where lost>0 or open=0),2) avg_odds,
 round(sum(case when lost=0 and open=0 then odds else 0 end) filter (where lost>0 or open=0) - count(*) filter (where lost>0 or open=0),1) net_units
from code group by tier order by tier::int;
