# goals-v2 (BetriX Strike 2) — what changed and how it was measured

October 2026. Replaces goals-v1, which stays on the track record under its own
name with every pick it published.

## What changed

1. **Shots on target in the ratings.** Team attack and defence are fitted on a
   blend of goals and shots on target (half each, converted at the sample's
   goals-per-shot rate) wherever the data records shots. Goals are a noisy count
   of which chances went in; shots on target measure the chances.
2. **Promoted clubs start below average.** A club that joins a competition's
   sample late is shrunk toward a below-average rating that fades as it plays.
3. **Lighter shrinkage** (0.02 → 0.01), retuned with the above.
4. **A 200-match publishing bar** (was 15). No headline pick unless the
   competition has 200+ completed matches in the data; 200–400 carries the
   thin-sample caveat.
5. **Fixture names linked to clubs.** A fixture that spells a club its own way
   ("Norwich City FC" for "Norwich") is now looked up under the club's
   canonical name, like the archive already was.

## How it was measured

### Walk-forward backtest (scripts/model-lab.ts, scripts/backtest.ts)

Eight leagues (top five, Championship, Eredivisie, Primeira Liga) from
football-data.co.uk, fitting only on matches before each kickoff. Settings were
chosen on 2024-25 and confirmed on held-out 2025-26 + 2026-27:

| Held-out seasons | goals-v1 | goals-v2 |
|---|---|---|
| 1X2 log loss (closing market 0.9825) | 1.0044 | **1.0003** |
| O/U 2.5 log loss (market 0.6693) | 0.6805 | **0.6790** |
| Headline hit rate (3,314 picks) | 75.5% | **76.1%** |
| Return at closing prices | −4.55% | **−2.60%** |

### History depth (why the bar is 200)

Capping training history at N matches: 40 → 57.6% of picks landed against
71.7% claimed; 80 → 66.3%; 120 → 68.2%; 200 → 71.0%; 380 → 73.7%. The live
record matched: competitions trained on the feeds' last 15–35 results landed
57% against 72% claimed, the archived leagues about 70%.

### Replay of the live track record (scripts/replay-track-record.ts)

Every one of the 266 settled live picks, wins and losses alike, re-predicted
using only archived results from before that game's kickoff, graded against the
real score. Nothing was written to the track record.

| | Record | Hit rate |
|---|---|---|
| goals-v1 as published (all 266) | 169–97 | 63.5% |
| goals-v1 as published, on the 204 games goals-v2 would publish | 135–69 | 66.2% |
| goals-v1's settings with the data fixes, same 204 | 155–49 | 76.0% |
| **goals-v2, same 204** | **161–43** | **78.9%** |

goals-v2 declines the other 62 (58 in competitions with no archive: USL,
Argentina, U21 and others), where goals-v1 went about 50/50.

Read this as a backtest, not a record: 204 games is a small sample (±5–6 points),
and the large walk-forward above is the better estimate of what goals-v2 does
going forward. The real record of goals-v2 starts with its first published pick.

## Not done, on purpose

The live track record was not edited. Swapping losses for what a newer model
would have picked, after the results are known, would make any model look
better and would misstate what was actually published.
