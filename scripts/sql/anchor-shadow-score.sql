-- Scores the anchoring shadow run: mean log loss of the model as served, the model
-- anchored halfway to the SportyBet price, and the de-vigged price itself, on games
-- that have finished. Lower is better. Enable anchoring only if "anchored" beats
-- "plain" by clearly more than its interval over a few hundred games (L1 in the audit:
-- about 0.005 on 1X2 on football-data prices).
with g as (
  select s.*, r.home_goals hg, r.away_goals ag
  from public.anchor_shadow s join public.match_results r on r.match_id = s.match_id
  where r.home_goals is not null and r.away_goals is not null
), l as (
  select *,
    case when hg > ag then 'home' when hg = ag then 'draw' else 'away' end res,
    (hg + ag) > 2.5 as over
  from g
)
select count(*) games,
  round(avg(-ln((plain ->> res)::float))::numeric, 4)    plain_1x2,
  round(avg(-ln((anchored ->> res)::float))::numeric, 4) anchored_1x2,
  round(avg(-ln((market ->> res)::float))::numeric, 4)   price_1x2,
  round(avg(-ln(case when over then (plain ->> 'o25')::float else 1 - (plain ->> 'o25')::float end))::numeric, 4)    plain_o25,
  round(avg(-ln(case when over then (anchored ->> 'o25')::float else 1 - (anchored ->> 'o25')::float end))::numeric, 4) anchored_o25,
  round(avg(-ln(case when over then (market ->> 'o25')::float else 1 - (market ->> 'o25')::float end))::numeric, 4)   price_o25,
  round((stddev_samp(ln((anchored ->> res)::float) - ln((plain ->> res)::float)) / sqrt(count(*)))::numeric, 4) se_1x2_diff
from l;
