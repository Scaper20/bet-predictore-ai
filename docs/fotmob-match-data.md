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
