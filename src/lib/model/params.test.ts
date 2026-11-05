import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction, guardHeadline, heldBack, levelFactor, type Pick } from "./predict";
import { fitLeague } from "./fit";
import { LEGACY_PARAMS, NEXT_MODEL_FROM, NEXT_PARAMS, paramsFor } from "./params";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(l: number, r: () => number) {
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

/** A 12-club league, ~2.9 goals a game, played over the 300 days before `end`. */
function league(end: number, rate = 1.45, seed = 5): ResultRow[] {
  const r = rng(seed);
  const rows: ResultRow[] = [];
  const names = Array.from({ length: 12 }, (_, i) => `Club ${i}`);
  for (let rep = 0; rep < 4; rep++)
    for (const h of names)
      for (const a of names) {
        if (h === a) continue;
        rows.push({
          homeId: h, awayId: a, homeName: h, awayName: a,
          homeGoals: poisson(rate * 1.15, r), awayGoals: poisson(rate * 0.87, r),
          date: end - r() * 300 * 86_400_000, leagueId: "t",
        });
      }
  return rows;
}

const fixture = (code: string, kickoff: number): Match => ({
  id: "m1", kickoff: new Date(kickoff).toISOString(), status: "scheduled",
  league: { id: "x", name: "X", code },
  home: { id: "Club 1", name: "Club 1", shortName: "C1" },
  away: { id: "Club 2", name: "Club 2", shortName: "C2" },
  score: { home: null, away: null }, source: "thesportsdb",
});

describe("parameter gate (today's picks do not move)", () => {
  it("gives every game before the Lagos midnight cutover the legacy set, to the millisecond", () => {
    expect(NEXT_MODEL_FROM).toBe(Date.parse("2026-11-04T23:00:00Z"));
    expect(paramsFor(NEXT_MODEL_FROM - 1)).toBe(LEGACY_PARAMS);
    expect(paramsFor("2026-11-04T22:59:59Z")).toBe(LEGACY_PARAMS);
    expect(paramsFor("2026-11-04T19:00:00Z")).toBe(LEGACY_PARAMS);
    expect(paramsFor("2026-10-01T12:00:00Z")).toBe(LEGACY_PARAMS);
  });

  it("gives games from the cutover on the new set", () => {
    expect(paramsFor(NEXT_MODEL_FROM)).toBe(NEXT_PARAMS);
    expect(paramsFor("2026-11-05T14:00:00Z")).toBe(NEXT_PARAMS);
  });

  it("falls back to the legacy set on a kickoff it cannot read", () => {
    expect(paramsFor("not a date")).toBe(LEGACY_PARAMS);
  });

  it("drops the promoted-club prior on pooled competitions only, and only after the cutover", () => {
    expect(paramsFor("2026-11-06T12:00:00Z", true).fit.newcomerPrior).toBe(0);
    expect(paramsFor("2026-11-06T12:00:00Z", false).fit.newcomerPrior).toBeUndefined();
    expect(paramsFor("2026-11-04T12:00:00Z", true).fit).toEqual({});
  });

  it("legacy options are empty, so a game before the cutover predicts exactly as before", () => {
    expect(LEGACY_PARAMS.options).toEqual({});
    expect(LEGACY_PARAMS.fit).toEqual({});
    const end = Date.parse("2026-11-04T12:00:00Z");
    const rows = league(end);
    const m = fixture("premier-league", end + 6 * 3_600_000);
    // One shared fit: a fresh fit weights by the clock and differs in the 15th decimal.
    const prefit = fitLeague(rows, LEGACY_PARAMS.fit);
    const before = buildPrediction(m, rows, [], { prefit });
    const gated = buildPrediction(m, rows, [], { ...LEGACY_PARAMS.options, prefit });
    expect(gated.picks).toEqual(before.picks);
    expect(gated.topPick).toEqual(before.topPick);
    expect(gated.markets.home).toBe(before.markets.home);
  });
});

describe("headline guards", () => {
  const pick = (probability: number): Pick => ({ market: "dc:home-draw", label: "x", group: "Double Chance", probability, fairOdds: 1 / probability, confidence: 50 });

  it("holds back a pick under the floor and keeps one at or over it", () => {
    expect(heldBack(pick(0.64), "premier-league", { headlineFloor: 0.65 })).toBe(true);
    expect(heldBack(pick(0.65), "premier-league", { headlineFloor: 0.65 })).toBe(false);
    expect(heldBack(pick(0.3), "premier-league", {})).toBe(false);
  });

  it("holds back every pick in a held competition", () => {
    expect(heldBack(pick(0.8), "caf-champions-league", NEXT_PARAMS.options)).toBe(true);
    expect(heldBack(pick(0.8), "premier-league", NEXT_PARAMS.options)).toBe(false);
  });

  it("leaves the picks list and removes only the headline", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const p = buildPrediction(fixture("premier-league", end + 3_600_000), league(end), []);
    expect(p.topPick).not.toBeNull();
    const held = guardHeadline(p, { headlineFloor: 0.99 });
    expect(held.topPick).toBeNull();
    expect(held.picks).toEqual(p.picks);
    expect(guardHeadline(p, {})).toBe(p);
  });

  it("applies the floor inside buildPrediction so labs and pages agree", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const p = buildPrediction(fixture("premier-league", end + 3_600_000), league(end), [], { headlineFloor: 0.99 });
    expect(p.topPick).toBeNull();
  });
});

describe("overs tilt", () => {
  it("lifts an over to the headline when the tilt is large, and leaves the ranking alone at zero", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const rows = league(end, 1.6);
    const m = fixture("premier-league", end + 3_600_000);
    const flat = buildPrediction(m, rows, [], { sweetSpots: false });
    const same = buildPrediction(m, rows, [], { sweetSpots: false, overTilt: 0 });
    expect(same.picks.map((x) => x.market)).toEqual(flat.picks.map((x) => x.market));
    const tilted = buildPrediction(m, rows, [], { sweetSpots: false, overTilt: 5 });
    expect(tilted.topPick?.market.startsWith("ou:over:")).toBe(true);
  });
});

describe("neutral venues", () => {
  it("no longer inflates tournament totals toward a mean that includes home advantage", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const rows = league(end);
    const m = fixture("afcon", end + 3_600_000);
    const old = buildPrediction(m, rows, []);
    const fixed = buildPrediction(m, rows, [], { neutralTotals: true });
    expect(old.model.neutralVenue).toBe(true);
    expect(fixed.markets.expectedGoals.total).toBeLessThan(old.markets.expectedGoals.total);
    // About 2.8% for a home advantage of 0.25; bounded either side.
    const cut = 1 - fixed.markets.expectedGoals.total / old.markets.expectedGoals.total;
    expect(cut).toBeGreaterThan(0.005);
    expect(cut).toBeLessThan(0.05);
  });

  it("changes nothing at a home-and-away venue", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const rows = league(end);
    const m = fixture("premier-league", end + 3_600_000);
    expect(buildPrediction(m, rows, [], { neutralTotals: true }).markets.expectedGoals.total).toBeCloseTo(
      buildPrediction(m, rows, []).markets.expectedGoals.total, 9,
    );
  });
});

describe("levelFactor", () => {
  it("is 1 when recent and long-run scoring agree, and stays inside its clamp", () => {
    const end = Date.parse("2026-11-04T12:00:00Z");
    const rows = league(end);
    const fit = fitLeague(rows);
    expect(Math.abs(levelFactor(rows, fit, { halfLifeDays: 90, weight: 1 }) - 1)).toBeLessThan(0.1);
    const hot = rows.map((r) => (r.date > end - 40 * 86_400_000 ? { ...r, homeGoals: r.homeGoals + 3, awayGoals: r.awayGoals + 3 } : r));
    const f = levelFactor(hot, fitLeague(hot), { halfLifeDays: 30, weight: 1, clamp: 0.1 });
    expect(f).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(f).toBeGreaterThan(1);
  });
});
