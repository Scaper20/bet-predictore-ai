# NaijaOdds

A football prediction and betting-analysis platform built for the Nigerian market.
Real fixtures, real live scores, and a statistical model fitted on actual completed
matches — no placeholder games, no invented picks.

---

## What this is

Most football tipster sites hand you a selection and ask you to trust it. This one
computes probabilities from a published method and shows you the sample size behind
every number, including when that sample is too thin to say anything at all.

- **Live scores** across every competition the configured feeds carry.
- **Fixtures** up to 14 days out, kickoff times in West Africa Time.
- **Predictions** for 1X2, over/under, both-teams-to-score, double chance and
  correct score — all read off a single scoreline distribution, so they cannot
  contradict one another.
- **Value detection** that removes the bookmaker's margin before comparing prices,
  with capped Kelly staking guidance.
- **Bet slip builder** showing an accumulator's true combined probability, and
  warning when legs are correlated or the slip has grown long enough that the
  margin dominates.
- **Model transparency** on every match: fitted ratings, sample size, data quality
  and the parameters used.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **No API key is required** — the app falls back to
TheSportsDB's public key, which returns real live scores and real fixtures. See
[Data providers](#data-providers) for lifting the coverage limits.

```bash
npm run build      # production build
npm test           # unit tests for the model, odds and staking maths
npm run lint
npm run smoke      # hit the live feeds and print what comes back
```

## Data providers

Every fixture, scoreline and result comes from a live provider. Nothing is
generated or seeded. Adapters are merged rather than ranked: the same fixture from
two sources is de-duplicated on the club pair and kickoff day, the richer record
wins, and gaps are filled from the other.

| Provider | Env var | Coverage | Free tier |
|---|---|---|---|
| [football-data.org](https://www.football-data.org/client/register) | `FOOTBALL_DATA_API_KEY` | Top European competitions, untruncated result sets. **Recommended.** | 10 req/min |
| [API-Football](https://www.api-football.com/) | `API_FOOTBALL_KEY` | Widest coverage — the only one carrying NPFL and CAF properly | 100 req/day |
| [TheSportsDB](https://www.thesportsdb.com/pricing) | `THESPORTSDB_API_KEY` | Used automatically with the public key when nothing else is set | Public key caps list endpoints at a few rows |

Copy `.env.example` to `.env.local` and fill in whichever you have. With none set,
the app runs on the shared public key and says so in the interface — live scores
stay complete, but fixture lists are capped upstream.

An optional `ANTHROPIC_API_KEY` upgrades the written match analysis from the
deterministic generator to Claude. Claude is given the computed numbers and asked
to explain them; it is never asked to predict anything, and the deterministic
version is used whenever the call fails.

## How the model works

For a fixture between home side *i* and away side *j*:

```
λ = exp(intercept + attack_i − defence_j + homeAdvantage)     home goals
μ = exp(intercept + attack_j − defence_i)                     away goals
```

Ratings are fitted by **weighted maximum likelihood** using a diagonal Newton step.
The log-likelihood of a Poisson model with a log link is concave, and the L2 penalty
makes it strictly concave, so the optimum is unique.

- **Dixon-Coles correction.** Pure Poisson understates 0-0, 1-0, 0-1 and 1-1,
  because teams play differently when a game is tight. The dependency parameter ρ
  is fitted alongside everything else.
- **Recency weighting.** Match weight halves roughly every six months, so current
  form outranks last season.
- **Shrinkage.** An L2 penalty pulls thinly-observed clubs toward league average,
  which stops a promoted side with three games played from getting an extreme
  rating off one fluke result.
- **Identifiability.** The intercept is a *fitted* parameter with both rating
  vectors centred. Pinning it instead forces the overall scoring level into the
  penalised defence ratings, and the home advantage collapses toward zero to
  compensate — there is a regression test for exactly this.
- **Early season.** When the current campaign has too few completed matches, the
  loader walks back through previous seasons until the sample is usable, trying
  both season-label conventions (`2026-2027` and `2026`).

### The honesty gate

A prediction is only published as a *pick* when the history behind it supports one.
Below 15 completed matches in the competition, or fewer than 3 appearances for
either club, the model output is still shown — with an explicit warning — and **no
selection is offered**. Fixtures in that state are listed separately on the
predictions page rather than quietly mixed in.

### What it cannot see

The model knows results. It does not know about suspensions, injuries, midweek
fixture congestion or a waterlogged pitch. And a probability is not a forecast: a
65% home win will be wrong about one time in three, which is the model working
correctly rather than failing.

## Architecture

```
src/
  app/
    (app)/          live, fixtures, predictions, match/[id], trends, slip, content pages
    api/            live, fixtures, match/[id], trends, health
  components/
    landing/        hero, marquee, feature and pricing sections
    match/          cards, market panels, value calculator, slip
    ui/             design-system primitives
  lib/
    providers/      three adapters, resolver, TTL cache with request coalescing
    model/          poisson.ts, fit.ts, predict.ts, odds.ts
    ai/             analyst with deterministic fallback
    service.ts      the seam the pages and API routes share
```

Provider responses are cached in-process with TTLs tuned to each feed's rate limit,
and concurrent requests for the same key are coalesced so a cold cache under load
produces one upstream call, not many.

## Tests

```bash
npm test
```

Covers the scoreline distribution and its normalisation, the Dixon-Coles
correction, market coherence (1X2 partitions the sample space; over and under are
complementary at every line), recovery of known team strengths from simulated
seasons, the score equations at convergence, margin removal, Kelly capping and
accumulator maths.

## Responsible gambling

Sports betting in Nigeria is regulated and restricted to adults 18 and over. This
project is an analytics tool: it does not take bets or hold funds. Predictions are
statistical estimates, not certainties.

## Licence

Provided as-is. Match data belongs to the respective providers and is subject to
their terms.
