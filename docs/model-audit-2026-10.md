# Model audit, October 2026: every market, and how picks are chosen

Asked for after the SportyBet market work: recalibrate Forge picks, Asian
handicaps, corners, shots and goals; measure accuracy; and look at how the
model decides, prompted by Rayo Vallecano v Elche (picked Home or Draw, ended
0-2 to Elche).

## Short version

- **The chances are honest across the board.** On 6,820 held-out games (July
  2025 to October 2026, 17 European divisions, every leg priced the way
  SportyBet settles it) every family is within 3 points on average. Corners,
  shots and shots on target are within 1 point, even at 75%+.
- **The model is cautious on its strongest result picks**: home wins it
  rates 65%+ land 80.5% (claimed 71.9%), half-goal handicaps given 65%+ land
  79.7% (claimed 71.6%). That is the safe direction. Correcting it makes the
  picks themselves worse (tested below), so it stays.
- **The closing market is sharper than the model** on 1X2, double chance and
  over/under 2.5, and blending the two adds nothing. Where they disagree,
  the market is usually right: picks the market rated 3 points or more below
  the model landed 68.0% against 79.1% for the rest.
- **Shipped: a market check.**
  - Every headline pick and every combo leg is checked against SportyBet's own price before it goes out.
  - Over the last 365 days it lifts published picks from 77.6% to 78.4% landed, without losing a pick.
  - The 2-odds Code Hub code improves from 51.6% to 58.0%.
- **Rayo v Elche was not a blind spot.** The model had Home or Draw at 76.1%;
  SportyBet had it at 77.7% when we published and 78.0% at kick-off. A
  three-in-four shot that missed. The market check would not have changed it.

## Accuracy by family (held out, July 2025 on)

"Claimed → landed" is the average chance given and how often it came in.
Calibration error is the average gap across 5-point bands. Skill is the cut
in log loss against each division's own base rate for that selection.

| Family | Legs | Calibration error | Skill | 65%+ claimed → landed (n) | 75%+ claimed → landed (n) |
|---|---|---|---|---|---|
| 1X2 home | 6,820 | 2.9pt | 7.6% | 71.9 → 80.5% (333) | 79.3 → 84.7% (85) |
| 1X2 away | 6,820 | 2.1pt | 7.4% | 70.3 → 79.2% (72) | – |
| 1X2 draw | 6,820 | 1.6pt | 0.8% | – | – |
| DC home or draw | 6,820 | 2.1pt | 7.4% | 74.5 → 76.3% (4,506) | 80.7 → 84.1% (1,869) |
| DC away or draw | 6,820 | 2.9pt | 7.6% | 72.5 → 76.4% (1,659) | 80.3 → 85.0% (507) |
| DC home or away | 6,820 | 1.6pt | 0.8% | 74.6 → 73.5% (6,816) | 77.6 → 76.3% (2,721) |
| Over (half lines) | 34,100 | 1.1pt | 1.1% | 79.3 → 80.6% (9,314) | 84.3 → 85.4% (5,903) |
| Under (half lines) | 34,100 | 1.1pt | 1.1% | 79.9 → 79.8% (11,887) | 83.8 → 83.8% (8,384) |
| O/U quarter lines | 27,280 | 0.6pt | 1.0% | 74.5 → 74.7% (12,359) | 79.2 → 79.0% (5,626) |
| GG/NG | 13,640 | 0.9pt | 0.3% | 67.0 → 63.3% (128) | – |
| AH getting (+0.5, +1.5, +2.5) | 40,920 | 1.2pt | 7.9% | 80.7 → 81.8% (21,668) | 84.6 → 85.9% (15,789) |
| AH giving (−0.5, −1.5, −2.5) | 40,920 | 1.2pt | 7.9% | 71.6 → 79.7% (418) | 79.1 → 83.2% (95) |
| AH whole lines (refund) | 68,200 | 1.3pt | 7.8% | 80.5 → 81.8% (22,086) | 84.6 → 85.8% (15,884) |
| AH quarter lines | 95,480 | 1.7pt | 7.6% | 78.9 → 80.8% (35,465) | 83.4 → 85.4% (23,474) |
| 3-way handicap draw | 13,640 | 1.1pt | 2.1% | – | – |
| Team goals over | 40,920 | 1.1pt | 4.4% | 75.3 → 76.9% (11,293) | 80.5 → 82.4% (5,492) |
| Team goals under | 40,920 | 1.1pt | 4.4% | 79.6 → 79.4% (16,880) | 84.2 → 84.2% (11,459) |
| Corners total | 81,828 | 1.0pt | 0.7% | 75.0 → 74.0% (24,148) | 80.3 → 79.4% (11,570) |
| Corners team | 136,380 | 0.5pt | 3.8% | 77.0 → 76.4% (40,700) | 82.4 → 81.5% (23,053) |
| Corners most (1X2) | 34,095 | 1.0pt | 5.0% | 73.2 → 72.0% (5,599) | 80.3 → 80.1% (1,886) |
| Corners handicap | 109,104 | 0.6pt | 5.8% | 77.6 → 76.9% (32,519) | 82.8 → 82.2% (19,227) |
| Shots total | 81,828 | 0.6pt | 4.3% | 77.5 → 77.2% (25,693) | 82.6 → 82.2% (15,264) |
| Shots team | 136,380 | 0.7pt | 9.3% | 78.4 → 77.8% (39,925) | 83.3 → 82.9% (25,013) |
| Shots most (1X2) | 34,095 | 0.7pt | 10.4% | 76.1 → 75.7% (7,262) | 82.1 → 81.3% (3,724) |
| Shots handicap | 109,104 | 0.7pt | 11.9% | 78.3 → 77.4% (30,787) | 83.4 → 82.4% (19,149) |
| Shots on target total | 81,828 | 0.4pt | 2.4% | 76.5 → 76.0% (24,924) | 81.9 → 81.6% (13,460) |
| Shots on target team | 136,380 | 0.6pt | 6.2% | 78.1 → 77.5% (41,878) | 83.1 → 82.4% (25,931) |
| Shots on target most (1X2) | 34,095 | 0.7pt | 8.0% | 74.7 → 75.0% (6,303) | 81.4 → 82.8% (2,701) |
| Shots on target handicap | 109,104 | 0.4pt | 9.2% | 78.9 → 78.4% (32,152) | 83.6 → 82.9% (21,048) |

Bookings (yellow 1, red 2) are in `docs/stats-markets.md`: within 1–2 points,
1.3–2.1% skill. They are priced and read, never picked.

Against the pass bar set for this audit:

- **Calibrated within 2 points:** every family except 1X2 home and DC away
  or draw (2.9 each), where the model is cautious.
- **Claimed vs landed within ±3 points on 100+ picks:** every stat family and
  every goals line. The misses are the strong result and handicap picks
  above, all landing more often than claimed. GG/NG at 65%+ lands less
  (63.3% against 67.0%, 128 picks); it stays shown, never picked.
- **Positive skill:** every family. The draw (0.8%) and GG/NG (0.3%) barely
  beat their base rate.

## Against the market

| Selection | Log loss: model | market | best blend |
|---|---|---|---|
| Home win | 0.633 | 0.616 | 0.616 (all market) |
| Draw | 0.575 | 0.571 | 0.571 (all market) |
| Away win | 0.573 | 0.560 | 0.560 (all market) |
| Over 2.5 | 0.684 | 0.676 | 0.676 (all market) |

The closing market is a consensus of twenty-odd bookmakers at kick-off. A
blend weight fitted on the 2024-25 season gave the model no weight at all.
So the model's numbers stay its own, and the market is used as a veto where
the two disagree.

## Draws and home advantage

| | Home | Draw | Away |
|---|---|---|---|
| Model | 43% | 25% | 32% |
| Market | 43% | 26% | 31% |
| What happened | 43% | 26% | 31% |

Over all 17 divisions the model's split matches what happened to within a
point. By division the biggest miss is Ligue 2: draws ran 32% against the
model's 26% and the market's 28%. Serie B away wins ran 25% against 29%.
Neither is a pattern the rest of Europe shares, so no per-league draw change.
The market check catches the individual games where it matters.

## How picks are chosen now

**The market check** (`src/lib/market-check.ts`), on every surface that
publishes or builds:

- **Headline pick** (match page, predictions list, digest, the logged record):
  - When SportyBet rates the model's pick 3 points or more lower, the game's next headline pick takes its place. That pick must be at least as likely as the market makes the old one, with each judged by the lower of the model's and the market's chance.
  - With no such pick, the old one stands if the market still has it at 60% or more. Otherwise the game gets no pick.
  - The match page says what was set aside and why.
- **Code Hub, Forge, the code editor:** any leg SportyBet rates 5 points or
  more below the model is left out.

Replayed over the last 365 days (closing prices standing in for SportyBet's
at publish, `scripts/decision-lab.ts --round=check`):

| | Picks | Landed | Stated |
|---|---|---|---|
| As published | 5,564 | 77.6% | 75.5% |
| With the market check | 5,564 | 78.4% | 75.6% |
| The picks it set aside (would have landed) | 788 | 68.0% | 73.5% |
| The picks it swapped in | 612 | 73.9% | 73.0% |

| Code Hub code | As shipped | With legs checked |
|---|---|---|
| 2 odds | 51.6% | 58.0% |
| 3 odds | 34.0% | 37.0% |
| 5 odds | 22.5% | 21.3% |
| 10 odds | 10.5% | 12.3% |
| 20 odds | 6.4% | 7.9% |
| Days with at least one code landed | 71% | 75% |

**Live so far (October 2026):**

- Of the few logged picks that had a SportyBet price when published, those SportyBet rated 5+ points below us landed 4 of 12, against 77.8% where the two agreed.
- Until now the price was stamped on only about 1 logged pick in 15. It is now read from the stored board when no snapshot exists, so the check can be followed on the record.

**On today's slate (24 Oct)**, the check set aside three CAF Champions League
over-goals picks. The model rated them 63–74%; SportyBet rated them 25–41%.
Goal totals in that competition, built on thin pooled history, are the clearest
model weakness this audit found.

## Tested and not shipped

| Change | Effect on published picks (last 365 days) |
|---|---|
| Widen the gap between the sides (strength stretch 1.2) | Stated chance closer to landed (gap +0.6 from +2.0), but picks fell from 77.6% to 76.6% landed |
| Shorter memory (half-life 120 or 90 days, from 180) | 77.2% and 76.9% landed |
| Calibration map per family (Platt, fitted on 2024-25) | Calibration error down 0.5–1 point on goal families, picks unchanged in order. Left off, as the earlier straight-win correction made picks worse (`model/result-calibration.ts`) |
| Away-attack guard on Home or Draw (skip when away xG ≥ 0.7 × home xG) | The skipped picks landed 73.1% at a stated 72.1%: honestly priced, so the rule only cuts volume |

## Rayo Vallecano v Elche, 24 October

- **Our pick:** Home or Draw, 76.1%. SportyBet had it at 77.7% at publish and 78.0% at close. It ended 0-2 (the archive records 0-3).
- **Rayo before the game:** 1.50 scored and 2.13 conceded a game, unbeaten at home.
- **Elche before the game:** 1.22 scored and 1.89 conceded, 1.4 a game away from home. Elche's away attack was real, but over the season they did not out-score Rayo.
- **The verdict:** model and market agreed. This was the one-in-four that happens, not a misread. The market check does not touch a pick the market rates higher than we do.

## Reproduce

    npx tsx scripts/niche-lab.ts --stage=predict        # walk-forward predictions (slow, once)
    npx tsx scripts/market-audit.ts                     # every family, against the market, draws, pick rules
    npx tsx scripts/decision-lab.ts --round=check       # the market check on published picks
    npx tsx scripts/decision-lab.ts --hub=8,15,16 --examples   # the Code Hub with legs checked
    npx tsx scripts/decision-lab.ts --round=check --stretch=1.2
    npx tsx scripts/decision-lab.ts --round=check --halflife=120
