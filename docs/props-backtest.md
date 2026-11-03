# Player props backtest

Written from `scripts/props-lab.ts` (walk-forward) on 3 November 2026. Inputs: `.backtest-cache/props-games.json` from `scripts/props-export.ts` (public, bounded RPCs only): 136,102 player-games, 5,012 players, the eight FotMob competitions, August 2024 to November 2026.

## Method

- Every starter's game is predicted strictly from earlier data: the player's own games, what the opponent conceded to that position, and position averages up to the day before. Only starters with 5+ earlier starts are scored, because props are logged once the eleven is confirmed.
- Model (`src/lib/model/player-props.ts`): a per-90 rate weighted by minutes and recency, shrunk toward the position average; xG/xA blended into goals and assists; expected minutes from recent starts; an opponent factor (what players recorded against that club divided by what those same players usually record, so a strong club's weaker opponents are not mistaken for its effect); negative binomial spread per market and position.
- Windows: warm-up before 2025-01-01; **validation** 2025-01-01 to 2025-06-30 picks each market's parameters (grid search on log score), fits the NB size and a logit calibration; **test** from 2025-07-01 is reported and never fitted on.
- Baseline: Poisson on the player's plain average over his last ten starts.
- Line scores use every half-line the baseline puts between 10% and 90% (the lines a bookmaker would plausibly list). Gain = baseline log loss minus model log loss, with a match-clustered bootstrap 95% interval.
- Gate (per market): gain interval above zero, test calibration error (ECE) under 2.5 points, and every 70%+ band with 200+ picks within 3 points of what it says.

## Result: all ten markets pass

| Market | Test games | Lines | Log score model / avg | Line log loss model / avg | Gain (95% CI) | Brier model / avg | ECE | Verdict |
|---|---|---|---|---|---|---|---|---|
| Goals | 47096 | 15942 | -0.339 / -0.444 | 0.4478 / 0.4784 | 0.0305 (0.0281 to 0.0360) | 0.1415 / 0.1519 | 1.9% | **go** |
| Assists | 47096 | 11367 | -0.284 / -0.397 | 0.3517 / 0.3957 | 0.0441 (0.0395 to 0.0509) | 0.1018 / 0.1152 | 0.5% | **go** |
| Goals + assists | 47096 | 27576 | -0.502 / -0.627 | 0.4885 / 0.5178 | 0.0293 (0.0270 to 0.0313) | 0.1588 / 0.1695 | 1.3% | **go** |
| Shots | 47096 | 105290 | -1.288 / -1.357 | 0.5663 / 0.5872 | 0.0209 (0.0188 to 0.0219) | 0.1921 / 0.2004 | 0.8% | **go** |
| Shots on target | 47096 | 46818 | -0.726 / -0.836 | 0.5384 / 0.5613 | 0.0228 (0.0213 to 0.0250) | 0.1798 / 0.1889 | 1.1% | **go** |
| Tackles | 47096 | 132219 | -1.511 / -1.573 | 0.5665 / 0.5896 | 0.0231 (0.0220 to 0.0243) | 0.1920 / 0.2011 | 1.1% | **go** |
| Fouls committed | 47096 | 105681 | -1.297 / -1.346 | 0.5717 / 0.5931 | 0.0214 (0.0203 to 0.0220) | 0.1945 / 0.2030 | 1.6% | **go** |
| Clearances | 47096 | 151271 | -1.652 / -1.755 | 0.5820 / 0.6078 | 0.0258 (0.0246 to 0.0275) | 0.1986 / 0.2088 | 1.8% | **go** |
| Passes attempted | 47096 | 144825 | -3.954 / -5.417 | 0.6193 / 0.7112 | 0.0920 (0.0894 to 0.0957) | 0.2156 / 0.2515 | 1.9% | **go** |
| Saves | 4843 | 20672 | -2.002 / -2.091 | 0.5536 / 0.5846 | 0.0310 (0.0277 to 0.0323) | 0.1864 / 0.1988 | 1.5% | **go** |

### Hit rate by confidence band (test, calibrated)

| Market | 50–60% | 60–70% | 70–78% | 78–85% | 85–90% | 90–100% |
|---|---|---|---|---|---|---|
| Goals | 60.2% vs 55.8% (n 334) | 66.4% vs 66.1% (n 1335) | 71.7% vs 74.5% (n 3023) | 79.8% vs 81.5% (n 3702) | 86.1% vs 87.5% (n 2605) | 92.1% vs 94.0% (n 4943) |
| Assists | 54.2% vs 58.7% (n 24) | 66.2% vs 67.4% (n 71) | 77.9% vs 75.8% (n 344) | 83.5% vs 82.3% (n 2237) | 87.1% vs 87.7% (n 3749) | 92.3% vs 93.0% (n 4942) |
| Goals + assists | 58.9% vs 55.6% (n 2122) | 66.1% vs 65.5% (n 4546) | 73.0% vs 74.1% (n 5394) | 79.6% vs 81.6% (n 5201) | 86.6% vs 87.6% (n 4532) | 92.2% vs 93.4% (n 5781) |
| Shots | 55.4% vs 55.0% (n 25765) | 64.3% vs 64.9% (n 25042) | 73.3% vs 74.0% (n 19190) | 81.2% vs 81.6% (n 16961) | 86.8% vs 87.4% (n 11132) | 91.5% vs 92.7% (n 7200) |
| Shots on target | 54.1% vs 54.8% (n 9594) | 65.4% vs 65.1% (n 8093) | 74.1% vs 74.3% (n 8354) | 81.3% vs 81.6% (n 9531) | 85.1% vs 87.4% (n 6263) | 91.7% vs 93.4% (n 4983) |
| Tackles | 55.1% vs 55.0% (n 29821) | 64.8% vs 65.1% (n 31291) | 74.5% vs 74.1% (n 30073) | 81.4% vs 81.3% (n 24455) | 87.9% vs 87.3% (n 11106) | 92.9% vs 92.3% (n 5473) |
| Fouls committed | 55.2% vs 55.2% (n 24036) | 64.6% vs 65.1% (n 28709) | 73.4% vs 73.9% (n 22727) | 81.6% vs 81.3% (n 15808) | 87.9% vs 87.4% (n 8680) | 92.6% vs 92.7% (n 5721) |
| Clearances | 55.5% vs 55.0% (n 41769) | 66.0% vs 65.0% (n 42384) | 76.0% vs 73.9% (n 32712) | 82.9% vs 81.3% (n 23075) | 88.6% vs 87.2% (n 8975) | 93.2% vs 91.7% (n 2356) |
| Passes attempted | 54.5% vs 54.9% (n 51736) | 63.8% vs 64.8% (n 44498) | 72.7% vs 73.7% (n 25376) | 79.4% vs 81.2% (n 13913) | 86.3% vs 87.2% (n 5552) | 92.6% vs 93.5% (n 3750) |
| Saves | 55.2% vs 54.9% (n 4415) | 64.4% vs 65.2% (n 4296) | 73.6% vs 74.0% (n 4374) | 80.3% vs 81.4% (n 3178) | 86.0% vs 87.5% (n 2050) | 91.4% vs 93.1% (n 2359) |

### Fitted parameters

| Market | Half-life (days) | k | Opponent k | xG blend | NB size GK / DF / MF / FW | Calibration a |
|---|---|---|---|---|---|---|
| Goals | 180 | 5 | 60 | 0.8 | Poisson / Poisson / Poisson / Poisson | 1.1 |
| Assists | 730 | 5 | 0 | 0.8 | Poisson / Poisson / 14.0 / Poisson | 1.06 |
| Goals + assists | 180 | 2 | 60 | 0.8 | Poisson / Poisson / Poisson / Poisson | 1.08 |
| Shots | 365 | 5 | 30 | 0 | Poisson / 5.9 / 18.7 / 17.8 | 1 |
| Shots on target | 730 | 10 | 60 | 0 | Poisson / 4.2 / Poisson / Poisson | 1.04 |
| Tackles | 365 | 5 | 60 | 0 | Poisson / 7.3 / 9.5 / 4.9 | 1 |
| Fouls committed | 365 | 5 | 60 | 0 | Poisson / 19.8 / Poisson / Poisson | 1 |
| Clearances | 180 | 2 | 30 | 0 | Poisson / 4.9 / 3.6 / 3.0 | 0.98 |
| Passes attempted | 180 | 2 | 10 | 0 | Poisson / 10.6 / 11.0 / 12.6 | 0.9 |
| Saves | 730 | 20 | 10 | 0 | 13.8 / Poisson / Poisson / Poisson | 1.02 |

## Opponent factor: usual output vs position average

The first version compared what a club's opponents recorded with the position average. Measuring against each player's own usual output instead was equal or better in every market, and clearly better where team style matters most (passes: gain 0.086 to 0.092; clearances 0.024 to 0.026), with calibration still under 2 points. Shipped (live once migration 0095 is applied; the feed falls back to the first version until then). `--opp=plain` reruns the old one.

## What it means, and what it does not

- Every market clearly beats a plain recent average and is well calibrated from 70% up. Above 90% every market runs one to two points overconfident, so published picks are capped at 88% (`src/lib/model/prop-picks.ts`: floor 72%, cap 88%, minimum price 1.18 (as team picks), bookmaker no more than 10 points below us).
- **This is not a test against the bookmaker.** No history of SportyBet player lines exists, so whether the picks beat SportyBet's prices is unknown until the shadow record builds up (`player_prop_picks` with `published = false`). The `player_props` switch stays off until that record is calibrated.
- Counts are FotMob's. A bookmaker's data provider can count tackles, clearances and passes differently; the UI says so.
- Clearances has no SportyBet market, and SportyBet offers goals + assists only as yes/no ("to score or assist", 0.5). Both still show as projections.
- Some parameters sit at the edge of the grid (opponent k 60). A wider grid is a cheap follow-up; the gain would be small.

Re-run: `NODE_USE_ENV_PROXY=1 npx tsx scripts/props-export.ts`, then `npx tsx scripts/props-lab.ts` (report to `.backtest-cache/props-report.md`) or `--ship` to rewrite `src/lib/model/player-props-params.ts`.
