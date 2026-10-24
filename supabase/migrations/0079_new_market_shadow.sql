-- New goal markets, watched before any is a pick (src/lib/model/shadow.ts newMarketShadow).
--
-- The code reader now prices halves, goal bounds and the like off the model
-- (src/lib/odds/raw-grades.ts). The likeliest of them, both halves over 0.5,
-- each half over 0.5, goal bounds 0-3 and 1-4, are logged here with reason
-- 'new-market' whenever the model has them at 60% or more, and graded with
-- the half-time score, so each can earn a place among the picks on a live
-- record (200 graded, calibrated within 4 points) instead of a replay.
--
-- No new table: shadow_picks keeps its grants from 0059 / 0063.

alter table public.shadow_picks drop constraint if exists shadow_picks_reason_check;
alter table public.shadow_picks
  add constraint shadow_picks_reason_check check (reason in ('paused-handicap', 'btts', 'market-total', 'new-market'));
