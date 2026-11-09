# Fresh look, 9 November 2026

A second audit of the model and the platform, started from the live record rather than the lab.
Nothing here changes a published pick. Lab numbers stop at 31 October 2026 (the frozen holdout).

## What was broken, and is fixed

| Area | Fault | Fix |
| --- | --- | --- |
| Team and player pages | `team:fixtures:<id>` was cached in two shapes by two files. Whichever page filled it first crashed the other for five minutes: 2,746 errors for 290 visitors, 3-9 Nov. | Both keep the raw rows; `src/lib/cache-keys.test.ts` fails if two files share a cache key without being listed. |
| Player props | A projection batch that hit the primary key (a player listed twice, or two runs overlapping) failed whole, after the game's old rows had been deleted: 17 of 518 runs in a week. | Rows de-duplicated and written as an upsert (`uniqueProjections`). |
| Anchoring score | `scripts/sql/anchor-shadow-score.sql` did not run (`round(double precision, integer)`). | Cast fixed. |

## How the live model is doing

goals-v2, 7 Oct - 9 Nov: 1,260 settled picks, 76.3% landed against 75.2% stated. Calibrated by
confidence band, market, week and league; the only league clearly off is the CAF Champions League,
already held back.

Against the price it has no edge. On the 638 picks with a price: average price 1.243, return
-5.7% (SE 2.1), closing-line value 1.000. The 26 picks where the model claimed value over the
price landed 54%. The bookmaker's price is a better forecast than the model, in every test.

## Tests run

Walk-forward, 17 leagues, through the real `buildPrediction`. A = Aug 2023 - Jun 2026
(17,857 games), H = 2025-26, B = Sep-Oct 2026 (1,165 games). Differences are paired, 95% interval.

### 1. goals-v3, which goes live for games from 14 November

| Window | 1X2 loss v2.1 -> v3 | Over 2.5 loss | Picks landed | Return at closing price |
| --- | --- | --- | --- | --- |
| A | 1.0081 -> 1.0000 | 0.6820 -> 0.6800 | 77.8% -> 77.9% | -3.55% -> -2.92% |
| H | 1.0166 -> 1.0098 | 0.6856 -> 0.6836 | 78.0% -> 77.9% | -3.47% -> -3.23% |
| B | 1.0145 -> 1.0016 | 0.6801 -> 0.6774 | 78.4% -> 78.2% | -4.69% -> -3.51% |

Better chances in all three windows, the same hit rate. The market is at 0.987 / 0.673 in A:
v3 closes about 40% of the gap.

### 2. Goals are up this season and the model lags

Sep-Oct 2026 averaged 2.95 goals a game; v2.1 projected 2.80, v3 2.82, the market 2.94. Live in
November the model's over 2.5 sits 3.7 points under the price in 18 of 20 leagues.

Two corrections were tried on top of v3, both scaling the goal rates by a recent level:

| Variant | Goals shortfall in B | Over 2.5 loss, B | Picks landed, B | Picks landed, A |
| --- | --- | --- | --- | --- |
| v3 | -0.135 | 0.6774 | 78.2% | 77.9% |
| level from goals scored, 60-day half-life, half weight | -0.098 | 0.6764 | 77.5% | 78.0% |
| level from goals scored, 45-day, full weight | -0.033 | 0.6761 | 76.5% | 78.1% |
| level from the market's totals, 30-day, full weight | -0.056 | 0.6758 | 77.1% | 78.1% |
| level from the market's totals, 20-day | -0.050 | 0.6758 | 77.0% | 78.0% |

The shortfall closes and the chances improve slightly (not outside the interval), but the picks do
not: the correction adds 40-60 over picks in B and they land at 75%, below their stated chance.
**Not shipped.** The option stays in the code (`levelAdjust.market`) for the lab only. The
publish-time price carries the same information game by game, which is what the anchoring shadow
run measures.

### 3. A late archive

football-data.co.uk rows land a median 2.5 days after kickoff (a weekend arrives on Tuesday at
02:30 UTC), and leagues with a deep archive do not add live results on top.

| Training runs behind by | 1X2 loss, A | Picks landed, A | Picks landed, B |
| --- | --- | --- | --- |
| 3 days | +0.0003 [0.0001, 0.0004] | +0.06 [-0.06, 0.23] | +0.06 [-0.68, 0.86] |
| 7 days | +0.0008 [0.0004, 0.0011] | -0.21 [-0.45, 0.02] | -1.02 [-2.15, 0.03] |

Missing one round costs nothing measurable. A week or more starts to cost, so the thing to watch
is the nightly refresh failing for several days, not the normal delay. **No change.**

### 4. Anchoring to the publish-time price (shadow run, live)

First 118 finished games, 6-8 November:

| | 1X2 loss | Over 2.5 loss |
| --- | --- | --- |
| Model as served | 1.0003 | 0.6961 |
| Anchored halfway to the price | 0.9710 | 0.6886 |
| The price | 0.9603 | 0.6795 |

Anchored beats plain by 0.029 (SE 0.012). This is by far the largest gain on the table, five to
six times what v3 adds, and it also absorbs the goals shortfall of section 2. Three days is too
few to switch it on; the plan stays: score it after about three weeks.

### 5. Sweet-spot rules, live since 20 October

About 142 picks fired a rule: 78.9% landed, against 80% stated and 82-85% in the rules' lab
records. Within noise at this count, but the lab premium has not shown yet. Re-check at 400+.

## Left as found

- Supabase performance advisors: information-level only (unindexed foreign keys on small tables,
  unused indexes). Security: the eleven `SECURITY DEFINER` functions open to visitors are the
  read-only page functions, as intended.
- `clubelo` ingest fails every run because the source is disabled; whatever schedules it lives
  outside this repository and the database cron.
- FA Cup first round: the model is far from the price (0.196 mean gap on home win) but only five
  picks were published and the market check covers them.

## Reproduce

```
npx tsx scripts/audit-eval.ts --cfg=v3 --mkt=<cache dir> --from=2023-08-01 --to=2026-10-31 --out=<dir>/v3.json
npx tsx scripts/audit-eval.ts --cfg=v3_ml30 --mkt=<cache dir> --out=<dir>/v3_ml30.json
npx tsx scripts/audit-eval.ts --cfg=v3 --lag=7 --mkt=<cache dir> --out=<dir>/v3_lag7.json
npx tsx scripts/audit-report.ts --dir=<dir> --base=v3 --cfgs=v3_ml30 --win=B
```
