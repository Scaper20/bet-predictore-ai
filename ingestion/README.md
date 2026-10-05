# BetriX ingestion

Scheduled jobs that bring third-party sports data into Supabase, so pages read
the database instead of calling provider APIs while they render.

```
TheSportsDB (paid)  ─┐
football-data.org   ─┤   GitHub Actions (Python, this package)      Supabase
ESPN (soccerdata)   ─┼─▶ fixtures · results · tables · Elo     ──▶  matches, standings,
football-data.co.uk ─┤   backfills (openfootball, CSVs, ClubElo)    historical_results,
openfootball, ClubElo┘                                              odds_snapshots, elo_ratings
                                                                     │
TheSportsDB live ──▶ Supabase Edge Function (pg_cron, 1/min while games are on) ──▶ matches
SportyBet, Odds API ─▶ /api/cron/odds-snapshot (pg_cron, hourly) ──▶ odds_boards
                                                                     │
                                         Next.js pages ◀─────────────┘  (site_settings.data_layer)
```

## What each source does

| Source | How | Role |
|---|---|---|
| TheSportsDB | paid key, REST | **The only source of scores**: fixtures, results, tables, live scores, club lists (with alternate names and badges). Its club names are the canonical ones. |
| football-data.org | free key, REST | Fixtures (matchdays) and tables for its 12 competitions. Scores not used (delayed on the free plan). |
| ESPN | `soccerdata` 1.9.1 | Fixture cross-check, NPFL and the internationals registered as custom leagues. No scores: soccerdata's ESPN match-sheet reader is broken for every league. |
| football-data.co.uk | free CSVs | European results plus Pinnacle and market-average opening/closing odds (10 seasons). |
| openfootball | CC0 files (git clone) | History: NPFL 2009–2026, CAF Champions League, UEFA Champions League, World Cup, Euros. |
| International results ([martj42](https://github.com/martj42/international_results)) | CC0 CSV | Every men's international since 1990 for BetriX's international competitions (≈23,000 games, ≈10,800 friendlies): World Cup qualifiers split by confederation, AFCON + qualifiers, Euro + qualifiers, Nations League, Copa América, Gold Cup, World Cup. Scores include extra time. |
| ClubElo | `soccerdata` | Daily Elo for European and South American clubs. No African clubs, so BetriX computes its own Elo for every league (`elo` job). |

Checked and not used: **Sofascore** (403 from GitHub's runners on every
request), **FotMob** (removed from soccerdata after 1.8.3; its API now returns a
web page), **Hudl/StatsBomb open data** (research event data for a few seasons;
its terms require their logo).

## Rules every job follows

- **One unit = one source × one competition**, recorded in `ingest_runs`. A
  failure is logged and the job moves on; one broken source never stops the
  rest. The process exits 0 even then, so check the Data health page, not the
  GitHub run colour.
- **Disable a source** from the admin Data health page (`ingest_sources.enabled`):
  jobs skip it without calling it.
- **Polite**: a minimum gap between requests per source (`http.MIN_GAP_SECONDS`),
  exponential backoff (2, 4, 8 s) on errors that might pass, no retry on a 4xx.
- **Raw first**: every response goes to `raw_payloads` before it is transformed,
  stored only when it changed since the last call, kept 90 days (live scores 7),
  and the latest payload per call is never deleted.
- **One club, one row**: `resolve.py` maps every spelling onto `teams` (alias →
  normalised name → curated renames in `aliases.json` → unique word-for-word
  containment → create or log). Containment is a guess, so it is narrow:
  whole words only ("Rayon Sports" is not "AS Port"), never on a generic word
  alone ("Sport", "Red Star"), never among national teams (Niger is inside
  Nigeria) or in the continental cup scopes, and never by TheSportsDB onto a
  club it created itself (AC Milan is not Inter Milan). Lookups (the Elo
  jobs) never store an alias. Cross-check sources (ESPN, football-data.org)
  never invent a club; an unknown name is logged in `unresolved_entities` and
  its game skipped.
- **Senior men only** in international competitions: TheSportsDB files U21,
  women's and Olympic games under International Friendlies; they are dropped.
- **Scores only from trusted sources**: `ingest_matches()` lets TheSportsDB (and
  openfootball / football-data.co.uk for finished history) set status and score.
  Everyone else can only add fixture details.
- **Gaps are flagged, never filled**: `season_coverage` notes short, partial and
  missing seasons (NPFL 2017-18, 2018-19 and 2022-23 abridged; 2019-20 never
  published).
- No third-party logos or editorial text reach the UI; only facts. Team badges
  come from TheSportsDB's club list, which the site already showed.

## Setup

```bash
cd ingestion
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

### Environment variables

| Name | Where | Needed for |
|---|---|---|
| `SUPABASE_URL` | GitHub secret, local | every job (without it, writes go to memory only) |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub secret, local | every job |
| `THESPORTSDB_API_KEY` | GitHub secret, Supabase function secret, Vercel | fixtures, results, tables, sync, live scores. The public key "123" is refused: it truncates every list. |
| `FOOTBALL_DATA_API_KEY` | GitHub secret, Vercel | football-data.org fixtures and tables (optional) |
| `INGEST_SECRET` | Supabase function secret + Vault `betrix_ingest_secret` | lets pg_cron call the live-scores function |
| `CRON_SECRET` | Vercel (already set) + Vault `betrix_cron_secret` | lets pg_cron call `/api/cron/odds-snapshot` |
| `SPORTYBET_SNAPSHOTS` | Vercel, set to `on` | SportyBet odds snapshots. **Off by default**: about 720 parse.bot credits a day. |
| `DATA_LAYER` | Vercel (optional) | overrides the admin switch (`live`, `db_fallback`, `db`) |
| `SOCCERDATA_DIR`, `OPENFOOTBALL_DIR` | set by the workflow | local caches |
| `INGEST_DRY_RUN=1` | local | same as `--dry-run` |

### Supabase, once

1. Run migrations `0029_data_layer.sql` to `0032_resolution_repair.sql`.
2. Deploy the live-scores function and its secrets:
   ```bash
   supabase functions deploy live-scores --no-verify-jwt
   supabase secrets set THESPORTSDB_API_KEY=... INGEST_SECRET=<random string>
   ```
3. In the SQL editor, store the five Vault secrets listed at the top of
   `0030_live_scores_cron.sql`. Until they exist the crons do nothing.
   `betrix_site_url` must be the address that answers without a redirect
   (`https://www.betrix.com.ng`): pg_net does not follow a 308.

### GitHub, once

Add the repository secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`THESPORTSDB_API_KEY`, `FOOTBALL_DATA_API_KEY` (Settings → Secrets and
variables → Actions). The schedules in `.github/workflows/ingest.yml` start on
their own; any job can also be run from the Actions tab (Run workflow).

## Running jobs

```bash
python -m betrix_ingest <job> [--league CODE ...] [--dry-run] [-v]
```

| Job | What it does | Schedule (UTC) |
|---|---|---|
| `sync` | competitions from the catalogue; TheSportsDB club lists, alternates, badges | Mondays 02:00 |
| `fixtures [--days 14] [--with-espn]` | next N days from TheSportsDB + football-data.org (+ ESPN cross-check) | 03:15, 11:15, 17:15; with ESPN 02:45 |
| `results [--days 2] [--full-season]` | finished games from TheSportsDB | 05:40 and hourly 14:40–23:40; whole season Mondays 04:30 |
| `tables` | league standings (not cups), TheSportsDB first, football-data.org where it has none | 06:50, 23:50 |
| `clubelo` | today's ClubElo ratings | 04:10 |
| `elo [--full]` | BetriX Elo for every league from the training results | 04:35 |
| `backfill-openfootball` | NPFL, CAF CL, UCL, World Cup, Euro history + coverage flags | manual, once |
| `backfill-football-data-uk [--seasons 25]` | European results (25 seasons) and opening/closing odds (last 10) | manual, once |
| `backfill-thesportsdb [--seasons 10]` | past seasons of every competition from TheSportsDB (paid key) | manual, once |
| `backfill-international-results [--since 1990-01-01]` | internationals for every international competition, friendlies included | manual once; weekly (last two years) Tuesdays 05:20 |
| `backfill-clubelo [--since 2016-07-01]` | ClubElo history for tracked clubs | manual, once |
| `prune` | expire old raw payloads (also runs daily in pg_cron) | — |

`--dry-run` fetches and transforms for real but writes to memory and prints
one line per unit, which is the quickest way to check a source by hand.

`ingestion/betrix_ingest/leagues.json` is generated from `src/lib/leagues.ts`
(`npx tsx scripts/export-leagues.ts`); a vitest test fails if they drift.

## Rolling it out without breaking anything

The site keeps calling the live APIs until you flip the switch.

1. Migrations, function, secrets (above).
2. Actions → Ingest sports data → Run workflow, in this order:
   `sync`, then `backfill-thesportsdb`, `backfill-international-results`,
   `backfill-openfootball`, `backfill-football-data-uk`, `backfill-clubelo`,
   then `fixtures`, `results --full-season`, `tables`, `elo --full`.
   `sync` must come first: it registers clubs under TheSportsDB's names, so the
   backfills resolve onto them instead of creating near-duplicates.
3. Check **Admin → Data health**: every competition has matches, nothing is
   failing, the unresolved list is short. Fix names via `aliases.json` or a
   `team_aliases` row and re-run the job.
4. Switch the data layer to **Database, with fallback**. Watch a match day.
5. Switch to **Database only**. Now no page calls a sports or odds API while it
   renders. **Live APIs** is one click away if anything looks wrong.

## Repairing merged clubs

If two clubs ever resolve to one row (Data health: a table fails with
"ON CONFLICT DO UPDATE command cannot affect row a second time", or a
duplicate looks wrong):

1. Delete the wrong `team_aliases` rows, including the `id:<source>` ones
   that point the other club's id at the merged row.
2. Delete the matches filed under the merged club (and, for leagues whose
   `history_owner` is `matches`, their `historical_results` rows from
   `thesportsdb` / `openfootball`). Nothing references a match by its uuid;
   predictions and slips use the source ids, which come back on the rerun.
3. Rerun `sync`, then `backfill-thesportsdb --league <codes>`,
   `backfill-openfootball` (for its leagues), `results --full-season`,
   `fixtures`, `tables`, `elo --full`.

Add the spelling to `aliases.json` if a rule can't tell the clubs apart.
The October 2026 repair (PSG into Paris FC, AC Milan into Inter, Aves into
Chaves, African cup clubs into "AS Port") followed exactly these steps and
rebuilt both club cups.

## Free-tier usage (estimated)

| Platform | Free limit | Estimated use | |
|---|---|---|---|
| GitHub Actions | unlimited minutes on a public repo (2,000/month private) | ~37 min/day ≈ **1,100 min/month**: fixtures 3×2, ESPN 12, results 11×1, tables 2×2, ClubElo 1, Elo 2, weekly jobs ~1 | ✅ |
| Supabase Edge Functions | 500,000 invocations/month | 1/min only while games are on: ~12h on weekend days, ~6h on weekdays ≈ **14,000/month**; worst case (a game every minute of the month) 43,200 | ✅ |
| Supabase database | 500 MB | 16 MB today → **~250 MB**: odds_snapshots ~80 MB (10 seasons, 2 books), matches + training ~70 MB (25 seasons of Europe, 23k internationals, TheSportsDB history), raw payloads 30–60 MB, Elo ~20 MB | ✅ |
| Supabase egress | 5 GB/month | jobs write small batches; pages read cached lists | ✅ |
| pg_cron | no limit | 43,200 cheap checks/month + 720 odds triggers | ✅ |
| Vercel Hobby | daily crons only; 1M invocations | crons unchanged (5 daily); odds route 720 calls/month | ✅ |
| TheSportsDB (paid) | 100 requests/min | ~15 per fixtures run, 3 per results run, ~25 per weekly job | ✅ |
| football-data.org | 10 requests/min | 24 per fixtures run, spaced 7 s | ✅ |
| The Odds API | 500 credits/month | paced to ≤ 460 (reserve 40) | ✅ |
| parse.bot (SportyBet) | metered | **off**; ~720 credits/day if `SPORTYBET_SNAPSHOTS=on` | ⚠️ your call |
