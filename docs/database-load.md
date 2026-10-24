# Database load: what the numbers said, October 2026

Prompted by Supabase's "your project is depleting its Disk IO Budget" email
(24 October), then by the Supabase assistant's list of write-heavy functions.
What was measured, what was changed, and what is still unknown.

Counters: `pg_stat_statements` since 21 August (64 days), `pg_stat_database`
and `pg_stat_io` since 24 July (92 days).

## Short version

- **Nothing the database does is big enough to explain a disk-budget alarm on
  its own.** The write-heavy functions are real waste, but together they are
  1.7 GiB of WAL in 64 days: about 27 MiB a day, 0.3 KB a second. Reads are 100%
  cached. Fixing them is hygiene; it is not the cure.
- **The database does stall now and then.** Trivial statements that average
  under a millisecond occasionally take over a second (below). That is the
  signature of an instance waiting on disk or CPU, which Postgres's own counters
  cannot show.
- **So the missing evidence is the instance's own charts**, and they are not
  reachable from SQL or the logs. See "Look here next".

## What the database is actually doing

- **Query work is small.** All statements together take about 940 seconds of
  execution time a day: roughly 1% of one CPU core. Cache hit rate is 99.995%
  (1.2 billion hits, 56,100 reads).
- **Data-file disk IO is small.** Since July: 4.0 GB written by checkpoints,
  214 MB read by clients, 190 MB read by autovacuum. The 15 statements that write
  the most account for 1.7 GiB of WAL since 21 August.
- **Temporary files are the one large number.** `pg_stat_database` counts 57 GB
  in 30,731 files since July: queries too big for their 2 MB of working memory
  (`work_mem` is 2,184 kB) spilling to disk. Statements account for only 7.3 GB
  of it since 21 August, so most of the rest predates that (backfills and index
  builds spill too; not verified). Of the 7.3 GB, `team_recent_results` is
  6.3 GB written and 6.3 GB read back over 157,491 calls: 84%.
- **Rare multi-second stalls on trivial statements.** Only four frequent
  statements (over 5,000 calls, mean under 20 ms) have ever passed one second.
  Two are single-row updates by primary key, which cannot be slow by cost:

  | Statement | Calls | Mean | Slowest |
  |---|---|---|---|
  | `profiles.last_seen_at` update | 207,621 | 0.8 ms | 1,416 ms |
  | `cron.job_run_details` update | 33,430 | 0.5 ms | 1,272 ms |

  The other two are ordinary reads (a `team_aliases` lookup, 17 ms mean and
  1,568 ms slowest, and the head-to-head lookup that `0075` indexed), so they are
  weaker evidence. A live `EXPLAIN ANALYZE` of a fully cached index scan (4,744
  buffer hits each time) took 10 ms and 71 ms on two runs and 2,088 ms on a
  third. One sample proves nothing; the two primary-key updates, at 1,700 and
  2,500 times their mean, say the same thing.
- **The load follows match-day traffic.** 24 October: 2,000 to 8,000 API
  requests an hour overnight, 20,000 to 30,000 an hour from 14:00 to 19:00 UTC,
  with up to 10,000 writes an hour and checkpoints taking up to 4.5 minutes.
  269,000 requests in 24 hours.

## Where the writes come from

WAL by statement since 21 August, largest first. Postgres only attributes a
trigger's work to the statement that fired it.

| Statement | Calls | WAL | What it is | Status |
|---|---|---|---|---|
| `ingest_matches` | 5,029 | 388 MiB | every ingested fixture or result rewrites its match, changed or not | not changed |
| `store_raw_payload` | 19,006 | 296 MiB | 12,617 inserts (a new live-feed snapshot each minute it changed) and 6,389 no-op bumps of `last_seen_at` | `0076` stops the bumps; the inserts are real data |
| Elo ratings upsert | 1,798 | 282 MiB | the Elo job re-sends the last 14 days of every club each run: 456,614 updates against 234,754 rows | not changed |
| `upsert_historic_odds` | 340 | 232 MiB | 117,764 updates against 211,615 rows, setting the prices they already had | `0076` |
| `upsert_historical_results` | 107 | 148 MiB | 111,003 updates, re-setting the same score and statistics | `0076` |
| `matches` update from `live-scores` | 126,788 | 120 MiB | one PATCH per listed game per minute, about a third of them finished games the feed still lists | edge function skips unchanged |
| `match_results` upsert | 90,514 | 66 MiB | games whose score had not changed | fixed in code (live) |
| `prune_raw_payloads` | 19 | 52 MiB | the daily delete, about 380 rows | fine |

## Waste found, and fixed

| Source | Fix | Where |
|---|---|---|
| `profiles` last-seen update from the proxy, one per page request, almost all no-ops (19,400 a day) | `lib/last-seen.ts`: skip when this instance recorded the user in the last 10 minutes | code, live |
| `match_results` upserts of games whose score had not changed (22,300 a day) | `captureMatchResults` writes only a game whose status or score changed | code, live |
| `site_settings` reads (data-layer switch every 30 s per instance, maintenance every 10 s; 24,600 a day) | 60 s caches for both | code, live |
| Head-to-head lookup on `historical_results` with no index, 69 statement timeouts a day | index on `(home_name, away_name, kickoff desc)` (177 scans so far) | `0075`, applied |
| `cron.job_run_details` growing by about 3,000 rows a day | daily prune to two days | `0075`, applied (first prune runs 03:31 UTC) |
| `team_recent_results` sorted every finished game of every club asked for, then kept the newest few; a 150-club chunk sorts 11,000 rows in 2,040 kB of 2,184 kB, so a slightly longer chunk spills | per-club newest-few from each side through the existing indexes; largest sort 26 kB, 38 ms instead of 139 ms | `0076` |
| `upsert_historic_odds`, `upsert_historical_results` ran an UPDATE on rows already right | skip a row the UPDATE would not change | `0076` |
| `store_raw_payload` bumped `last_seen_at` and `retain_until` on every unchanged live feed, once a minute | refresh an unchanged payload at most hourly | `0076` |
| `live-scores` re-wrote every game in the feed every minute, and each write set `updated_at`, which wakes the push check (`0074`) for slips on a finished game | skip a game whose status, minute, score and score source are as stored (`unchanged.ts`) | edge function, **needs redeploy** |

`0076` was checked before writing it: the new `team_recent_results` returns the
same rows as the old one on four call shapes (a 150-club chunk, a league at 5
and at 20 games each, one game each), except where two stored copies of one game
share a kickoff, which now come back in a fixed order (by match id); the guards
were planned with `EXPLAIN` and show up as `Conflict Filter`.

## Tested and ruled out

- **The `mirror_finished_match` trigger** fires on every PATCH that names
  `status` or the score, changed or not, and rewrites `historical_results`. It
  looked like the source of that table's 111,003 updates. Across two live-score
  runs (32 PATCHes, 5 of them finished games a minute) `historical_results` took
  **zero** updates: the games being re-PATCHed are not in a competition whose
  history this table owns (21 are). It is not a meaningful source, so it is
  untouched. All 40,585 finished games in those competitions are in history with
  matching scores, so nothing leans on the trigger as a repair path either.
- **Realtime replication**: no replication slots or publications exist.
- **The rest of the temp-file traffic is not the app**: Supabase Studio's own
  function-list query (85 runs, 0.8 GB) and a handful of one-off duplicate-game
  checks that join `matches` to itself (6 to 11 s each, about 80 MB between them).

## Not done, and why

- **`ingest_matches` and the Elo upsert** are the two biggest writers (388 and
  282 MiB in 64 days: about 10 MiB a day between them). `ingest_matches` has three
  update branches and a merge path; guarding each against "same values" needs its
  own care and a staging database to test on, for a saving that cannot matter at
  this scale. The Elo job could skip rows identical to what is stored (read the
  window, diff, write the rest) with no database change. Worth doing only if the
  charts point at writes.
- **`prune_raw_payloads`** is 52 MiB over 19 runs (about 2.7 MiB a day), not
  worth bounding.
- **`store_raw_payload` inserts**: a full live-feed snapshot each minute it
  changes is most of that function's writing (two thirds of its calls, and each
  one stores the whole payload). Nothing reads `raw_payloads` except retention; if
  the archive is not wanted, storing the live feed every five minutes instead
  would cut those inserts by four fifths. A product choice.
- **`dispatchSlips` writes a claim for every open slip on each run**, even when
  nothing changed. With tens of tracked slips that is negligible; at hundreds it
  would matter. It also depends on `updated_at` no longer being bumped by the
  feed (the edge function change above).
- **`auth.getUser()` on every page request** (22,000 round trips to the auth
  server a day). Supabase's `getClaims()` verifies the token locally. Worth doing,
  but it touches the sign-in path, so it wants its own careful change.
- **`live-scores` still makes one PATCH per changed game.** One batched call per
  run would cut the commits further; it needs a small SQL function as well.

## Look here next

Supabase's own guidance (High Disk I/O) says the first stop is the dashboard:

1. **Observability overview, "Disk IO balance"**: average remaining burst
   balance. 100% is full, 0% is exhausted.
2. **Project settings, Infrastructure**: the lowest balance in the last seven
   days, with its chart. If "Disk IO % consumed" is over 1%, the workload used
   more than the baseline that day.
3. **Memory and swap** (Observability, or Grafana). Every project has 1 GB of
   disk for swap; on a small instance, memory pressure turns into disk IO that
   `pg_stat_io` never counts. `shared_buffers` is 224 MB and `effective_cache_size`
   384 MB, which reads as a 1 GB instance.
4. **Compute size.** Burst limits only apply to compute up to 2XL, and the
   baseline is what the instance falls back to once the budget is spent. If the
   charts show the budget draining on match days after these changes, the
   instance is small for the traffic and the next step is a larger compute add-on.

## Apply

1. `0075` is applied.
2. Run `supabase/migrations/0076_quieter_database.sql` in the SQL editor. It
   only replaces functions.
3. Redeploy the edge function: `supabase functions deploy live-scores`.

Check afterwards:

    -- the next live-scores runs should write fewer rows than they list
    select created, content from net._http_response order by created desc limit 5;
    -- historical_results updates per day should fall to the number of real changes
    select n_tup_upd from pg_stat_user_tables where relname = 'historical_results';
    -- no more spills: temp_bytes should stop climbing between two looks
    select temp_files, pg_size_pretty(temp_bytes) from pg_stat_database where datname = current_database();
