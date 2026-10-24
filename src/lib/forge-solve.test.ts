import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { DEFAULT_SETTINGS, allStatCandidates, candidatesFor, forgeBest, slipTotals, type ForgeSettings, type PoolEntry } from "./forge";
import { balancedByLeague, forgeSolve, priceBand, solveOptions } from "./forge-solve";

/* The same synthetic league as forge.test.ts: 12 clubs of graded strength. */
const TEAMS = ["Aces", "Bees", "Cubs", "Dons", "Eels", "Fox", "Gulls", "Hawks", "Ibis", "Jays", "Kites", "Lions"];
function league(): ResultRow[] {
  const rows: ResultRow[] = [];
  let day = Date.parse("2026-01-01");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < TEAMS.length; i++) {
      for (let j = 0; j < TEAMS.length; j++) {
        if (i === j) continue;
        const attack = (k: number) => 2.2 - k * 0.12;
        const hg = Math.floor(rnd() * attack(i) + rnd() * 1.2);
        const ag = Math.floor(rnd() * attack(j) * 0.8 + rnd() * 0.9);
        rows.push({ homeId: TEAMS[i], awayId: TEAMS[j], homeName: TEAMS[i], awayName: TEAMS[j], homeGoals: hg, awayGoals: ag, date: (day += 3600_000), leagueId: "x" });
      }
    }
  }
  return rows;
}
const RESULTS = league();

function fixture(i: number, j: number, hoursAhead: number, code = "premier-league"): Prediction {
  const match: Match = {
    id: `t:${i}-${j}-${hoursAhead}`,
    kickoff: new Date(Date.now() + hoursAhead * 3600_000).toISOString(),
    status: "scheduled",
    league: { id: code, name: code, code },
    home: { id: TEAMS[i], name: TEAMS[i], shortName: TEAMS[i] },
    away: { id: TEAMS[j], name: TEAMS[j], shortName: TEAMS[j] },
    score: { home: null, away: null },
    source: "football-data",
  };
  return buildPrediction(match, RESULTS);
}

/** Corner chances the way statChances keys them, from a Poisson count around `mean` (`home` share for the team lines). */
function cornerStats(mean: number, homeShare = 0.55): Record<string, number> {
  const over = (m: number, line: number) => {
    let cdf = 0;
    let term = Math.exp(-m);
    for (let k = 0; k <= Math.floor(line); k++) {
      cdf += term;
      term *= m / (k + 1);
    }
    return 1 - cdf;
  };
  const out: Record<string, number> = {};
  for (const l of [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]) {
    out[`corners:over:${l}`] = over(mean, l);
    out[`corners:under:${l}`] = 1 - over(mean, l);
  }
  for (const l of [2.5, 3.5, 4.5, 5.5, 6.5]) {
    out[`corners:home:over:${l}`] = over(mean * homeShare, l);
    out[`corners:home:under:${l}`] = 1 - over(mean * homeShare, l);
    out[`corners:away:over:${l}`] = over(mean * (1 - homeShare), l);
    out[`corners:away:under:${l}`] = 1 - over(mean * (1 - homeShare), l);
  }
  return out;
}

const PAIRS = [
  [0, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6], [11, 0], [10, 1], [6, 2], [7, 3],
  [8, 4], [9, 5], [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 0], [7, 1],
];

function pool(markets: ForgeSettings["markets"], opts: { withCorners?: number; picksPerGame?: 1 | 2 | 3 } = {}): PoolEntry[] {
  return PAIRS.map(([i, j], k) => {
    const prediction = fixture(i, j, 6 + k);
    // The first `withCorners` games are in a competition with corners data.
    const stats = k < (opts.withCorners ?? 0) ? cornerStats(8.5 + (k % 4)) : undefined;
    return {
      prediction,
      candidates: candidatesFor(prediction, { markets, picksPerGame: opts.picksPerGame ?? 2, allowHandicap: true, statLines: "all" }, stats),
    };
  });
}

const fresh = { locked: [], removed: [], avoid: [], seed: 1 };
const inBand = (odds: number, target: number) => {
  const [lo, hi] = priceBand(target);
  return odds >= lo - 1e-9 && odds <= hi + 1e-9;
};

describe("forgeSolve", () => {
  const base: ForgeSettings = { ...DEFAULT_SETTINGS, markets: ["result", "double_chance", "goals", "btts"] };

  it("returns exactly the games asked for, on the price asked for", () => {
    for (const [games, target] of [[10, 5], [4, 5], [6, 20], [3, 2.5], [12, 50], [8, 3]] as const) {
      const r = forgeSolve(pool(base.markets), { ...base, games, targetOdds: target }, fresh);
      expect(r.legs).toHaveLength(games);
      const odds = slipTotals(r.legs, 1).odds;
      expect(inBand(odds, target)).toBe(true);
      expect(r.notes).toEqual([]);
    }
  });

  it("asked for 10 at a price of 5, the old builder gave far fewer", () => {
    const settings = { ...base, games: 10, targetOdds: 5 };
    expect(forgeBest(pool(base.markets), settings, fresh).legs.length).toBeLessThan(10);
    expect(forgeSolve(pool(base.markets), settings, fresh).legs).toHaveLength(10);
  });

  it("puts corners on every game when corners are all that is chosen", () => {
    const r = forgeSolve(pool(["corners"], { withCorners: 12 }), { ...base, markets: ["corners"], games: 8, targetOdds: 4 }, fresh);
    expect(r.legs).toHaveLength(8);
    expect(r.legs.every((l) => l.market.startsWith("corners:"))).toBe(true);
    expect(inBand(slipTotals(r.legs, 1).odds, 4)).toBe(true);
  });

  it("gives corners their share when they are chosen with other markets", () => {
    const markets: ForgeSettings["markets"] = ["result", "double_chance", "goals", "corners"];
    const r = forgeSolve(pool(markets, { withCorners: 12 }), { ...base, markets, games: 10, targetOdds: 8 }, fresh);
    expect(r.legs).toHaveLength(10);
    expect(r.legs.filter((l) => l.market.startsWith("corners:")).length).toBeGreaterThanOrEqual(3);
  });

  it("says how many games have the data when there aren't enough", () => {
    const r = forgeSolve(pool(["corners"], { withCorners: 6 }), { ...base, markets: ["corners"], games: 10, targetOdds: 3 }, fresh);
    expect(r.legs).toHaveLength(6);
    expect(r.notes?.[0]).toMatch(/Only 6 games .* corners data/);
  });

  it("says so when the price can't be reached, and gets as close as it can", () => {
    const r = forgeSolve(pool(base.markets), { ...base, games: 2, targetOdds: 400 }, fresh);
    expect(r.legs).toHaveLength(2);
    expect(r.notes?.some((n) => /as close to 400/.test(n))).toBe(true);
  });

  it("keeps locked legs and never offers removed games", () => {
    const settings = { ...base, games: 6, targetOdds: 8 };
    const first = forgeSolve(pool(base.markets), settings, fresh);
    const keep = first.legs[0];
    const gone = first.legs[1].matchId;
    const again = forgeSolve(pool(base.markets), settings, { locked: [{ matchId: keep.matchId, market: keep.market }], removed: [gone], avoid: [], seed: 2 });
    expect(again.legs).toHaveLength(6);
    expect(again.legs.find((l) => l.matchId === keep.matchId)?.market).toBe(keep.market);
    expect([...again.legs, ...again.bench].some((l) => l.matchId === gone)).toBe(false);
    expect(inBand(slipTotals(again.legs, 1).odds, 8)).toBe(true);
  });

  it("aims at the board's price where a leg has one", () => {
    const p = pool(base.markets).map((e) => ({ ...e, candidates: e.candidates.map((c) => ({ ...c, price: Math.round(c.fairOdds * 0.93 * 100) / 100 })) }));
    const r = forgeSolve(p, { ...base, games: 5, targetOdds: 6 }, fresh);
    expect(r.legs.every((l) => l.price !== null)).toBe(true);
    expect(inBand(slipTotals(r.legs, 1).odds, 6)).toBe(true);
  });
});

describe("solveOptions", () => {
  it("lands inside the band with the strongest legs available", () => {
    const opt = (odds: number, q: number) => ({ c: { picks: [], market: "x", label: "x", probability: q, fairOdds: odds }, lo: Math.log(odds), q });
    const games = [0, 1, 2].map(() => ({ entry: null as unknown as PoolEntry, opts: [opt(1.2, 0.83), opt(1.5, 0.66), opt(2, 0.5)] }));
    const s = solveOptions(games, 1.2 * 1.5 * 1.5)!;
    expect(s.inBand).toBe(true);
    // 1.2 x 1.2 x 2.0 would score higher (2.16) but its 2.88 is outside 2.70's band: 1.2 x 1.5 x 1.5 it is.
    const q = s.choice.reduce((t, k, i) => t + games[i].opts[k].q, 0);
    expect(q).toBeCloseTo(2.15, 2);
  });
});

describe("allStatCandidates", () => {
  it("offers lines near the game's own count, not far-off near-certainties", () => {
    const stats = cornerStats(9);
    const markets = allStatCandidates(stats, new Set(["corners"]), "Home", "Away").map((c) => c.market);
    // The middle total line is 8.5 or 9.5: Under 12.5 is too far above it to be a read of this game.
    expect(markets).not.toContain("corners:under:12.5");
    expect(markets).toContain("corners:over:7.5");
    expect(markets.some((m) => m.startsWith("corners:home:"))).toBe(true);
    // Chances outside 55-92% are left out.
    expect(allStatCandidates(stats, new Set(["corners"]), "H", "A").every((c) => c.probability >= 0.55 && c.probability <= 0.92)).toBe(true);
  });

  it("labels team lines with the team", () => {
    const c = allStatCandidates(cornerStats(10), new Set(["corners"]), "Arsenal", "Everton").find((x) => x.market.startsWith("corners:home:over"));
    expect(c?.label).toMatch(/^Arsenal over \d+(\.5)? corners$/);
  });
});

describe("balancedByLeague", () => {
  it("takes leagues in turn instead of the feed's order", () => {
    const m = (code: string, h: number) => ({ kickoff: new Date(Date.UTC(2026, 9, 25, h)).toISOString(), league: { code } });
    const feed = [...Array.from({ length: 10 }, (_, h) => m("a", h)), m("b", 5), m("c", 6)];
    const out = balancedByLeague(feed, 4);
    expect(out.map((x) => x.league.code).sort()).toEqual(["a", "a", "b", "c"]);
  });
});
