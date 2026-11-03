# FotMob match data (Phase 1)

What it adds: lineups (with formations, ratings, minutes, substitutions),
every per-player stat FotMob measures, shots with xG and coordinates, the
match timeline, team stats, club profiles (squad, coach, venue, transfers,
honours) and who is out before kickoff, for the top five leagues, the
Champions League, Europa League and Conference League.

## Where things live

| Piece | File |
|---|---|
| Tables, bounded read functions | `supabase/migrations/0091_fotmob_match_details.sql`, `0092_team_player_usage.sql` |
| Ingestion (source, parsers, linking, jobs) | `ingestion/betrix_ingest/sources/fotmob.py`, `fotmob_writer.py`, `jobs.py`; README "FotMob" |
| Schedules and backfill | `.github/workflows/ingest.yml` (`fotmob-*` jobs) |
| Read layer | `src/lib/match-details.ts` (+ `match-details-core.ts`), `src/lib/team-page.ts` (+ `team-page-core.ts`) |
| Match page | Lineups tab, timeline, shot map, team stats, team news, player of the match, paid absences read |
| Club pages | `src/app/(app)/[sport]/team/[id]/page.tsx`, `src/components/team/` |
| Absences model and backtest | `src/lib/model/availability.ts`, `scripts/lineup-backtest.ts`, `docs/lineup-backtest.md` |
| Admin | Data health page: coverage per competition and the `fotmob_ui` switch |

## Timing: the live lane

Time-critical fetches run in the app, not on GitHub Actions (whose schedules start 5-25 minutes late): pg_cron calls `/api/cron/fotmob-live` every two minutes (`invoke_fotmob_live`, migration 0096), and only while a game needs it:

| Game state | Fetched | Then, in the same run |
|---|---|---|
| Kicks off within 90 min, eleven not confirmed | every 2 min until FotMob confirms it | player props projected and picks logged |
| In play | every 2 min | events, shots and stats on the match page |
| Finished, final player stats not in | every 2 min (every 20 min if FotMob has no player stats for it) | props settled |

So lineups, live events and final stats trail FotMob by about two minutes (the match page caches open games for 45 seconds). The Python jobs keep everything else: history, the 72-hour look-ahead with absences, club and player profiles, and a backstop for anything the lane missed. The lane writes exactly the rows the Python job writes: `src/lib/fotmob/parse.ts` is a port of `parse_match`, held to it by `src/lib/fotmob/parse.test.ts`, which compares both parsers on the saved responses in `ingestion/tests/fixtures/fotmob/`. When either parser changes, change the other and regenerate the expected output:

```bash
cd ingestion && python3 - <<'PY'
import gzip, json, dataclasses
from betrix_ingest.sources import fotmob as fm
from betrix_ingest.fotmob_writer import player_uuid
def norm(v):
    if dataclasses.is_dataclass(v): return {k: norm(x) for k, x in dataclasses.asdict(v).items()}
    if isinstance(v, dict): return {str(k): norm(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [norm(x) for x in v]
    return v.isoformat() if hasattr(v, "isoformat") else v
out = {}
for name in ["match_4193569", "match_old", "match_upcoming"]:
    d = norm(fm.parse_match(json.load(gzip.open(f"tests/fixtures/fotmob/{name}.json.gz"))))
    d["players"] = sorted(d["players"].values(), key=lambda p: p["fotmob_id"])
    out[name] = d
out["_uuids"] = {str(i): player_uuid(i) for i in (737066, 1, 30981)}
json.dump(out, open("../src/lib/fotmob/__fixtures__/python-parse.json", "w"), indent=0, sort_keys=True)
PY
```

Switching the `fotmob` source off in `ingest_sources` stops the lane as well as the Python jobs. Quiet runs are not logged; runs that fetched something show as `fotmob-live` on Data health.

## Rules that keep it safe

- **Facts free, analysis paid.** Lineups, events, stats, shot maps and club
  pages are public; "What the absences cost" is computed on the server for paid
  viewers only.
- **The data stays ours.** The tables have no Data API grants; pages read one
  match or one club at a time through `match_details_bundle`, `team_fixtures`,
  `team_profile`, `team_season_leaders` and `team_player_usage`. No FotMob
  images are shown; crests are our own.
- **Never guessed.** A FotMob game links to an existing match only when both
  clubs match; it never creates a match or a club, and is never trusted for
  scores. Unlinked games show on the Data health page.
- **Point in time.** Who was out is only stored for games not yet started (old
  pages show today's injuries), and snapshotted daily from 3 November 2026.
- **Two switches.** `fotmob_ui` hides every FotMob section (pages fall back to
  what they showed before). `lineup_adjust` would let absences move the model's
  numbers; it is off because the backtest found no gain.

## Rights

FotMob is an unofficial feed of data it licenses (Opta ids appear in it), and
its terms do not allow scraping. This was a deliberate product decision; the
safeguards above limit exposure. A licensed provider can replace the source
behind the same tables without touching the pages.
