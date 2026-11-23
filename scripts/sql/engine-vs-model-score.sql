-- The headline engine against the model's own pick (sweet spots and ranking), on
-- the same games: engine_picks slot 'model' (0106) beside the published pick in
-- predictions_log (the engine's, while app_switches.headline_engine is on).
-- Paired, so a game counts only where both picks are graded win or lose; the last
-- row is engine minus model in points of hit rate, with a 95% half-width, and the
-- same for return at SportyBet's price where both picks had one.
-- Decide after about 300 paired games (the engine's own shadow plan).
with pair as (
  select p.match_id, p.market engine_market, m.market model_market,
         (p.result = 'win')::int ew, (m.result = 'win')::int mw,
         p.probability ep, m.probability mp,
         case when p.price_at_publish > 1 then case when p.result = 'win' then p.price_at_publish - 1 else -1 end end er,
         case when m.price > 1 then case when m.result = 'win' then m.price - 1 else -1 end end mr
    from public.predictions_log p
    join public.engine_picks m on m.match_id = p.match_id and m.slot = 'model'
   where p.result in ('win', 'lose') and m.result in ('win', 'lose')
)
select 'engine (published)' pick, count(*) games, round(100.0 * avg(ew), 1) landed, round(100 * avg(ep), 1) stated, round(100 * avg(er), 1) "return %"
  from pair
union all
select 'model (sweet spots)', count(*), round(100.0 * avg(mw), 1), round(100 * avg(mp), 1), round(100 * avg(mr), 1)
  from pair
union all
select 'engine - model', count(*), round(100.0 * avg(ew - mw), 1), round((196 * stddev_samp(ew - mw) / sqrt(count(*)))::numeric, 1),
       round(100 * avg(er - mr), 1)
  from pair
union all
select 'same pick on', count(*) filter (where engine_market = model_market), null, null, null
  from pair;
