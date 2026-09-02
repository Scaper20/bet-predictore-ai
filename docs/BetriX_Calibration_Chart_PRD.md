# Product Requirements Document
## Calibration Chart & Track Record Interactivity

*Enhancing the BetriX track record page with model-transparency tooling and drill-down navigation*

| Field | Detail |
|---|---|
| Product | BetriX — Football Prediction & Analytics Platform |
| Owner | Stag — Founder, Scaper Web Studio |
| Status | Draft for review |
| Target surface | Track Record page (web app) |
| Stack touched | Next.js/Vercel frontend, Supabase (DB), API-Football / football-data.org / TheSportsDB feeds |

---

## 1. Feature Overview

### 1.1 Problem Statement

BetriX currently presents its track record as a flat, static list of past predictions and outcomes. This tells a user whether the platform has been right or wrong, but not whether it is well-calibrated — i.e., whether a prediction it labels "70% likely" actually wins roughly 70% of the time. Raw win rate is easy to game or misread (a model that only predicts heavy favorites can post a high win rate while being statistically lazy). Bettors and analysts who understand probability want proof of reliability, not just a scoreboard.

Separately, the track record list is a dead end: users can see that a prediction happened, but cannot inspect why the model produced it or how the match actually played out.

### 1.2 Proposed Solution

Two related additions to the Track Record interface:

- A **Calibration Chart** that plots predicted probability against actual hit rate across historical predictions, exposing model reliability at a glance for users who want the statistical depth.
- An **interactive, clickable track record list** where every entry opens a dedicated Match Details page with the full breakdown for that prediction.

### 1.3 A note on audience — addressing the "too technical" concern

You're right to flag this: a raw calibration scatter plot with axis labels reading "Predicted Probability" vs. "Actual Hit Rate," plus tooltip copy about overconfidence and underconfidence, is analyst-grade language. Most casual bettors browsing a track record page will not know what a 45-degree reference line means, and burying that explanation in the default view creates friction rather than trust.

The recommendation is a **tiered disclosure model** rather than dropping the full chart on every user:

- **Tier 1 (default, everyone sees this):** a single plain-language headline — a "Calibration Score" badge (e.g., "96% Reliable") with one short sentence: *"When BetriX says 70%, it wins about 70% of the time."* No jargon, no chart.
- **Tier 2 (one tap away):** an expandable "View the data" panel that reveals the full calibration chart, bucket table, and the explanatory tooltips — for the minority of users (analysts, skeptics, journalists, potential partners) who want to audit the claim.
- The technical language stays, but it moves from being forced on everyone to being available for those who go looking for it — which also strengthens the credibility story, since it now reads as "we have nothing to hide" rather than "here's a stats lecture."

> **Design principle:** Default to a plain-language verdict. Let statistical depth be opt-in, not mandatory. The chart should feel like it's there for anyone who wants to check the math — not something every visitor has to parse to use the page.

---

## 2. User Experience (UX) Design

### 2.1 Track Record Page — Structure

- Header summary strip: overall record (W/L/Push), overall hit-rate %, and the new Calibration Score badge sit side by side as three equal-weight headline stats.
- Below the strip: the interactive track record list (see 2.3).
- Calibration detail panel is collapsed by default beneath the summary strip, opened via a "View the data" / "How reliable are we, really?" link next to the Calibration Score badge.

### 2.2 Calibration Chart (Tier 2 detail panel)

**Layout**

- Chart type: line-and-marker plot. X-axis = Predicted Probability (binned, e.g., 50–55%, 55–60% … 95–100%). Y-axis = Actual Hit Rate for predictions in that bin.
- A dashed 45° reference line runs corner to corner, representing perfect calibration (predicted = actual).
- Each bucket marker is sized or shaded by sample size (n) in that bucket, so users can visually distinguish a reliable bucket (large n) from a noisy one (small n) without reading a tooltip.
- Buckets with n below a minimum threshold (configurable; suggested default n < 20) are rendered as hollow/greyed-out markers with a "low sample size" tag rather than hidden — avoids silently cherry-picking only strong buckets.

**Interpretive guidance (progressive, not forced)**

- A single caption line sits above the chart by default: *"Points on the dashed line mean our predictions matched reality. Above the line = we were too cautious; below = we were overconfident."* One sentence, plain words.
- Hover/tap tooltip per point (opt-in, not auto-shown): *"Predicted 65–70% · Actual hit rate 68% · 142 predictions."* Deeper explanation text ("overconfidence / underconfidence") is available via a small (i) info icon next to the chart title — not repeated on every point.
- No jargon in the default state: avoid "calibration error," "Brier score," "reliability diagram" as visible UI labels. Reserve those terms for an optional "Methodology" link/page for advanced users.

**Value framing on-page**

A short strip beneath the chart states the differentiator directly, e.g.: *"Most tipsters show you a win rate. We show you whether our confidence levels can be trusted — because a 90% pick should win far more often than a 55% pick."* This carries the competitive positioning without requiring the user to interpret the chart themselves.

### 2.3 Track Record List — Interactivity

- Each row (fixture, date, market, predicted probability, predicted outcome, actual result, stake/units if applicable) becomes a clickable/tappable target with hover state and a chevron affordance.
- Clicking/tapping navigates to `/matches/[matchId]` — the Match Details page — using client-side routing (no full page reload).
- Row click target should be the full row, not just the fixture name, for mobile usability.
- Keyboard and screen-reader accessible: rows are real links (or `role="link"` with proper focus states), not click-handlers on non-interactive elements.

### 2.4 Match Details Page

- Fixture header: teams, competition, kickoff date/time, final score.
- Model output at time of prediction: predicted probabilities for each outcome, the market analyzed, value-vs-bookmaker-odds delta, and Kelly-criterion stake guidance shown for that pick.
- Result reconciliation: what actually happened vs. what was predicted, in plain language ("Predicted: Home win, 62% · Actual: Home win — correct").
- Optional AI-generated match analysis (existing BetriX feature) surfaced here if it was generated for that fixture.
- Breadcrumb / back-to-track-record navigation preserved, including scroll position on return.

---

## 3. Technical Requirements

### 3.1 Data Logic — Binning & Calibration Calculation

- Source table: existing Supabase `predictions` table (`predicted_probability`, `actual_outcome`, `match_id`, `market_type`, `created_at`, `settled_at`).
- Bucket definition: fixed-width bins across `predicted_probability`, default width 5% (configurable), covering the full 0–100% range actually used by the model (in practice BetriX's range will cluster in the 30–90% band given football outcome probabilities).
- Per bucket, compute: `n` (count of settled predictions in bucket), `actual_hit_rate` = (count of predictions where outcome occurred) / n, `mean_predicted_probability` (average predicted probability within the bucket, used as the plotted x-position instead of the bin midpoint for more accurate plotting).
- Only include settled predictions (`settled_at IS NOT NULL`); void/postponed/void-market predictions excluded from the denominator.
- Recompute on a schedule (e.g., nightly job) or on-demand via a cached API route — not computed client-side from raw rows, to avoid shipping the full prediction history to the browser.
- Optionally segment calibration by `market_type` (1X2, Over/Under, BTTS, etc.) via a filter control, since a model can be well-calibrated on one market and not another — surfaced as a secondary, opt-in filter, not the default view.

### 3.2 API Design

| Endpoint | Purpose |
|---|---|
| `GET /api/calibration` | Returns bucketed calibration data: `[{ bucket, mean_predicted, actual_hit_rate, n }]`, plus overall calibration score. |
| `GET /api/calibration?market=btts` | Same, filtered to a single market type. |
| `GET /api/track-record` | Paginated list of settled predictions for the list view (existing, extended with `matchId` for linking). |
| `GET /api/matches/[matchId]` | Full detail payload for the Match Details page: fixture info, prediction snapshot, result, AI analysis if present. |

### 3.3 Frontend Implementation

- Chart rendering: lightweight charting library already suited to the Next.js stack (e.g., Recharts) rendering the scatter/line plot with the reference line as an overlaid `ReferenceLine`/annotation, not a manually drawn SVG diagonal.
- Calibration Score badge: single derived metric (e.g., mean absolute deviation between predicted and actual across buckets, inverted into a 0–100 "reliability" display score) computed server-side and cached alongside the bucket payload.
- Track record list rows: convert existing list-rendering component to use Next.js `<Link>` per row for prefetching and proper navigation semantics; avoid onClick-only handlers.
- Match Details route: dynamic route `/matches/[matchId]` with server-side data fetch (SSR or static-with-revalidate depending on how far in the past the match is) so shared links render correctly for logged-out/social previews.
- Loading/empty states: if a market or period has too few settled predictions for a meaningful calibration read, show a plain "Not enough settled predictions yet for this view" message rather than an empty or misleading chart.

### 3.4 Data Integrity & Edge Cases

- Predictions must be locked (probability frozen) at time of publication so calibration reflects genuine pre-match confidence, not a value recalculated after the fact.
- Exclude any predictions edited or withdrawn after kickoff from the calibration set, to prevent retroactive cherry-picking.
- Minimum-sample-size threshold (3.1) applies consistently to both the chart markers and the headline Calibration Score, so the badge itself isn't inflated by a small early sample.
- Version the calibration methodology (e.g., a `calc_version` field) so that if the binning logic changes later, historical claims remain reproducible and auditable.

---

## 4. Strategic Impact

### 4.1 Differentiation

Most prediction/tipster products advertise win rate alone, which is easy to cherry-pick and hard to independently verify. A calibration view — even shown to only a subset of users — lets BetriX make a stronger, harder-to-fake claim: that its stated confidence levels track reality. This is the kind of evidence that matters to more sophisticated users, potential B2B/API partners, and eventually regulators or reviewers assessing the platform's legitimacy.

### 4.2 Trust & Retention

- Casual users get a simple, reassuring signal (the Calibration Score badge) without being asked to learn statistics.
- Power users and skeptics get the receipts, which supports word-of-mouth credibility ("they publish their calibration, not just their wins").
- Match Details pages increase session depth and time-on-platform, turning a static record into a browsable archive.

### 4.3 Positioning Note

This feature documents statistical reliability, not betting performance guarantees. Any public copy describing the Calibration Score should avoid language that could be read as a promise of future results — this stays consistent with BetriX's existing "no bets accepted, no funds held" posture and general analytics framing.

---

> **Open questions for review**
> 1. Confirm default bucket width (5% vs 10%) given current prediction volume.
> 2. Confirm whether calibration should be shown per-market by default or only in aggregate at launch.
> 3. Confirm minimum sample-size threshold before a bucket is considered reportable.
