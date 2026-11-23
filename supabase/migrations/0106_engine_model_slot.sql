-- The model's own pick beside the headline engine's (docs/live-audit-2026-11-23.md).
--
-- Since 31 Oct 2026 the engine's pick is published on every game it covers, and
-- nothing kept what the model itself (sweet spots and ranking) would have
-- published, so the two could not be compared live. The settle cron now logs
-- that pick as slot 'model', graded like every other engine row. No new table,
-- so no new grants: engine_picks keeps its service-role-only access (0082).

alter table public.engine_picks drop constraint if exists engine_picks_slot_check;
alter table public.engine_picks
  add constraint engine_picks_slot_check
  check (slot in ('headline', 'result', 'goals', 'team-goals', 'corners', 'shots', 'model'));
