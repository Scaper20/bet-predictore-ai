# Corners, cards, shots and more goal markets

Status: model built and tested walk-forward (October 2026). Not on the site
yet: the live database stores goals and shots on target only, so corners,
cards and shots need new columns and a backfill first (see "To ship").

## What was built

- `src/lib/model/match-stats.ts`: one model for any per-match count.
  Opponent-adjusted "for" and "against" ratings per team (recency weighted,
  shrunk toward the league average), a referee factor for cards where the
  referee is known, and a joint distribution built as a negative binomial
  TOTAL plus a beta-binomial SPLIT between the sides. The split matters: home
  and away corners correlate about -0.3 (one side's pressure is the other's
  lack of it) while cards correlate about +0.2, and modelling the two sides
  as independent gets handicaps and "most corners" wrong. Markets: totals,
  team totals, most (3-way), handicaps (half and whole lines), odd/even.
- `src/lib/model/goal-markets.ts`: more goal markets from the existing score
  grids, with nothing new fitted: GG2+, team totals, win to nil, goal ranges
  (1-3, 2-3 ...), exact total, odd/even, European handicap, result + BTTS,
  result + over 2.5, second-half result, first-half Asian handicap, win
  either half, win both halves, score in both halves, a goal in both halves,
  both halves under 1.5, second-half BTTS, team to score in each half.
- `scripts/stats-lab.ts` and `scripts/goal-markets-lab.ts`: walk-forward
  tests. Every matchday is predicted from matches before it only.

## Data

football-data.co.uk, eight leagues (Premier League, Championship, La Liga,
Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga), 2017-18 to
2026-27: about 27,000 matches, every one with shots, shots on target,
corners, fouls and yellow/red cards. Referee names only in the two English
divisions. **No half-time corners, cards or shots anywhere in the source**,
and no corner, card or shot prices.

| League (2017-27) | Corners | Cards | Shots | On target |
|---|---|---|---|---|
| Premier League | 10.3 | 3.6 | 25.4 | 8.8 |
| La Liga | 9.4 | 5.1 | 23.8 | 8.3 |
| Serie A | 9.8 | 4.6 | 23.9 | 9.2 |
| Primeira Liga | 10.0 | 5.4 | 23.2 | 8.3 |
| Eredivisie | 10.3 | 3.2 | 27.2 | 9.8 |

Cards here are yellows plus reds, one each.

## Method

Tuned on 2019-22 (half-life, shrinkage, how far the total may move from the
league's, referee shrinkage), then scored once on the held-out 2022-27
seasons. "Skill" is the log-loss improvement over climatology: the league's
own base rate for that line from the same prior matches ("always say the
usual"). 0% means no better than the base rate. "Team averages" is the
obvious approach (each side's plain average for and against, Poisson), shown
for comparison. ECE is the average gap between claimed and observed
probability.

The one tuning finding that mattered: a fixture's expected TOTAL must be
pulled about half-way back to the league average (`totalShrink` 0.5-0.6),
while the split between the sides keeps its full spread. Without it the
model was overconfident on corner totals (73% claimed, 58% landed); with it,
calibration is within about 1.5 points everywhere.

## Results, held out 2022-27 (12,207 matches per statistic)

| Market | Corners | Cards | Shots | On target |
|---|---|---|---|---|
| Total over/under (range over lines) | 0.8-1.2% | 1.8-2.1% | 3.0-3.4% | 2.0-2.7% |
| Team total | 5.1-5.2% | 1.6-2.2% | 10.6-11.6% | 7.7-8.4% |
| Most (3-way) | 6.1% | 1.3% | 12.9% | 10.3% |
| Handicap | 7.9% | 1.8% | 15.1% | 12.6% |
| Team averages, most | 3.2% | 0.2% | 6.5% | 6.0% |
| Calibration error, totals | 0.2-1.6pt | 0.9-1.5pt | 0.7-1.1pt | 0.5-1.0pt |

Picks (one selection per fixture per statistic, graded):

| Pick rule | Corners | Cards | Shots | On target |
|---|---|---|---|---|
| Most X at 65%+: claimed → landed (base rate) | 73.1 → 74.1% (52.0%) | 67.8 → 68.6% (44.4%), 185 picks | 77.8 → 78.7% (55.2%) | 75.3 → 77.4% (50.3%) |
| Totals, 65%+ and 8pt over base rate | 71.6 → 71.7% (61.2%) | 72.3 → 74.3% (60.9%) | 72.3 → 74.7% (59.7%) | 71.8 → 74.3% (60.3%) |

The referee factor lifted card-total skill from about 1.6% to 2.0% on
2019-22 even though only two of the eight leagues name referees. The live
site's fixture feeds do not carry the referee, so live card predictions
would run without it until a source does.

Corner totals are close to unpredictable beyond the league average: the best
model explains about 1% of the match-to-match variation, and adding shot
ratings as a second input added about 0.1% more. Which side wins the corners
is far more predictable than how many there are.

## Goal markets, held out 2022-27 (12,207 matches)

| Market | Skill | ECE |
|---|---|---|
| Home wins both halves | 9.0% | 1.3pt |
| Euro handicap home -1 | 7.9% | 3-way |
| Win either half (home / away) | 7.9% / 7.1% | 2.7 / 2.1pt |
| Home over 1.5 | 6.3% | 2.2pt |
| Home win to nil | 6.1% | 1.7pt |
| 1H handicap home -0.5 / +0.5 | 5.5% / 5.2% | 1.4 / 0.7pt |
| Result & over 2.5 / Result & BTTS | 5.4% / 5.1% | multi-way |
| Score in both halves (home / away) | 5.3% / 4.9% | 2.4 / 1.1pt |
| Away over 0.5 | 4.2% | 1.0pt |
| 2H result | 4.0% | 3-way |
| Team to score 1st half / 2nd half | 3.7% / 2.8% | 1.7 / 1.8pt |
| Both halves under 1.5 | 1.1% | 1.4pt |
| Exact total | 0.9% | 7-way |
| Goal in both halves | 0.8% | 2.3pt |
| Multi-goal 1-3 / 2-3 | 0.8% / 0.2% | 0.8 / 0.3pt |
| GG2+ | 0.6% | 0.6pt |
| BTTS 2nd half | 0.4% | 0.5pt |
| Odd total | 0.1% | 0.6pt |

Win either half is underconfident (72.6% claimed, 78.2% landed at 65%+):
the halves are treated as independent and they are not quite. A calibration
step would fix it before it is published.

## Verdict

- **Ship as Pro probabilities:** shots and shots on target (every market),
  corner team totals, most corners and corner handicaps, card totals and
  team cards, and the goal markets with 3%+ skill above.
- **Show, never pick:** corner totals, GG2+, goal ranges, exact total,
  odd/even, goal in both halves, second-half BTTS. They are calibrated (an
  honest probability) but barely better than the base rate, so a "pick" on
  them would be the league average dressed up.
- **Not possible yet:** first-half / second-half corners, cards and shots.
  The source has no half-time counts, so there is nothing to fit or test a
  split on. A share guess (corners about 45% before the break, cards about
  40%) would be untested; it should wait for a source with per-half
  statistics.
- **No value test.** None of these markets are priced in the source.
  Bookmaker margins on corners and cards run higher than on 1X2, so a small
  skill over the base rate (corner totals) is unlikely to beat their lines;
  the larger skills (shots, corner handicaps, most corners) are where an edge
  is plausible, but that is unmeasured until prices are logged.

## To ship

1. `historical_results`: add corners, cards (yellow + red), shots and
   referee columns; extend `upsert_historical_results`; parse them in
   `src/lib/archive/football-data-uk.ts`; backfill the eight leagues (and
   the other football-data.co.uk main files that carry stats).
2. Fit the four statistics once per league per day alongside the goals fit;
   add `stats` and `goalExtras` to the prediction.
3. Strip both in `lib/access.ts` for free viewers (they are Pro markets), and
   add panels to the match page's Markets tab behind the existing Pro wall.
4. Log published stat probabilities, and corner/card prices where a feed
   offers them, so the value question can be answered with real data.

Reproduce:

    npx tsx scripts/stats-lab.ts --from=2223 --to=2627
    npx tsx scripts/goal-markets-lab.ts --from=2223 --to=2627
