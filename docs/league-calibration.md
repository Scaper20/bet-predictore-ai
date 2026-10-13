# Per-league draw and goals corrections (tested 13 Oct 2026, not shipped)

## Why this was tested

The first week of Strike 2's live record (183 graded picks, 78.1% won against
74.2% expected) had a few leagues below expectation:

- **MLS, Liga MX and the Bundesliga:** "home or away" picks losing to draws.
- **Brazil, La Liga 2 and the Premier League:** over/under picks missing.

Every league already has its own fit: scoring level, home advantage and the
Dixon-Coles low-score correction. The question was whether a further
per-league correction, measured from each league's own recent results, helps.

## What was tested

`scripts/calibration-lab.ts` replays each fixture of the last two years in 21
leagues. Each prediction uses only results from before its matchday, exactly
as production does. The variants:

- **draw c=30 / c=100:** drawn scorelines scaled by (observed draws + c) /
  (draws the fit gives its own training games + c), per league.
- **goals c=20 / c=60:** both goal rates scaled by recent observed goals over
  the fit's projected goals (90-day half-life), per league.
- **draw x1.03 / x1.05:** one draw factor for every league.

Two windows were run: the year to 13 Oct 2026 (7,460 fixtures) and the year
before (7,850).

## Results

| Variant | 1X2 log loss (year before / last year) | Picks won (year before / last year) |
|---|---|---|
| shipped model | 1.0147 / 1.0221 | 75.2% / 74.9% |
| draw c=30 | 1.0142 / 1.0220 | 75.4% / 74.8% |
| draw x1.03 | 1.0146 / 1.0220 | 75.6% / 74.5% |
| goals c=60 | 1.0148 / 1.0222 | 74.7% / 75.0% |

None of them is a consistent improvement. The draw corrections move log loss
by under 0.001 and move pick hit rates up in one year and down in the other.
The goals correction is slightly worse in both windows.

## Why

A league's draw rate and goal level swing from season to season. Measuring
last season's rate does not predict this season's:

| League | Draws, year before | Draws, last year |
|---|---|---|
| Greek Super League | 20.4% | 28.7% |
| La Liga 2 | 28.6% | 23.2% |
| Premier League | 23.7% | 28.3% |

The same is true of the leagues flagged live. MLS picks won 77.1% against
74.6% claimed in the earlier year, then 71.5% against 74.3% last year. Liga MX
went from 79.3% to 71.7%. That is noise the size of a season, not a bias a
correction can learn.

The model's "home or away" picks are calibrated over both years: 75.0%
against 75.2% claimed, then 76.8% against 75.8%. The live losses to draws are
within what one week can produce.

## Decision

No change to Strike 2. The knobs stay in `buildPrediction` (`drawInflation`,
`goalScale`, both off by default) so the test can be rerun as the live record
grows. Revisit when a league has 30+ graded live picks well below expectation.
