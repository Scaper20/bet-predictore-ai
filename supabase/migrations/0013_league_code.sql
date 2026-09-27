-- Key stored fixtures on the league CODE, not the provider's display string.
--
-- predictions_log.league and match_results.league hold `match.league.name`,
-- which every adapter takes from the provider first and only falls back to our
-- catalogue (api-football.ts:98, football-data.ts:99, thesportsdb.ts:146). So
-- the column holds whatever the feed that happened to answer called the
-- competition, and the three feeds disagree about all of them:
--
--   catalogue name              stored strings actually observed
--   English Premier League      "Premier League"
--   Italian Serie A             "Serie A"
--   Spanish La Liga             "Primera Division", "La Liga"
--   Brazilian Série A           "Campeonato Brasileiro Série A"
--   English Championship        "Championship", "English League Championship"
--
-- Not one catalogue name appears in the log. Every consumer that looks a
-- league up by LeagueDef.name -- the For You league strip, the track record's
-- best-league line -- therefore matches nothing and renders "not enough
-- settled picks yet" against 81 graded picks.
--
-- The string cannot be repaired in place, because it is not a key. The log
-- holds "Primera Division" (Spain, from football-data) beside "Argentinian
-- Primera Division" and "Chile Primera Division"; match_results holds both
-- "Primera Division" and "Primera División". A name match tight enough to
-- separate Spain from Argentina is one accent away from missing half of Spain.
--
-- match.league.code is already the stable slug and is already carried on every
-- fixture. It just was never written down.

alter table public.predictions_log
  add column if not exists league_code text;

alter table public.match_results
  add column if not exists league_code text;

-- Nullable, unlike 0009's sport and 0012's model_id, and deliberately so.
-- Those had a defensible default because every existing row genuinely had the
-- one value. This one does not: the feeds carry plenty of competitions that
-- are not in src/lib/leagues.ts at all -- "MLS Next Pro", "Polish Cup",
-- "Greek Football Cup" all appear in match_results -- and those rows have no
-- code, now or ever. NULL means "outside the catalogue", which is a fact about
-- the fixture, not a gap in the backfill.
--
-- Historical rows are repaired by scripts/backfill-league-codes.ts rather than
-- here: resolving a provider string to a slug needs the alias table in
-- src/lib/leagues.ts, which is unit-tested and where a future alias will
-- actually get added. A copy of it frozen into a migration would rot.

-- The read pattern is "this league, most recent first" -- per-league
-- performance on the track record and the For You league strip both scan by
-- recency within a competition.
create index if not exists predictions_log_league_kickoff_idx
  on public.predictions_log (league_code, kickoff desc);

create index if not exists match_results_league_kickoff_idx
  on public.match_results (league_code, kickoff desc);

-- RLS is unchanged: both tables stay publicly readable with service-role-only
-- writes. Which competition a fixture belongs to is not user data.
