-- 0101: the half-time score, kept with the final score.
--
-- Markets settled on the halves (1st half over 0.5, 2nd half over 0.5, both
-- halves over 0.5) need the half-time score. Until now it came only from the
-- results archive's goal timelines, filled nightly, so such a pick could not
-- settle until the next day. The settlement route now stores the score while a
-- game is at the break (the score at the break is the half-time score), and
-- football-data's own half-time score when it has one.
--
-- Additive and nullable, on a table that already has its policies: no new
-- table, so no new grants.

alter table public.match_results
  add column if not exists ht_home integer,
  add column if not exists ht_away integer;
