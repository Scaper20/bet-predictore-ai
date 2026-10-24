# Database load: what the numbers said, October 2026

Prompted by Supabase's "your project is depleting its Disk IO Budget" email
(24 October). What was measured, what was changed, and what is still unknown.

## What the database is actually doing

Read from `pg_stat_statements`, `pg_stat_io` and the project logs:

- **Query work is small.** All statements together take about 940 seconds of
  execution time a day: roughly 1% of one CPU core. Cache hit rate is 100%.
- **Data-file disk IO is small.** Since July: about 4 GB written by
  checkpoints, 214 MB read by clients, 2.4 GB of WAL. Temporary files (queries
  too big for their 2 MB of working memory spilling to disk) were 7 GB since
  21 August, mostly the `team_recent_results` function.
- **The load follows match-day traffic.** 24 October: 2,000 to 8,000 API
  requests an hour overnight, 20,000 to 30,000 an hour from 14:00 to 19:00
  UTC, with up to 10,000 writes an hour and checkpoints taking up to 4.5
  minutes. 269,000 requests in 24 hours.

None of that, on its own, accounts for a disk-budget alarm. The instance-level
disk, memory and swap charts (Supabase dashboard, Reports, Database) are the
missing evidence; they are not reachable from the database or the logs.

## Waste found, and fixed in code

| Source | Requests a day | Fix |
|---|---|---|
| `profiles` last-seen update from the proxy, one per page request, almost all no-ops | 19,400 | `lib/last-seen.ts`: skip the call when this instance recorded the user in the last 10 minutes |
| `match_results` upserts of games whose score had not changed (live board and slip polls) | 22,300 | `captureMatchResults` writes only a game whose status or score changed |
| `site_settings` reads (data-layer switch every 30 s per instance, maintenance every 10 s) | 24,600 | 60 s caches for both |
| Head-to-head lookup on `historical_results` with no index, 69 statement timeouts a day | 17,600 reads | `0075`: index on `(home_name, away_name, kickoff desc)` |
| `cron.job_run_details` growing by about 3,000 rows a day | | `0075`: daily prune to two days |

## Not done, and why

- **`matches` updated one request per live game per minute** by the
  `live-scores` Edge Function (16,700 requests a day, each its own commit). One
  batched call per run would cut the commits about tenfold. Needs the function
  redeployed and a small SQL function.
- **`auth.getUser()` on every page request** (22,000 round trips to the auth
  server a day). Supabase's `getClaims()` verifies the token locally. Worth
  doing, but it touches the sign-in path, so it wants its own careful change.
- **`team_recent_results`** ranks every finished game of each team with a
  window function and spills to disk at 2 MB of working memory. A per-team
  top-N with a composite index avoids the sort. About 60 seconds of database
  time a day: low priority.
- **Compute size.** If the dashboard charts still show the budget draining
  after these changes, the instance is simply small for match-day traffic and
  the next step is a larger compute add-on.

## Apply

`supabase/migrations/0075_database_load_relief.sql` in the SQL editor. Check
the head-to-head query uses the index afterwards:

    explain select league_code, kickoff, home_name, away_name, home_goals, away_goals
      from historical_results
     where home_name = any (array['Arsenal','Arsenal FC']) and away_name = any (array['Chelsea','Chelsea FC'])
     order by kickoff desc limit 30;
