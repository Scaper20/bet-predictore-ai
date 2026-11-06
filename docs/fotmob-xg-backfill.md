# FotMob xG: league ids and the backfill (6 Nov 2026)

## What changed

`src/lib/leagues.ts` now carries a FotMob id for 16 more leagues (generated into
`ingestion/betrix_ingest/leagues.json`). Each id was checked against FotMob's own league
name, and every league returned xG on 5 of 5 sampled matches of the current season.

| League | FotMob id | xG history on FotMob (5 sampled matches a season) |
|---|---|---|
| Championship, Eredivisie, Primeira Liga, Scottish Premiership, Belgian Pro League, Süper Lig, League One, 2. Bundesliga | 48, 57, 61, 64, 40, 71, 108, 146 | 2022/23 on |
| MLS | 130 | 2022 on |
| Liga MX | 230 | 2022/23 on |
| Brasileirão | 268 | 2024 on (2022: 0 of 5) |
| Argentina Liga Profesional | 112 | 2024 on (2022: 0 of 5) |
| Greek Super League, Serie B, La Liga 2, Ligue 2 | 135, 86, 140, 110 | current season only (2024/25: 0 of 5) |

The top five leagues and the Premier League's older seasons: xG from 2020/21 (2018/19 and 2019/20: none).

## Two fixes the backfill needed

1. **Season names.** The backfill asked FotMob for "2025/2026" in every league. MLS and
   the Brazilian league name a season by year ("2025"), Argentina by tournament ("2025 -
   Apertura") and Liga MX by both, and FotMob answers an unknown name with the
   *current* season. So a backfill of those leagues would have fetched today's games again.
   `resolve_season_names` (jobs.py) now matches the label against the league's own list.
2. **Team figures only.** `--team-stats-only` stores just `match_team_stats` (xG, shots,
   possession) and the `match_details` header, with the lineup, player-stat and shot-map
   flags false. The full job writes about 100 rows a game; this writes 2. Use it for history.

## Which leagues the backfill can reach

The backfill links FotMob games onto our `matches` table, so it only fills a game we
already hold there. Checked 6 Nov:

- **Full history in `matches` (back to 2020 or earlier):** Premier League, La Liga, Serie A,
  Bundesliga, Ligue 1, Championship, Eredivisie, Primeira Liga, Brasileirão.
- **Current season only in `matches`** (older seasons live in `historical_results`):
  Belgian, 2. Bundesliga, Greek, La Liga 2, League One, Liga MX, Ligue 2, MLS, Scottish,
  Serie B, Süper Lig, Argentina.

For the second group the backfill gives the current season only. Their deeper xG needs
xG stored beside the archived results (`historical_results.home_xg/away_xg`, a migration and
a small job that matches FotMob games to those rows by date and club). That is only worth
building if the xG walk-forward test shows a gain (docs/model-audit-teams-2026-11.md, section K).

## Run it (Actions tab, one stage at a time; rerun a stage until `remaining` is 0)

Each detail request is about 4 seconds, so 1,000 games is about an hour. Every command
starts `python -m betrix_ingest` and takes `--team-stats-only`.

| Stage | Command | Games | Time |
|---|---|---|---|
| 1. Top five, 2020/21 to 2022/23 | `fotmob-backfill --league premier-league --league la-liga --league serie-a --league bundesliga --league ligue-1 --seasons 6 --team-stats-only --limit 4000` | about 5,500 | about 6 h |
| 2. Linked leagues, 2022/23 on | `fotmob-backfill --league championship --league eredivisie --league primeira-liga --seasons 4 --team-stats-only --limit 4000` | about 5,000 | about 6 h |
| 3. Brasileirão | `fotmob-backfill --league brasileirao --seasons 2 --team-stats-only --limit 4000` | about 1,100 | about 1.5 h |
| 4. The other twelve, current season | `fotmob-backfill --league belgian-pro-league --league bundesliga-2 ... --seasons 1 --team-stats-only` | about 1,700 | about 2 h |

The first run after the ids land will also pick the new leagues up in the **scheduled**
jobs: `fotmob-matches` (01:25, 10:25), `fotmob-upcoming` (lineups and absences for their
games), `fotmob-teams` and `fotmob-players` all iterate every league with a FotMob id.
That is more rows and more requests every day (docs/database-load.md); set the `fotmob`
source switch off, or drop an id again, to pause one.

## Check coverage after a stage

```sql
select m.league_code, count(*) games, count(s.home_xg) with_xg,
       min(m.kickoff)::date first, max(m.kickoff)::date last
from matches m
join match_details d on d.match_id = m.id
left join match_team_stats s on s.match_id = m.id
where m.status = 'finished'
group by 1 order by 2 desc;
```

## Terms

FotMob's feed is unofficial and its xG is licensed data (see the `fotmob.py` docstring). Using
it to train the model is lower risk than showing the numbers to users or passing them on;
have its terms checked before either.
