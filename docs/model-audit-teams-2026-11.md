# Team-markets audit: model, training and evaluation (4 Nov 2026)

Scope: the goals model (`goals-v2`) and everything built on its score grid for
**team** markets: 1X2, double chance, over/under, BTTS, Asian handicap, team
goals, halves, corners/shots counts, and the pick-selection layer on top
(headline ranking, sweet spots, market check, tiers). **Player props are out of
scope** (`player-props*`, `prop-picks`, `props-lab`, lineups/availability).

Method: read every file in `src/lib/model/`, the walk-forward harnesses in
`scripts/`, settlement, and the training-data path (`service.ts`,
`ingestion/`); ran the 191 model/settlement unit tests (all pass); re-ran the
walk-forward myself against football-data.co.uk (8 divisions, seasons
2022-23 → 2026-27) instead of trusting `docs/model-audit-2026-10.md`.

## Verdict in five lines

1. **The core model is sound and the October numbers reproduce.** Poisson
   attack/defence MLE with recency weights, L2 shrinkage, Dixon-Coles rho; a
   real recovery test; probabilities are honest on average.
2. **It is not better than the market, and the gap is stable**: 1X2 log loss
   0.9891 vs closing 0.9676 (2024-25), 0.9976 vs 0.9800 (2025-27); O/U 2.5
   0.678–0.679 vs 0.669. Flat-stake return at close is −3% to −4%. Nothing shipped
   has closed this gap; the October "wins" are pick-rule wins, not probability
   wins. Two untried changes (lower regularisation, wider favourite/underdog
   split) close about 12-15% of it (section E).
3. **The evaluation of the pick layer is the weak link.** Almost every rule
   (sweet spots, tier, market-check gaps, family weights, pauses) was chosen
   *and* reported on the same ~12-month replay, with thresholds picked from a
   sweep of that replay. There is no untouched holdout. The reported lifts
   (0.8pp, 1pp, 5pp) are inside the noise of the sample they were found on.
4. **Two evaluation shortcuts overstate the market check**: closing prices
   stand in for the price at publish, and the live check has 12 samples.
5. **A few concrete defects** (below): no kickoff
   cutoff on match pages, extra-time scores in the national-team pool,
   neutral-venue totals bias, unvalidated newcomer prior on pooled
   competitions.

Severity key: **H** changes numbers users see or decisions already taken;
**M** real but bounded; **L** hygiene.

## A. Defects and risks in the code

### A1 (H) Match pages for finished games show hindsight predictions

`service.ts` `trainingRows()` caches one training set per competition for
30 minutes and applies **no kickoff cutoff**. `matchDetail` / `matchPrediction`
then call `buildPrediction(match, training.rows, …)`. For an upcoming game
that is correct. For a finished game the rows include that game's own result
(and every later one), so the 1X2 split, expected goals and form shown on
`/match/[id]` are refit with the answer in them. The page renders
`prediction.markets` regardless of `match.status`
(`app/(app)/[sport]/match/[id]/page.tsx:269`), as do the SEO metadata, JSON-LD
and share image. The *logged* record is stored at publish time and is not
affected; this is a presentation/credibility issue, not a track-record one, but
anyone comparing a finished game's page to its logged pick will see two
different numbers. **Fix**: when `match.status` is `finished`, read the logged
prediction, or filter `rows` to `date < kickoff` before fitting (and key the
fit cache on the cutoff).

### A2 (retracted) Quarter-line grading is intended; only the comment was wrong

The first version of this audit called `gradeHandicap`'s quarter-line result a
bug. It is not. `slip-tracker.test.ts` pins the rule on purpose: a half win
grades as a win and a half loss as a loss (-0.75 on a one-goal win is a win,
+0.25 on a draw is a win), and plain-line grading of quarter totals gives the
same answers. Only the comment in `settlement.ts` ("settle as a push") was
wrong. Fixed the comment and added tests that pin the real behaviour. I had
changed the grading first; the existing test caught it and the change was
reverted.

### A3 (M) National-team training pool mixes 120-minute and 90-minute scores

`ingestion/.../international_results.py`: "Scores include extra time (the
dataset's definition)". The model is fit and graded on 90-minute markets.
`openfootball.py` deliberately drops ambiguous knockout scores for exactly this
reason; the international source does neither (and `providers/api-football.ts`
maps `goals`, which includes extra time, straight to the final score; I did not
confirm that adapter is keyed in production). A knockout that was 1-1 after 90
and 3-2 after 120 trains as a 3-2 (one draw fewer, two goals more). Small share of
rows, but it biases the draw rate and the goals level of national-team fits
the same direction every time. **Fix**: use the 90-minute score where the
dataset has it, otherwise drop knockout rows that went to extra time, as
`openfootball.py` does. Quantify the share first.

### A4 (M) Neutral venues: totals shrink targets the home-venue mean

`buildPrediction` zeroes `homeAdvantage` for `neutralVenue` leagues but
`calibrateTotals` still pulls the total 20% toward `2 * observedGoalRate`, a
mean that includes home advantage. For an average matchup with home advantage
0.25, neutral total = 2b but the target is 2.284b, so tournament totals are
inflated by ~2.8% (~0.07 goals). Small, one-directional, and over/under at
tournaments is exactly where the line sits close to the model. **Fix**: when
neutral, shrink toward the mean with the home-advantage term removed.

### A5 (M) Promoted-club prior is applied where it was never validated

`newcomerPrior: 0.2` (attack and defence each pulled to −0.2 for a club first
seen > 200 days after the sample starts) was validated on domestic leagues
(`league-lab.ts --newcomer`). `fitLeague(rows)` runs with defaults for **every**
pool, including UEFA cups (`cupPool`), national-team pools and CAF
competitions, where "first seen late" means "plays rarely" or "enters in a
later round", not "just promoted". Those clubs are quietly rated below average.
`cups-lab.ts` fits with defaults, so it measures the combined effect but never
isolates it. **Fix**: set `newcomerPrior: 0` for non-domestic pools, or test it
there with `--newcomer=0` equivalent.

### A6 (L) Smaller code points

- `fitRho` is fitted on the unshrunk, unstretched λ/μ, but applied after
  `calibrateTotals` + `stretchStrength`. The (0,0)/(0,1)/(1,0) correction
  terms depend on λ·μ, so rho is slightly mis-scaled in production. Effect
  is probably tiny; worth one ablation.
- Ratings are fit on a goals/shots-on-target blend but rho and every
  `observedGoalRate`-based step use real goals. Consistent enough, undocumented.
- Halves use `scoreMatrix(λh, μh)` with **rho = 0**, full time uses the fitted
  rho, so HT/FT, "win either half", and the full-time grid don't tie out. Known
  (documented in `halves.ts`), so just keep it out of anything combined with
  full-time legs.
- Stale or misplaced comments: `BASELINE_PRIOR_WEIGHT` says the thinnest
  publishable sample is 15 (it is 200); two doc blocks are stacked above
  `HEADLINE_MIN_PROBABILITY`, and the first ("Markets a headline pick may come
  from") belongs to `headlineByRule`.
- `normaliseKey` is the only team identity in the fit (provider ids are
  ignored). It relies on `canonicaliseRows` linking spellings first; if one
  is missed, the club silently splits into two rated clubs. A club that is not
  found at all gets league-average rates in `expectedRates`; the headline pick
  is then withheld by `assessSufficiency` (fewer than 3 appearances) but the
  probabilities are still displayed. Worth a log line when it happens.
- `SWEET_SPOTS` still lists six handicap rules ≥ 1 goal; they are paused by
  `paused.ts` so they are dead config (only fire if the owner override flips
  them). Fine, but it makes the table look bigger than what actually runs.

## B. Training

| Item | Finding |
|---|---|
| Objective | Weighted Poisson log-likelihood, diagonal Newton, L2 on attack/defence, intercept and home advantage unpenalised. Right design; the unit tests confirm parameter recovery and score-equation convergence. |
| Rho | Grid search after the fact on rows with ≤1 goal each. Fine. |
| Recency | Single global half-life (180d). Same for every league and for national teams, which play ~10 games a year; one 180-day half-life on a sample like that is almost "last 3 games". Not tested per pool. |
| Response | 50% goals + 50% (shots on target × league conversion). Helps log loss in my re-run (see sweep). It discards team-specific finishing, deliberately. Documented. |
| Home advantage | One per league. No team-specific home strength, no neutral handling inside the fit (neutral games in a pool are fit as home games). |
| No cross-league information | Domestic ratings are not linked, so cups/European ties rely on pooled history with no prior from league strength. The CAF/UEFA over-goals miss in the October audit is the visible result. |
| Tuning window | goals-v2 defaults were chosen on 2024-25 and "confirmed" on 2025-26/27. Fine as a procedure. The problem is everything *after* that (section D). |
| Min history | 200 matches per competition to publish; 3 appearances per club. Evidence-based (the backtest cap table in `predict.ts`). |

## C. Evaluation harness

### C1 What it gets right

- Walk-forward with a strict `date < kickoff` (or matchday) cut; the
  "weights depend on today's clock" worry is correctly dismissed (fit is scale
  invariant because the L2 term scales with the weight sum). I checked this
  against the code paths.
- Scores *all* legs, not only picks (`market-audit.ts`), per family, with
  skill against each league's own base rate. This is the right way and is the
  strongest part of the evaluation.
- Closing-price benchmark and flat-stake ROI reported next to hit rate.

### C2 (H) The closing line stands in for the price at publish

`decision-lab.ts --round=check` replays the market check with the
football-data **closing** average. The product checks against SportyBet's price
at publish time, hours earlier, with different margins and less information
(team news, lineups). Closing prices are the sharpest the market ever gets, so
"picks the market rated 3pt+ lower landed 68% vs 79%" is an upper bound on what
a publish-time check can see. The only live evidence is **4 of 12**, which
cannot distinguish a 10-point effect from nothing. Until publish-time
snapshots have a few hundred rows, treat the 77.6% → 78.4% lift as unproven and
the Code Hub 51.6% → 58.0% as the same.

### C3 (H) Thresholds and rules are tuned and reported on one window

Replay window: last 365 days, 17 divisions, 5,564 picks. Selection done on it:

- market-check gaps (3pt picks / 5pt legs; `decision-lab.ts` sweeps
  `[0.02, 0.03, 0.04, 0.05, 0.08]` and reports the chosen);
- unders paused (read off the same window);
- `HEADLINE_MIN_PROBABILITY` (away 65%, over 2.5 70%);
- `STRONG_CONFIDENCE` moved 60 → 63 on 17 Oct when sweet spots changed the
  probability mix, then reported as "63+ landed 86.3%" on the same replay;
- sweet spots: lowest chance at which 2024-25 hit 82%, then "refitted on both
  seasons", with rule ranking by in-sample `record`.

Two consequences: reported hit rates after each rule are optimistic (winner's
curse is certain where a rule is the best of N thresholds on 100–300 picks),
and the rules change what is in the sample, so later rules are tuned on a
population already shaped by earlier ones. The sweet-spot comment is honest
that 2025-26 was a separate test, but the sentence after it ("Goal thresholds
and records were refitted on both seasons") removes that independence.

### C4 (M) Pick-level differences are inside the noise

With n ≈ 3,600–5,500 picks the binomial standard error on a hit rate is
0.55–0.7pp. Changes decided on 0.4–1.0pp (77.6 → 78.4, 77.6 → 76.6, half-life
180 → 120 = 77.2) are mostly not distinguishable. My sweep shows the same:
configurations within 0.001 log loss of each other differ by up to 2pp in picks
hit and 1.4pp in ROI (section E).
Decisions should be taken on log loss over all fixtures (low variance) and
confirmed with a paired bootstrap on picks, not on pick hit rate.

### C5 (M) Harnesses disagree on the training set

`model-lab.ts` trains on all prior seasons; `decision-lab.ts` caps at 1,200
rows (`TRAIN_CAP`); `backtest.ts` uses everything per row. Production uses the
whole archive. Numbers from different labs are not directly comparable
(77.1% in model-lab vs 75–76% quoted elsewhere is partly this).

### C6 (L) Other evaluation notes

- Brier / hit rate on *picked* selections is selected on high model
  probability, so it measures the winner's curse as much as accuracy. The
  family audit on all legs is the right counter-measure and should be what the
  admin page quotes.
- No test asserts that `buildPrediction` is invariant to rows dated after
  kickoff (a one-line leakage regression test would have caught A1's cousin
  in any lab).
- football-data.co.uk covers ~17 divisions; the cups, MLS, Brazil, NPFL, CAF
  and internationals (where the product's weakest numbers live) have no
  closing-price benchmark at all. For those, accuracy is checked only against
  the model's own claims.
- Time zone: kickoffs are parsed as UTC from UK-local times and default to
  15:00 where `Time` is missing (older seasons). Harmless for walk-forward.

## D. Pick-selection layer

- Headline ranking is `probability + value/0.6` over an eligible list with
  family reliability constants (1.0, 1.0, 0.88, 0.68) measured on 2023-25.
  This is documented as a ranking device, and it is stable enough.
- Sweet spots, market check, pauses and tiers sit on top and are where the
  quoted 82–86% numbers come from. Fair odds ~1.24 mean the product trades
  ROI for hit rate by construction ("Win rate is bought with shorter prices",
  in the code's own comment). With bookmaker margin, ROI is negative at any
  hit rate this high unless the model beats the close, which it does not
  (verdict point 2). That is a **product-claims** issue to be careful with,
  not a bug.

## E. Re-run results

(Re-ran `scripts/model-lab.ts`, walk-forward per matchday, 8 divisions,
fits on all earlier seasons back to 2022-23; log loss lower is better.)

Held-out window 2025-26 + 2026-27 to date (3,641 headline picks; market
1X2 0.9800, O/U 0.6692). One change at a time against the shipped defaults.

| Change | 1X2 log loss | O/U 2.5 log loss | Pick hit | ROI at close |
|---|---|---|---|---|
| **shipped defaults** | 0.9976 | 0.6787 | 77.1% | −4.20% |
| shot weight 0 / 0.25 / 0.75 / 1 | 0.9997 / 0.9978 / 0.9990 / 1.0021 | 0.6818 / 0.6798 / 0.6785 / 0.6793 | 75.0 / 75.7 / 77.1 / 77.3% | −5.07 / −5.45 / −4.40 / −4.17% |
| totals shrink 0.6 / 1.0 (shipped 0.8) | 0.9978 / 0.9974 | 0.6790 / 0.6794 | 77.4 / 76.7% | −4.23 / −4.50% |
| half-life 120 / 270 / 365 (shipped 180) | 0.9984 / 0.9976 / 0.9978 | 0.6798 / 0.6783 / 0.6782 | 76.4 / 77.3 / 77.4% | −4.59 / −4.18 / −4.08% |
| regularisation 0.005 / 0.02 (shipped 0.01) | **0.9963** / 1.0010 | 0.6792 / 0.6784 | 76.6 / 77.9% | −4.05 / −3.98% |
| newcomer prior 0 / 0.4 (shipped 0.2) | 0.9982 / 0.9977 | 0.6788 / 0.6786 | 77.4 / 77.0% | −4.04 / −3.98% |
| draw ×1.05 / ×0.95 | 0.9974 / 0.9982 | 0.6791 / 0.6783 | 76.5 / 76.9% | −5.22 / −4.50% |
| strength stretch 1.1 | **0.9953** | 0.6787 | 76.2% | −4.75% |
| goal scale 1.02 | 0.9975 | **0.6774** | 77.1% | −4.57% |

What this says:

- **The settings are on a flat optimum.** Shot weight, totals shrink, half-life,
  newcomer prior and draw factor all move log loss by 0.001 or less. The
  October tuning found real structure (shots help: weight 0 is 0.002 worse on
  1X2 and 0.003 worse on O/U) and then ran out of signal. More knob-turning on
  this model will not close a 0.018 gap.
- **Two settings are not at their optimum, and the cause is the same.**
  Lower regularisation (0.005) and a wider gap between the sides (stretch 1.1)
  each improve 1X2 log loss on the held-out window *and* on 2024-25, the window
  the defaults were chosen on:

| Window | default | reg 0.005 | stretch 1.1 | reg 0.005 + stretch 1.1 + goal scale 1.02 | market |
|---|---|---|---|---|---|
| 2024-25, 1X2 log loss | 0.9891 | 0.9879 | 0.9871 | 0.9866 | 0.9676 |
| 2025-27, 1X2 log loss | 0.9976 | 0.9963 | 0.9953 | 0.9946 | 0.9800 |
| 2024-25, pick hit | 76.8% | 75.8% | 75.7% | 75.0% | |
| 2025-27, pick hit | 77.1% | 76.6% | 76.2% | 75.7% | |

  That is the model being slightly under-confident on strong sides (the same
  fact the October audit found in the 65%+ home-win and half-goal-handicap
  rows, "claimed 71.9% landed 80.5%"). Fixing it improves the probabilities by
  ~0.0025–0.003 log loss (12–15% of the gap to the close) on both windows, and
  **lowers the pick hit rate by 1–2 points**. The October audit rejected the
  same direction (stretch 1.2) on exactly that pick-rate result. I think that
  was the wrong test: the pick layer's thresholds (sweet-spot minimums such as
  home win ≥ 69%, `HEADLINE_MIN_PROBABILITY`, the 80/85% caps, the tier cut)
  were all fitted to the *current* probabilities, so they are partly calibration
  corrections in disguise. Change the probabilities and the rules need
  re-deriving on the new ones; judging the change by the old rules' hit rate
  penalises it for being more correct. Not shipped, not tuned further: these
  numbers were seen on the held-out window, so they are leads, not results.
- **Goal scale 1.02 is not a fixed bias.** It helps O/U on 2025-27 (−0.0013)
  and hurts on 2024-25 (+0.0006): scoring levels drifted up and the 180-day
  half-life lags them. A constant is the wrong fix; a faster-moving league
  scoring level (separate, shorter half-life for the intercept only) is the
  candidate.
- **Pick hit rate is the noisiest column.** Settings within 0.001 log loss of
  each other differ by up to 2 points of hit rate and 1.4 of ROI. Not
  paired-bootstrapped here; log-loss differences of 0.002–0.003 on 3,000–3,600
  fixtures are likely but not certain to be real.

## F. Recommended work, in order

1. **Fix A1** (cutoff for finished games). Small, contained, no model change. (Done, section G.)
2. **Freeze a holdout.** From now on, nothing tuned on data after a fixed date
   (suggest 1 Nov 2026) until a rule is final; evaluate every pick-layer
   change once on it. Re-evaluate the market check on publish-time SportyBet
   snapshots only (the table exists, `predictions_log` closing/publish prices).
3. **A3/A4/A5**: the three data/parameter defects for national-team and
   pooled competitions, each testable in `cups-lab.ts` / `league-lab.ts`.
4. **Evaluation hygiene**: one shared walk-forward module used by every lab
   (same training cap, same cut rule), paired-bootstrap CIs in the output, and
   the leakage regression test.
5. **Re-derive the pick layer on better probabilities.** Section E: lower
   regularisation plus a 1.1 strength stretch improve 1X2 log loss on both
   windows but cost 1-2pp of pick hit rate, because the rules were fitted to
   the under-confident numbers. Test the probability change on a fresh
   holdout, then re-fit thresholds/sweet spots on the new probabilities (with
   the holdout from step 2), rather than rejecting it on the old rules.
6. **Where the real upside is** (model, not rules): the gap to the close is
   ~0.02 log loss on 1X2. Ideas that fit this codebase and are *probability*
   improvements, each cheap to test in `model-lab.ts`: (i) a separate
   home/away attack-defence split for large samples, (ii) a league-strength
   prior so cup and early-season ties use cross-league information, (iii)
   per-pool half-lives, (iv) using the existing Elo (`ingestion/elo.py`,
   currently display only) as a prior or a feature, (v) a market-informed
   total for the over/under family, which the code already measured doubles
   skill (`market-total.ts` / `docs/stats-markets.md`) and is shadow-only.

## Reproduce

    npx vitest run src/lib/model src/lib/settlement
    npx tsx scripts/audit-eval.ts --cfg=legacy --out=<dir>/legacy.json   # also --cfg=next, ns_*, see CONFIGS
    npx tsx scripts/audit-report.ts --dir=<dir> --base=legacy --cfgs=next --win=A|H|B|M
    npx tsx scripts/audit-layer.ts --dir=<dir> --cfgs=ns_legacy,ns_c11   # refit the sweet-spot layer
    npx tsx scripts/model-lab.ts --from=2425 --to=2425
    npx tsx scripts/model-lab.ts --from=2526 --to=2627
    npx tsx scripts/market-audit.ts       # per-family calibration and skill

## G. What was done on 4 Nov 2026 (follow-up)

Everything below is gated on kickoff: games before **5 Nov 2026 00:00 Lagos**
keep the parameters they were published under, to the millisecond
(`src/lib/model/params.ts`, tests in `params.test.ts`). Today's picks do not move.

**Shipped (from 5 Nov)**

| Change | Evidence |
|---|---|
| No headline pick below 65% | Ranker picks stated 60-65% landed 60.5% (replay 2025-26, n=243), 61.0% (Sep-Oct 2026 replay, n=41), 63.3% (live since 7 Oct, n=49); 65%+ landed at or above stated. Hit rate +0.53 / +0.73 / +0.63 points on the three samples. Costs ~4% of games their pick. |
| Overs tilt 0.02 in the headline ranking | Owner's request. Neutral on replay (+0.16 and 0.00 points, interval includes 0); adds ~30% more over picks. A 0.04 tilt and a 65% bar for over 2.5 were tested and not better. |
| CAF Champions League: no headline pick | 9 of 23 live picks landed against 64% stated (thin pooled history; the Oct audit's market check already flagged its over-goals picks). Reversible: `headlineHold` in `params.ts`. |
| Neutral-venue totals fix (A4) | Arithmetic and unit test; no replay data for tournaments. |
| Promoted-club prior off for pooled competitions (A5) | Principle only; it was never tested outside domestic leagues. |
| Finished games predict from results before kickoff (A1) | Unit tests (`as-of.test.ts`). |
| Quarter-line comment fixed, behaviour pinned by tests (A2) | See A2. |

**End to end through the real `buildPrediction`** (`audit-eval.ts --cfg=next`
against `--cfg=legacy`; 17 divisions, walk-forward):

| Sample | Fixtures | Hit: before | after | Change (95%) | Picks kept |
|---|---|---|---|---|---|
| A: Aug 2023 - Jun 2026 | 17,857 | 77.2% | 77.8% | +0.64 (0.40 to 0.89) | 96.5% |
| A held out: 2025-26 | 5,911 | 77.1% | 78.0% | +0.87 (0.35 to 1.44) | 96.3% |
| B: Sep - Oct 2026 | 1,165 | 78.0% | 78.4% | +0.47 (-0.37 to 1.52) | 97.0% |

Probabilities (log loss) are unchanged by the shipped set; it works on which
picks go out.

**Tested and not shipped**

| Change | Result |
|---|---|
| Lower regularisation + strength stretch 1.1 / 1.2 | 1X2 log loss -0.0024 to -0.0028 (interval excludes 0), but pick hit -0.7 to -1.2 points. With the sweet-spot rules refitted on its own numbers (derive 2023-25, score 2025-26) hit was 76.4% against 77.3% for the current model refitted the same way. Better probabilities, not better picks. |
| Recent scoring-level adjustment (60 / 90-day) | No change on A (O/U log loss 0.6821 against 0.6820); a small gain only on Sep-Oct. |
| Over 2.5 bar at 65% instead of 70% | Hit -0.69 on B. |

**Where the decline came from.** Live, `goals-v1` (to 6 Oct) landed 66.3% against
69.9% stated, and picks with no league code (trained on 15-35 results)
57.8% against 72.3% (n=166). Since the switch to `goals-v2` on 6 Oct:
75.8% against 75.2% stated on 1,032 picks. Replaying `goals-v2` on September
and October fixtures gives 76.8% and 78.9%, so the model change had already
fixed most of it. Unders landed 56.1% against 72.4% in Sep-Oct (paused 16 Oct).

**Still open:** A3 (extra-time scores in the national-team data; the source
carries no flag to separate them), corners picks overstated live (75.0% against
81.8% stated, n=48), Liga MX 62.8% against 74.0% (n=43), the market check's
evidence (closing prices stand in for publish-time prices), and the frozen
holdout recommended in section F.
