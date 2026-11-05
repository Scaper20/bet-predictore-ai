-- 0099: the match page's top picks, frozen with the headline pick.
--
-- predictions_log already freezes the headline (one row per game, first write
-- wins, nothing edits it but settlement). The other top picks on the match
-- page were rebuilt on every read, so they could shift as SportyBet's board,
-- the selection switches or a deploy moved. From the ordered-picks cutover
-- (src/lib/top-picks.ts TOP_PICKS_ORDER_FROM) the settle cron stores the
-- picks it published here, and every page serves exactly those.
--
-- Additive and nullable: rows before the cutover keep null and the old behaviour.
-- No new table, so no new grants; the table's existing policies apply.

alter table public.predictions_log add column if not exists top_picks jsonb;
