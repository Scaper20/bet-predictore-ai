-- Tag stored fixtures with the sport they belong to.
--
-- predictions_log and match_results both key competitions by a plain text
-- league name with nothing to say which sport it is, so "Premier League"
-- would collide the moment a second sport arrives with a similarly-named
-- competition -- and every historical aggregate in admin-analytics.ts would
-- silently blend them.
--
-- DEFAULT 'football' rather than a nullable column and a backfill: every
-- existing row genuinely is football, so there is nothing to disambiguate
-- and no window where the column means "unknown".

alter table public.predictions_log
  add column if not exists sport text not null default 'football';

alter table public.match_results
  add column if not exists sport text not null default 'football';

-- The read pattern is always "this sport, most recent first" -- the track
-- record page and the admin performance aggregates both scan by recency
-- within a sport, never across all sports at once.
create index if not exists predictions_log_sport_kickoff_idx
  on public.predictions_log (sport, kickoff desc);

create index if not exists match_results_sport_kickoff_idx
  on public.match_results (sport, kickoff desc);

-- RLS is unchanged: both tables stay publicly readable with service-role-only
-- writes. A sport label is not user data and does not change who may see what.
