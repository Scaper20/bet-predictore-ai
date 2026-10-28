# Market and club accuracy (replay)

`npx tsx scripts/market-accuracy.ts --sql=out.sql` scores every market
SportyBet lists beyond the main ones (team goals, team corners, shots and
shots on target, totals, handicaps, "most") on the walk-forward cache
(`scripts/niche-lab.ts --stage=predict`), July 2025 on, 17 divisions, on
the lines SportyBet sets (the k lines nearest 50/50 per game). The SQL it
writes upserts `market_accuracy` and `team_accuracy` (0085); run it in the
Supabase SQL editor after a refresh.

Holdout, 7,306 games (28 Oct 2026):

| Market | Skill vs naive | Rated 70-85%: landed / stated |
|---|---|---|
| Shots, who has more | +8 to +9% | 76.5% / 76.8% (home) |
| Shots, team totals | +5 to +8% | no lines that far out |
| Shots on target, team totals | +3 to +4.5% | 71-73% / 73-74% (2 points short) |
| Corners, team totals | +3% | 77% / 77% (unders); home over 74.7% / 76.7% |
| Corners, who has more | +4% | 74% / 75% |
| Totals (corners, shots, on target) | under +1% | — |
| Team goals | (no market benchmark) | 77-79% / 76-78% |

So: the model reads team-level counts (who has more shots, each club's
shots and corners) better than the clubs' own averages, and totals barely
at all. Team goals are honest at the pick band. Shots-on-target team lines
claim about 2 points more than they land.

`team_accuracy` holds, per club and per stat, expected against actual for
and against, the average error, and how its own team lines rated 70-85%
landed: the groundwork for team pages.
