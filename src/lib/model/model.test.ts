import { describe, expect, it } from "vitest";
import { poissonPmf, scoreMatrix, deriveMarkets, deriveAsianHandicap, tau, MAX_GOALS } from "./poisson";
import { fitLeague, expectedRates, normaliseKey } from "./fit";
import { assessSufficiency, buildPrediction } from "./predict";
import type { ResultRow } from "@/lib/types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("poisson", () => {
  it("pmf integrates to ~1 over the truncated support", () => {
    for (const lambda of [0.3, 1.35, 2.7, 4]) {
      const total = sum(Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lambda)));
      expect(total).toBeGreaterThan(0.995);
      expect(total).toBeLessThanOrEqual(1.0000001);
    }
  });

  it("pmf matches known values", () => {
    // P(X=0 | lambda=1) = e^-1
    expect(poissonPmf(0, 1)).toBeCloseTo(Math.exp(-1), 10);
    // P(X=2 | lambda=2) = 2^2 e^-2 / 2! = 2 e^-2
    expect(poissonPmf(2, 2)).toBeCloseTo(2 * Math.exp(-2), 10);
  });

  it("tau only touches the four lowest scorelines", () => {
    const rho = -0.05;
    expect(tau(2, 1, 1.4, 1.1, rho)).toBe(1);
    expect(tau(0, 2, 1.4, 1.1, rho)).toBe(1);
    expect(tau(1, 1, 1.4, 1.1, rho)).not.toBe(1);
    expect(tau(0, 0, 1.4, 1.1, rho)).not.toBe(1);
  });

  it("score matrix is a normalised probability distribution", () => {
    for (const rho of [0, -0.05, -0.15, 0.05]) {
      const grid = scoreMatrix(1.6, 1.2, rho);
      const total = sum(grid.flat());
      expect(total).toBeCloseTo(1, 9);
      expect(grid.flat().every((p) => p >= 0)).toBe(true);
    }
  });

  it("dixon-coles correction lifts low-scoring draws relative to independence", () => {
    const plain = scoreMatrix(1.4, 1.1, 0);
    const corrected = scoreMatrix(1.4, 1.1, -0.08);
    expect(corrected[0][0]).toBeGreaterThan(plain[0][0]);
    expect(corrected[1][1]).toBeGreaterThan(plain[1][1]);
  });
});

describe("markets", () => {
  const grid = scoreMatrix(1.7, 1.1, -0.05);
  const m = deriveMarkets(grid, 1.7, 1.1);

  it("1X2 is a partition of the sample space", () => {
    expect(m.home + m.draw + m.away).toBeCloseTo(1, 9);
  });

  it("over and under are complementary at every line", () => {
    for (const line of Object.keys(m.over)) {
      expect(m.over[line] + m.under[line]).toBeCloseTo(1, 9);
    }
  });

  it("over probabilities decrease as the line rises", () => {
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5].map((l) => m.over[String(l)]);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toBeLessThan(lines[i - 1]);
    }
  });

  it("BTTS is complementary and double chance is consistent", () => {
    expect(m.bttsYes + m.bttsNo).toBeCloseTo(1, 9);
    expect(m.doubleChance.homeOrDraw).toBeCloseTo(m.home + m.draw, 9);
    expect(m.doubleChance.homeOrAway).toBeCloseTo(m.home + m.away, 9);
  });

  it("the stronger side is favoured", () => {
    expect(m.home).toBeGreaterThan(m.away);
  });

  it("correct scores are sorted and sane", () => {
    expect(m.correctScore.length).toBeGreaterThan(0);
    for (let i = 1; i < m.correctScore.length; i++) {
      expect(m.correctScore[i].probability).toBeLessThanOrEqual(
        m.correctScore[i - 1].probability,
      );
    }
    expect(sum(m.correctScore.map((s) => s.probability))).toBeLessThanOrEqual(1.0000001);
  });

  it("expected goals are carried through", () => {
    expect(m.expectedGoals.home).toBeCloseTo(1.7, 9);
    expect(m.expectedGoals.total).toBeCloseTo(2.8, 9);
  });
});

describe("asian handicap", () => {
  const grid = scoreMatrix(1.7, 1.1, -0.05);
  const lines = deriveAsianHandicap(grid);

  it("home+away+push sums to 1 at every line", () => {
    for (const l of lines) {
      expect(l.home + l.away + l.push).toBeCloseTo(1, 9);
    }
  });

  it("half lines never push", () => {
    for (const l of lines) {
      if (!Number.isInteger(l.line)) expect(l.push).toBe(0);
    }
  });

  it("home covering a more generous line is at least as likely as a stricter one", () => {
    const byLine = new Map(lines.map((l) => [l.line, l]));
    // Home +2 (line=+2) covers in strictly more scorelines than Home -1 (line=-1).
    expect(byLine.get(2)!.home).toBeGreaterThan(byLine.get(-1)!.home);
  });

  // Hand-computed against a small fixed grid so the split itself, not just
  // its invariants, is checked against known values.
  it("matches a hand-computed split on a known grid", () => {
    const fixed = [
      [0.1, 0.05, 0.05],
      [0.1, 0.2, 0.1],
      [0.05, 0.1, 0.25],
    ];
    const [zero, half, minusHalf] = deriveAsianHandicap(fixed, [0, 0.5, -0.5]);

    // line 0: home wins x>y, away wins x<y, push x=y.
    expect(zero.home).toBeCloseTo(0.25, 9); // (1,0)+(2,0)+(2,1)
    expect(zero.away).toBeCloseTo(0.2, 9); // (0,1)+(0,2)+(1,2)
    expect(zero.push).toBeCloseTo(0.55, 9); // (0,0)+(1,1)+(2,2)

    // line +0.5: home wins x>=y (push mass from line 0 moves to home), no push.
    expect(half.home).toBeCloseTo(0.8, 9);
    expect(half.away).toBeCloseTo(0.2, 9);
    expect(half.push).toBe(0);

    // line -0.5: away wins x<=y (push mass from line 0 moves to away), no push.
    expect(minusHalf.home).toBeCloseTo(0.25, 9);
    expect(minusHalf.away).toBeCloseTo(0.75, 9);
    expect(minusHalf.push).toBe(0);
  });
});

/** Deterministic PRNG so the recovery test never flakes. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda: number, rnd: () => number): number {
  // Knuth's method — fine for the small rates used here.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

describe("league fit", () => {
  it("recovers known team strengths from simulated results", () => {
    const rnd = mulberry32(42);
    // Ground truth: 10 teams on a spread of attack/defence strengths.
    const teams = Array.from({ length: 10 }, (_, i) => ({
      name: `Team ${String.fromCharCode(65 + i)}`,
      attack: 0.45 - i * 0.1,
      defence: 0.4 - i * 0.09,
    }));
    const trueHomeAdv = 0.28;
    const base = Math.log(1.35);

    const rows: ResultRow[] = [];
    // Four full round-robins gives a realistic season-and-a-bit sample.
    for (let rep = 0; rep < 4; rep++) {
      for (let i = 0; i < teams.length; i++) {
        for (let j = 0; j < teams.length; j++) {
          if (i === j) continue;
          const lam = Math.exp(base + teams[i].attack - teams[j].defence + trueHomeAdv);
          const mu = Math.exp(base + teams[j].attack - teams[i].defence);
          rows.push({
            homeId: teams[i].name,
            awayId: teams[j].name,
            homeName: teams[i].name,
            awayName: teams[j].name,
            homeGoals: samplePoisson(lam, rnd),
            awayGoals: samplePoisson(mu, rnd),
            // Spread across the last year so recency weighting is exercised.
            date: Date.now() - rnd() * 300 * 86_400_000,
            leagueId: "test",
          });
        }
      }
    }

    const fit = fitLeague(rows);
    expect(fit.matchesUsed).toBe(rows.length);
    expect(fit.ratings.size).toBe(10);

    // Home advantage should land close to the 0.28 used to generate the data.
    expect(fit.homeAdvantage).toBeGreaterThan(0.2);
    expect(fit.homeAdvantage).toBeLessThan(0.36);

    // The fitted goal rate should reproduce the simulated scoring level.
    expect(fit.baseRate).toBeGreaterThan(1.1);
    expect(fit.baseRate).toBeLessThan(1.7);

    // Recovered attack ratings should correlate strongly with the truth.
    const fitted = teams.map((t) => fit.ratings.get(normaliseKey(t.name))!.attack);
    const truth = teams.map((t) => t.attack);
    expect(pearson(fitted, truth)).toBeGreaterThan(0.9);

    const fittedDef = teams.map((t) => fit.ratings.get(normaliseKey(t.name))!.defence);
    expect(pearson(fittedDef, teams.map((t) => t.defence))).toBeGreaterThan(0.9);

    // And the ordering must hold end to end: best team beats worst at home.
    const { lambda, mu } = expectedRates(fit, "Team A", "Team J");
    expect(lambda).toBeGreaterThan(mu);
    const markets = deriveMarkets(scoreMatrix(lambda, mu, fit.rho), lambda, mu);
    expect(markets.home).toBeGreaterThan(0.6);
    expect(markets.home).toBeGreaterThan(markets.away);
  });

  it("keeps ratings centred so they stay interpretable", () => {
    const rows = simpleSeason();
    const fit = fitLeague(rows);
    const attacks = [...fit.ratings.values()].map((r) => r.attack);
    expect(Math.abs(sum(attacks) / attacks.length)).toBeLessThan(1e-6);
  });

  it("treats an unseen club as league average instead of failing", () => {
    const fit = fitLeague(simpleSeason());
    const { lambda, mu } = expectedRates(fit, "Nowhere United", "Also Unknown");
    expect(Number.isFinite(lambda)).toBe(true);
    expect(Number.isFinite(mu)).toBe(true);
    // Only the home advantage separates two average sides.
    expect(lambda).toBeGreaterThan(mu);
    expect(lambda / mu).toBeCloseTo(Math.exp(fit.homeAdvantage), 6);
  });

  it("returns a usable neutral fit when there are no results at all", () => {
    const fit = fitLeague([]);
    expect(fit.matchesUsed).toBe(0);
    expect(fit.ratings.size).toBe(0);
    const { lambda, mu } = expectedRates(fit, "A", "B");
    expect(lambda).toBeGreaterThan(0);
    expect(mu).toBeGreaterThan(0);
  });

  it("weights recent form above stale results", () => {
    const now = Date.now();
    const rows: ResultRow[] = [];
    // Ancient history: Old Guard thrash Risers every time.
    for (let i = 0; i < 12; i++) {
      rows.push(row("Old Guard", "Risers", 4, 0, now - (600 + i) * 86_400_000));
      rows.push(row("Risers", "Old Guard", 0, 3, now - (600 + i) * 86_400_000));
    }
    // Recent form: it is the other way round.
    for (let i = 0; i < 12; i++) {
      rows.push(row("Risers", "Old Guard", 4, 0, now - (5 + i) * 86_400_000));
      rows.push(row("Old Guard", "Risers", 0, 3, now - (5 + i) * 86_400_000));
    }
    const fit = fitLeague(rows, { halfLifeDays: 90 });
    const risers = fit.ratings.get(normaliseKey("Risers"))!;
    const old = fit.ratings.get(normaliseKey("Old Guard"))!;
    expect(risers.attack).toBeGreaterThan(old.attack);
  });
});

function row(h: string, a: string, hg: number, ag: number, date: number): ResultRow {
  return {
    homeId: h, awayId: a, homeName: h, awayName: a,
    homeGoals: hg, awayGoals: ag, date, leagueId: "test",
  };
}

function simpleSeason(): ResultRow[] {
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  const rows: ResultRow[] = [];
  let d = Date.now() - 200 * 86_400_000;
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      d += 86_400_000;
      rows.push(row(names[i], names[j], (i + j) % 4, (i * j) % 3, d));
    }
  }
  return rows;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = sum(a) / n;
  const mb = sum(b) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

describe("fit diagnostics", () => {
  it("reports the recovered parameters for inspection", () => {
    // Not an assertion so much as a guard: if the optimiser regresses, the
    // surrounding expectations in this file are the ones that will catch it.
    const fit = fitLeague(simpleSeason());
    expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    expect(fit.rho).toBeGreaterThanOrEqual(-0.2);
    expect(fit.rho).toBeLessThanOrEqual(0.11);
  });
});

describe("optimiser convergence", () => {
  /**
   * The defining property of a converged Poisson MLE: under the same weights
   * used to fit, total predicted goals equal total observed goals. This is the
   * check that caught the home-advantage bias when the intercept was pinned
   * instead of fitted.
   */
  it("satisfies the weighted score equations", () => {
    const rows = simpleSeason();
    const fit = fitLeague(rows);
    const decay = Math.log(2) / (fit.halfLifeDays * 86_400_000);
    const now = Date.now();

    let predHome = 0, predAway = 0, obsHome = 0, obsAway = 0;
    for (const r of rows) {
      const { lambda, mu } = expectedRates(fit, r.homeName, r.awayName);
      const w = Math.exp(-decay * Math.max(0, now - r.date));
      predHome += w * lambda;
      predAway += w * mu;
      obsHome += w * r.homeGoals;
      obsAway += w * r.awayGoals;
    }

    // The intercept's score equation fixes the total.
    expect(predHome + predAway).toBeCloseTo(obsHome + obsAway, 4);
    // The home-advantage score equation fixes the home side of it.
    expect(predHome).toBeCloseTo(obsHome, 4);
  });

  it("recovers home advantage from an asymmetric scoring pattern", () => {
    // Home sides score exactly twice as often: the true log advantage is ln 2.
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const rows: ResultRow[] = [];
    let d = Date.now() - 120 * 86_400_000;
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < names.length; i++) {
        for (let j = 0; j < names.length; j++) {
          if (i === j) continue;
          d += 3_600_000;
          rows.push(row(names[i], names[j], 2, 1, d));
        }
      }
    }
    const fit = fitLeague(rows);
    expect(fit.homeAdvantage).toBeCloseTo(Math.log(2), 2);
  });

  it("does not let regularisation distort the overall scoring level", () => {
    const rows = simpleSeason();
    const light = fitLeague(rows, { regularisation: 0.001 });
    const heavy = fitLeague(rows, { regularisation: 0.5 });
    // Heavy shrinkage should flatten team ratings...
    const spread = (f: typeof light) => {
      const a = [...f.ratings.values()].map((r) => r.attack);
      return Math.max(...a) - Math.min(...a);
    };
    expect(spread(heavy)).toBeLessThan(spread(light));
    // ...but the home advantage is not a team rating and must survive it.
    expect(Math.abs(heavy.homeAdvantage - light.homeAdvantage)).toBeLessThan(0.1);
  });
});

describe("data sufficiency gate", () => {
  it("refuses to publish a pick from almost no history", () => {
    const s = assessSufficiency(4, 2, 2);
    expect(s.level).toBe("insufficient");
    expect(s.publishable).toBe(false);
    expect(s.reason).toContain("4");
  });

  it("refuses when a club barely appears in the sample", () => {
    const s = assessSufficiency(200, 1, 30);
    expect(s.level).toBe("insufficient");
    expect(s.publishable).toBe(false);
  });

  it("publishes with a caveat on a thin but usable sample", () => {
    const s = assessSufficiency(40, 8, 8);
    expect(s.level).toBe("limited");
    expect(s.publishable).toBe(true);
  });

  it("publishes cleanly on a full sample", () => {
    const s = assessSufficiency(300, 20, 18);
    expect(s.level).toBe("good");
    expect(s.publishable).toBe(true);
  });

  it("withholds the headline pick on a fixture with no history", () => {
    const match = {
      id: "test:1",
      kickoff: new Date().toISOString(),
      status: "scheduled" as const,
      league: { id: "0", name: "Unknown League" },
      home: { id: "h", name: "Home FC", shortName: "Home" },
      away: { id: "a", name: "Away FC", shortName: "Away" },
      score: { home: null, away: null },
      source: "thesportsdb" as const,
    };
    const p = buildPrediction(match, []);
    expect(p.sufficiency.publishable).toBe(false);
    expect(p.topPick).toBeNull();
    // The underlying numbers are still computed and still coherent.
    expect(p.markets.home + p.markets.draw + p.markets.away).toBeCloseTo(1, 9);
  });
});

describe("reported goal rates", () => {
  it("reports the observed league rate, not the average-matchup baseline", () => {
    const rows = simpleSeason();
    const fit = fitLeague(rows);

    // The observed rate must match the sample it was fitted on.
    const decay = Math.log(2) / (fit.halfLifeDays * 86_400_000);
    const now = Date.now();
    let wSum = 0;
    let goals = 0;
    for (const r of rows) {
      const w = Math.exp(-decay * Math.max(0, now - r.date));
      wSum += w * 2;
      goals += w * (r.homeGoals + r.awayGoals);
    }
    expect(fit.observedGoalRate).toBeCloseTo(goals / wSum, 9);

    // And it must not be confused with baseRate: rates are exponential in the
    // ratings, so the average-matchup baseline sits below the observed mean
    // whenever teams differ from one another at all.
    expect(fit.baseRate).toBeLessThan(fit.observedGoalRate);
  });

  it("collapses the two only when every team is identical", () => {
    // No spread in the ratings means no Jensen gap.
    const names = ["A", "B", "C", "D"];
    const rows: ResultRow[] = [];
    let d = Date.now() - 30 * 86_400_000;
    for (let rep = 0; rep < 6; rep++) {
      for (let i = 0; i < names.length; i++) {
        for (let j = 0; j < names.length; j++) {
          if (i === j) continue;
          d += 3_600_000;
          rows.push(row(names[i], names[j], 1, 1, d));
        }
      }
    }
    const fit = fitLeague(rows);
    expect(fit.baseRate).toBeCloseTo(fit.observedGoalRate, 2);
  });
});
