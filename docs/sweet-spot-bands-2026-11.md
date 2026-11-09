# Sweet spots, upgraded: graded bands (Nov 2026)

**Question.** Can the sweet-spot rule be made better?

**Answer.** Yes, modestly. Giving each selection several steps instead of one
threshold lifts the pick's hit rate by about half a point to a point, with
fewer refunds and more overs. It is live for goals-v3 games kicking off from
20 Nov 2026 (`BANDS_FROM`, `src/lib/model/params.ts`). Earlier games keep the
table they were published under.

## What was wrong with the old rule

Each selection had one threshold and one record ("home or draw from 76%:
82.8%"). Two flaws follow:

- A selection at 77% and the same one at 84% carried the same record, so the
  choice between two rules ignored how far into its range each one was.
- The thresholds were tuned on the old probabilities. goals-v3 changed them.

## What was tried

`scripts/sweet-lab.ts`, 28,187 replayed games (Aug 2021 - Oct 2026, 17
divisions, goals-v3 probabilities, sweet spots off). Every arm is scored
against the shipped table on the same games; intervals are paired, 95%.
The lab's shipped arm reproduces the real layer's pick on all 19,375 games
checked.

| Arm | Hit rate vs shipped (18,561 picks) | Verdict |
| --- | --- | --- |
| Shipped table | 78.0% | baseline |
| Same recipe, refitted every month (2- or 3-year trail) | -0.7 to +0.1 | no gain |
| Lower thresholds (0.02 / 0.04 / 0.06) | -0.45 / -1.34 / -2.47 | worse |
| More candidates (away win, over 2.5, both teams to score) | 0.0 | no gain |
| **Graded bands**, refitted monthly | **+0.51 (+0.24 to +0.79)** | adopted |
| Graded bands, one table fitted before Jul 2024 | +0.32 / +0.87 / +1.29 on 2024-25 / 2025-26 / Sep-Oct 2026 | as good, so no nightly job |

Graded bands by window: +0.19, +0.31, +0.95 (+0.48 to +1.52) and, on Sep-Oct
2026, +1.01 (-0.04 to +2.22). Positive in all four; outside noise in one and
pooled.

## What a band is

For each selection, the record is fitted as a non-decreasing step function of
its chance (pool-adjacent-violators on 0.01 bins, steps of 100+ picks). Every
step that landed 76% or more becomes a row. The rule for choosing is
unchanged: the strongest record that applies takes the game. The table is
`SWEET_SPOT_BANDS` in `src/lib/model/sweet-spots.ts` (42 rows, seven
selections), written by `sweet-lab.ts --emit`. Under 12.5 corners, the paused
handicaps and the shots fillers are untouched.

## Confirmed through the real predictor

`audit-eval.ts --cfg=v3 --rules=<table fitted on games before Jul 2025>`,
scored on the 7,429 games after it:

| | Old table | Bands |
| --- | --- | --- |
| 2025-26, landed | 77.9% (5,666) | 78.8% (5,720) |
| Sep-Oct 2026, landed | 78.3% (1,131) | 79.3% (1,136) |
| Wins / losses / refunds, all games | 5,569 / 1,570 / 119 | 5,678 / 1,524 / 60 |
| Overs among the picks | 32% | 40% |
| Stated chance | 76.5% | 77.3% |

On games where both picks were settled win or lose the paired gain is +0.42
(-0.04 to +0.88). The rest is refunds turned into wins: away draw no bet
often gives way to away or draw, which wins on the draw that used to refund.

## Cost

- Prices are about 1% shorter (average fair odds 1.299 against 1.311). Part
  of the gain is bought that way.
- Value against the closing price is unchanged within noise (+1.51 against
  +1.66 points on result picks).
- Under 12.5 corners used to outrank every goal rule. A top-step goal row
  (record above 0.849) now outranks it. Not replayed: the lab has no corners.
  Live since August the corners pick has landed 80 of 102.

## Not done

- Stat rules (corners, shots) were not retested.
- The bands are fitted to the 17 lab divisions. Other competitions never used
  sweet spots and still do not.

Check after a month live: hit rate of the published picks in the 17 divisions from 20 Nov against
the three weeks before, and the share of overs.
