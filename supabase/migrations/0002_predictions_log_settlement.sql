-- BetriX — Track Record page support
--
-- 0001 uniquely keyed predictions_log on (match_id, market), but the app only
-- ever logs one headline pick per fixture (the same "top selection" shown
-- across the site), and that pick can shift market right up to kickoff as
-- more data comes in. A (match_id, market) key meant a pick that changed
-- market pre-kickoff would insert a second, orphaned row instead of updating
-- the first. (match_id) alone is the correct identity: one row per fixture,
-- upserted freely until kickoff, then settled once and left alone — kickoff
-- moving into the past drops it out of the "upcoming" query that does the
-- upserting, so a settled row is never touched again.
--
-- Team names are also added: match_id and league alone aren't enough to
-- render a human-readable row on a public trust page.

drop index if exists public.predictions_log_match_market_key;
create unique index predictions_log_match_id_key on public.predictions_log (match_id);

alter table public.predictions_log
  add column if not exists home_name text not null default '',
  add column if not exists away_name text not null default '';
