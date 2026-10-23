-- Market-informed totals, watched before they are used (src/lib/model/market-total.ts).
--
-- For each published game with a SportyBet price, the expected total goals
-- is taken from SportyBet's de-vigged over/under 2.5 (the model's home/away
-- split kept), and the over/under 1.5 and 3.5 leans are logged as shadow
-- picks with reason 'market-total'. `model_probability` holds the model's own
-- chance of the same selection, so /admin/model-performance can compare the
-- two on the same games by log loss before any of it reaches a pick.
--
-- No new table: shadow_picks keeps its grants from 0059 / 0063.

alter table public.shadow_picks add column if not exists model_probability numeric;

alter table public.shadow_picks drop constraint if exists shadow_picks_reason_check;
alter table public.shadow_picks
  add constraint shadow_picks_reason_check check (reason in ('paused-handicap', 'btts', 'market-total'));
