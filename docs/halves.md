# Half-time and second-half markets

October 2026. Shown to Pro users as probabilities on the match page (Markets
tab, "Halves") and to Ask BetriX for paid users. Not used for headline picks,
Strong picks or the track record.

## Model
`src/lib/model/halves.ts`. Each side's full-match expected goals are split
between the halves by the first-half goal share (44.3%, measured across eight
leagues), tilted toward the stronger side (each team's share × (its rate /
opponent's)^0.1). The second half is tilted the same way (since October
2026; before, it got whatever the first half left, which made the
second-half result too flat: see docs/stats-markets.md, win either half).
Each half is an independent Poisson grid. No new ratings.

## Test
`scripts/halves-lab.ts`: walk-forward over football-data.co.uk half-time
scores, eight leagues, one fit per matchday on prior matches only. Scored
against climatology (the competition's own base rates from the same prior
matches); there are no half-time prices in the source, so no value test.
The tilt was chosen on 2024-25 and confirmed on held-out 2025-26 + 2026-27.

Held-out, 3,386 matches (skill = log-loss improvement over base rates):

| Market | Skill | Calibration (ECE) |
|---|---|---|
| Full-time 1X2 (yardstick) | 7.21% | |
| Half-time result | 4.29% | home 1.6 pt, draw 1.2 pt |
| HT/FT (9-way) | 4.26% | |
| 1st half over 0.5 / 1.5 | 0.55% / 0.92% | 1.3 / 1.2 pt |
| 2nd half over 0.5 / 1.5 | 0.24% / 0.28% | 2.5 / 2.6 pt |
| BTTS first half | 0.33% | 0.1 pt |
| Highest scoring half | −0.04% | |

2024-25 gave the same picture (HT result 4.22%, HT/FT 4.54%).

## Decisions
- **Released, Pro:** half-time result, HT/FT, first- and second-half over/under
  0.5 and 1.5. Accurate and calibrated within about 2.5 points.
- **Not released:** highest scoring half (no skill), BTTS first half (almost
  none and rarely likely).
- **No half-market picks.** The only half selection that clears a 60% bar is
  "2nd half over 0.5" (claimed 78%, landed 80.5%) at about 1.25: honest, but
  barely more informative than always backing it, so it would pad the record
  without telling anyone anything. "HT under 1.5" picks over-claimed in both
  windows (74% claimed, 69–72% landed).
- Known weakness: half-time favourites still win a little more than predicted
  at the top end (54% predicted → 61% landed), and second-half goals run about
  2 points above prediction.
