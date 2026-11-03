# Player props backtest

Written from `scripts/props-lab.ts` (walk-forward) on 3 November 2026. Inputs: `.backtest-cache/props-games.json` from `scripts/props-export.ts` (public, bounded RPCs only): 136,102 player-games, 5,012 players, the eight FotMob competitions, August 2024 to November 2026.

## Method

- Every starter's game is predicted strictly from earlier data: the player's own games, what the opponent conceded to that position, and position averages up to the day before. Only starters with 5+ earlier starts are scored, because props are logged once the eleven is confirmed.
- Model (`src/lib/model/player-props.ts`): a per-90 rate weighted by minutes and recency, shrunk toward the position average; xG/xA blended into goals and assists; expected minutes from recent starts; an opponent factor; negative binomial spread per market and position.
- Windows: warm-up before 2025-01-01; **validation** 2025-01-01 to 2025-06-30 picks each market's parameters (grid search on log score), fits the NB size and a logit calibration; **test** from 2025-07-01 is reported and never fitted on.
- Baseline: Poisson on the player's plain average over his last ten starts.
- Line scores use every half-line the baseline puts between 10% and 90% (the lines a bookmaker would plausibly list). Gain = baseline log loss minus model log loss, with a match-clustered bootstrap 95% interval.
- Gate (per market): gain interval above zero, test calibration error (ECE) under 2.5 points, and every 70%+ band with 200+ picks within 3 points of what it says.

## Result: all ten markets pass

| Market | Test games | Lines | Log score model / avg | Line log loss model / avg | Gain (95% CI) | Brier model / avg | ECE | Verdict |
|---|---|---|---|---|---|---|---|---|
| Goals | 47096 | 15942 | -0.339 / -0.444 | 0.4475 / 0.4784 | 0.0309 (0.0284 to 0.0362) | 0.1414 / 0.1519 | 1.6% | **go** |
| Assists | 47096 | 11367 | -0.284 / -0.397 | 0.3517 / 0.3957 | 0.0441 (0.0395 to 0.0509) | 0.1018 / 0.1152 | 0.5% | **go** |
| Goals + assists | 47096 | 27576 | -0.503 / -0.627 | 0.4886 / 0.5178 | 0.0292 (0.0271 to 0.0310) | 0.1589 / 0.1695 | 1.2% | **go** |
| Shots | 47096 | 105290 | -1.288 / -1.357 | 0.5664 / 0.5872 | 0.0208 (0.0191 to 0.0218) | 0.1921 / 0.2004 | 0.8% | **go** |
| Shots on target | 47096 | 46818 | -0.726 / -0.836 | 0.5388 / 0.5613 | 0.0225 (0.0209 to 0.0248) | 0.1800 / 0.1889 | 1.2% | **go** |
| Tackles | 47096 | 132219 | -1.512 / -1.573 | 0.5669 / 0.5896 | 0.0227 (0.0219 to 0.0239) | 0.1921 / 0.2011 | 1.3% | **go** |
| Fouls committed | 47096 | 105681 | -1.297 / -1.346 | 0.5723 / 0.5931 | 0.0209 (0.0200 to 0.0216) | 0.1948 / 0.2030 | 1.7% | **go** |
| Clearances | 47096 | 151271 | -1.656 / -1.755 | 0.5843 / 0.6078 | 0.0235 (0.0227 to 0.0251) | 0.1995 / 0.2088 | 1.5% | **go** |
| Passes attempted | 47096 | 144825 | -3.963 / -5.417 | 0.6248 / 0.7112 | 0.0864 (0.0839 to 0.0898) | 0.2179 / 0.2515 | 1.6% | **go** |
| Saves | 4843 | 20672 | -2.002 / -2.091 | 0.5535 / 0.5846 | 0.0312 (0.0282 to 0.0324) | 0.1864 / 0.1988 | 1.6% | **go** |

### Hit rate by confidence band (test, calibrated)

| Market | 50–60% | 60–70% | 70–78% | 78–85% | 85–90% | 90–100% |
|---|---|---|---|---|---|---|
| Goals | 62.7% vs 56.0% (n 397) | 66.4% vs 66.1% (n 1448) | 72.4% vs 74.4% (n 3076) | 80.1% vs 81.5% (n 3603) | 86.5% vs 87.5% (n 2541) | 92.0% vs 93.9% (n 4877) |
| Assists | 54.2% vs 58.7% (n 24) | 66.2% vs 67.4% (n 71) | 77.9% vs 75.8% (n 344) | 83.5% vs 82.3% (n 2237) | 87.1% vs 87.7% (n 3749) | 92.3% vs 93.0% (n 4942) |
| Goals + assists | 58.2% vs 55.5% (n 2318) | 66.5% vs 65.5% (n 4697) | 73.4% vs 74.0% (n 5263) | 79.9% vs 81.6% (n 5132) | 86.7% vs 87.6% (n 4500) | 92.2% vs 93.3% (n 5666) |
| Shots | 55.3% vs 55.0% (n 25959) | 64.5% vs 64.9% (n 25149) | 73.6% vs 74.0% (n 19152) | 81.3% vs 81.6% (n 17085) | 86.7% vs 87.4% (n 11221) | 91.9% vs 92.6% (n 6724) |
| Shots on target | 53.9% vs 54.8% (n 9549) | 65.2% vs 65.1% (n 8163) | 74.2% vs 74.3% (n 8826) | 81.6% vs 81.6% (n 9473) | 85.1% vs 87.3% (n 6016) | 92.0% vs 93.4% (n 4791) |
| Tackles | 55.3% vs 55.0% (n 30112) | 64.8% vs 65.1% (n 30924) | 74.5% vs 74.1% (n 30595) | 81.5% vs 81.3% (n 24781) | 88.3% vs 87.3% (n 10685) | 93.1% vs 92.3% (n 5122) |
| Fouls committed | 55.4% vs 55.1% (n 24163) | 64.6% vs 65.1% (n 28460) | 73.2% vs 73.9% (n 22653) | 81.5% vs 81.3% (n 15966) | 87.9% vs 87.4% (n 8699) | 92.6% vs 92.7% (n 5740) |
| Clearances | 55.5% vs 55.0% (n 42872) | 66.4% vs 65.0% (n 43120) | 76.0% vs 73.9% (n 32591) | 83.2% vs 81.3% (n 22147) | 88.3% vs 87.1% (n 8459) | 92.6% vs 91.8% (n 2082) |
| Passes attempted | 54.6% vs 55.0% (n 52214) | 63.8% vs 64.8% (n 45080) | 72.1% vs 73.7% (n 25614) | 79.3% vs 81.1% (n 13583) | 85.4% vs 87.2% (n 5203) | 91.1% vs 93.2% (n 3131) |
| Saves | 55.0% vs 54.8% (n 4448) | 64.8% vs 65.2% (n 4251) | 73.8% vs 74.0% (n 4464) | 79.8% vs 81.4% (n 3161) | 86.9% vs 87.5% (n 2051) | 91.2% vs 93.1% (n 2297) |

### Fitted parameters

| Market | Half-life (days) | k | Opponent k | xG blend | NB size GK / DF / MF / FW | Calibration a |
|---|---|---|---|---|---|---|
| Goals | 180 | 5 | 60 | 0.8 | Poisson / Poisson / Poisson / Poisson | 1.1 |
| Assists | 730 | 5 | 0 | 0.8 | Poisson / Poisson / 14.0 / Poisson | 1.06 |
| Goals + assists | 180 | 2 | 60 | 0.8 | Poisson / Poisson / Poisson / Poisson | 1.08 |
| Shots | 365 | 5 | 60 | 0 | Poisson / 6.6 / 19.2 / 18.3 | 1 |
| Shots on target | 365 | 10 | 60 | 0 | Poisson / 5.1 / Poisson / Poisson | 1.04 |
| Tackles | 180 | 5 | 60 | 0 | Poisson / 7.0 / 9.5 / 5.1 | 1 |
| Fouls committed | 365 | 5 | 60 | 0 | Poisson / 21.6 / Poisson / Poisson | 1 |
| Clearances | 90 | 2 | 30 | 0 | Poisson / 4.5 / 3.3 / 2.8 | 0.96 |
| Passes attempted | 365 | 2 | 30 | 0 | Poisson / 10.4 / 11.0 / 12.2 | 0.92 |
| Saves | 365 | 20 | 10 | 0 | 13.5 / Poisson / Poisson / Poisson | 1.02 |
## What it means, and what it does not

- Every market clearly beats a plain recent average and is well calibrated from 70% up. Above 90% every market runs one to two points overconfident, so published picks are capped at 88% (`src/lib/model/prop-picks.ts`: floor 72%, cap 88%, minimum price 1.18 (as team picks), bookmaker no more than 10 points below us).
- **This is not a test against the bookmaker.** No history of SportyBet player lines exists, so whether the picks beat SportyBet's prices is unknown until the shadow record builds up (`player_prop_picks` with `published = false`). The `player_props` switch stays off until that record is calibrated.
- Counts are FotMob's. A bookmaker's data provider can count tackles, clearances and passes differently; the UI says so.
- Clearances has no SportyBet market, and SportyBet offers goals + assists only as yes/no ("to score or assist", 0.5). Both still show as projections.
- Some parameters sit at the edge of the grid (opponent k 60). A wider grid is a cheap follow-up; the gain would be small.

Re-run: `NODE_USE_ENV_PROXY=1 npx tsx scripts/props-export.ts`, then `npx tsx scripts/props-lab.ts` (report to `.backtest-cache/props-report.md`) or `--ship` to rewrite `src/lib/model/player-props-params.ts`.
