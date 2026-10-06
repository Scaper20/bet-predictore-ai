-- Two-tier track record: every published pick, and the Strong picks among them.
--
-- A pick is Strong when the model's confidence is 60 or more AT THE TIME IT
-- IS LOGGED, before kickoff. Both columns are written by the logging cron
-- (src/app/api/cron/settle-predictions/route.ts) and never after settlement.
--
-- Rows logged before this migration have no confidence on record, so they
-- stay null and are never counted as Strong. Classifying them now, with the
-- results known, would be choosing which past picks count, which is exactly
-- what the Strong record must not do. The Strong record starts here.
--
-- Threshold evidence (walk-forward, held-out 2025-26 + 2026-27, 3,314 picks,
-- goals-v2): confidence 60+ was 15% of picks and landed 80.1%, against 75.8%
-- for 50-60 and 70.6% for 40-50. See docs/strong-picks.md.

alter table public.predictions_log
  add column if not exists confidence smallint check (confidence between 0 and 100),
  add column if not exists pick_tier text check (pick_tier in ('strong', 'standard'));

create index if not exists predictions_log_tier_idx on public.predictions_log (pick_tier) where pick_tier = 'strong';
