import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { gradeMarket } from "@/lib/slip-tracker";
import {
  DEFAULT_SETTINGS,
  bestSwap,
  candidatesFor,
  forge,
  forgeBest,
  friendlyLabel,
  nextBest,
  gridFor,
  jointProbability,
  oddsOf,
  oneIn,
  parseForgeRequest,
  slipTotals,
  type ForgeSettings,
  type PoolEntry,
} from "./forge";

/* A synthetic league: 12 clubs of graded strength, two full rounds of deterministic scores. */
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

function fixture(i: number, j: number, hoursAhead = 24): Prediction {
  const match: Match = {
    id: `t:${i}-${j}`,
    kickoff: new Date(Date.now() + hoursAhead * 3600_000).toISOString(),
    status: "scheduled",
    league: { id: "x", name: "Test League", code: "premier-league" },
    home: { id: TEAMS[i], name: TEAMS[i], shortName: TEAMS[i] },
    away: { id: TEAMS[j], name: TEAMS[j], shortName: TEAMS[j] },
    score: { home: null, away: null },
    source: "football-data",
  };
  return buildPrediction(match, RESULTS);
}

const OPTS = { markets: DEFAULT_SETTINGS.markets, picksPerGame: 2 as const, allowHandicap: false };
const pool = (): PoolEntry[] =>
  [
    [0, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6], [11, 0], [10, 1], [6, 2], [7, 3],
  ].map(([i, j], k) => {
    const prediction = fixture(i, j, 6 + k);
    return { prediction, candidates: candidatesFor(prediction, OPTS) };
  });

describe("jointProbability", () => {
  it("matches the model's own marginals for a single market", () => {
    const p = fixture(0, 11);
    const grid = gridFor(p);
    expect(jointProbability(grid, ["1x2:home"])).toBeCloseTo(p.markets.home, 6);
    expect(jointProbability(grid, ["btts:yes"])).toBeCloseTo(p.markets.bttsYes, 6);
  });

  it("is never more likely than either part", () => {
    const p = fixture(0, 11);
    const grid = gridFor(p);
    const joint = jointProbability(grid, ["1x2:home", "ou:over:1.5"]);
    expect(joint).toBeLessThanOrEqual(p.markets.home);
    expect(joint).toBeLessThanOrEqual(p.markets.over["1.5"]);
    expect(joint).toBeGreaterThan(0);
  });
});

describe("candidatesFor", () => {
  it("offers singles and cross-family combos with readable labels", () => {
    const cands = candidatesFor(fixture(0, 11), OPTS);
    expect(cands.some((c) => c.picks.length === 1)).toBe(true);
    const combo = cands.find((c) => c.picks.length === 2);
    expect(combo?.market.startsWith("combo:")).toBe(true);
    expect(combo?.label).toContain(" & ");
    // never two picks from the same family
    for (const c of cands.filter((x) => x.picks.length === 2)) {
      const fam = c.picks.map((p) => (p.market.startsWith("ou:") ? "g" : p.market.startsWith("btts") ? "b" : "r"));
      expect(new Set(fam).size).toBe(2);
    }
  });

  it("keeps to the chosen markets and leaves combos out at one pick per game", () => {
    const cands = candidatesFor(fixture(0, 11), { markets: ["goals"], picksPerGame: 1, allowHandicap: false });
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.market.startsWith("ou:"))).toBe(true);
  });
});

describe("forge", () => {
  const settings: ForgeSettings = { ...DEFAULT_SETTINGS, targetOdds: 5, games: 4 };

  it("builds the number of games asked for, near the target odds", () => {
    const { legs } = forge(pool(), settings, { locked: [], removed: [], avoid: [], seed: 1 });
    expect(legs).toHaveLength(4);
    const total = slipTotals(legs, 1000).odds;
    expect(total).toBeGreaterThan(3);
    expect(total).toBeLessThan(8);
    expect(new Set(legs.map((l) => l.matchId)).size).toBe(4);
  });

  it("aims at SportyBet's prices where the board lists them", () => {
    // A board whose prices sit 12% under fair: built on fair odds the slip
    // would land near 5 / 1.12^4 ≈ 3.2 on SportyBet; built on prices, near 5.
    const priced = pool().map((e) => ({ ...e, candidates: e.candidates.map((c) => ({ ...c, price: c.fairOdds / 1.12 })) }));
    const { legs } = forge(priced, settings, { locked: [], removed: [], avoid: [], seed: 1 });
    const atPrices = legs.reduce((o, l) => o * (l.price ?? 0), 1);
    expect(atPrices).toBeGreaterThan(3.8);
    expect(atPrices).toBeLessThan(6.5);
    expect(oddsOf({ price: null, fairOdds: 1.07 })).toBeCloseTo(1);
    expect(oddsOf({ price: 1.5, fairOdds: 9 })).toBe(1.5);
  });

  it("keeps locked legs and never offers removed games", () => {
    const first = forge(pool(), settings, { locked: [], removed: [], avoid: [], seed: 1 });
    const keep = first.legs[0];
    const gone = first.legs[1].matchId;
    const again = forge(pool(), settings, {
      locked: [{ matchId: keep.matchId, market: keep.market }],
      removed: [gone],
      avoid: first.legs.map((l) => l.matchId),
      seed: 2,
    });
    expect(again.legs.find((l) => l.matchId === keep.matchId)?.market).toBe(keep.market);
    expect(again.legs.some((l) => l.matchId === gone)).toBe(false);
    expect(again.bench.some((l) => l.matchId === gone)).toBe(false);
  });

  it("drops a kept leg whose game is no longer on the card", () => {
    const r = forge(pool(), settings, { locked: [{ matchId: "t:gone", market: "1x2:home" }], removed: [], avoid: [], seed: 1 });
    expect(r.dropped).toEqual(["t:gone"]);
  });

  it("keeps safe slips to short, likely legs", () => {
    const { legs } = forge(pool(), { ...settings, risk: "safe", targetOdds: 2.5, games: 3 }, { locked: [], removed: [], avoid: [], seed: 1 });
    expect(legs.every((l) => l.probability >= 0.55)).toBe(true);
  });

  it("offers a swap close to the leg's odds", () => {
    const r = forge(pool(), settings, { locked: [], removed: [], avoid: [], seed: 1 });
    const swap = bestSwap(r.legs[0], r.bench, new Set(r.legs.map((l) => l.matchId)));
    expect(swap).not.toBeNull();
    expect(r.legs.some((l) => l.matchId === swap!.matchId)).toBe(false);
  });
});

describe("helpers", () => {
  it("labels markets like a betslip", () => {
    expect(friendlyLabel("1x2:home", "Arsenal", "Brighton", "Home Win")).toBe("Arsenal to win");
    expect(friendlyLabel("dc:away-draw", "Arsenal", "Brighton", "x")).toBe("Brighton or draw");
    expect(friendlyLabel("ou:over:1.5", "a", "b", "x")).toBe("Over 1.5 goals");
  });

  it("grades combos: all must win", () => {
    expect(gradeMarket("combo:1x2:home+ou:over:1.5", 2, 0)).toBe("win");
    expect(gradeMarket("combo:1x2:home+ou:over:1.5", 1, 0)).toBe("lose");
    expect(gradeMarket("combo:1x2:home+ou:over:2", 2, 0)).toBe("win"); // push on the line drops out
  });

  it("reads chances as 1 in N", () => {
    expect(oneIn(0.2)).toBe("about 1 in 5");
    expect(oneIn(0.04)).toBe("about 1 in 25");
  });

  it("validates requests, clamping and defaulting", () => {
    const r = parseForgeRequest({
      settings: { risk: "yolo", targetOdds: 99999, games: 40, picksPerGame: 7, markets: ["goals", "nonsense"], when: "never", leagues: "<x>" },
      state: { locked: [{ matchId: "fd:1", market: "1x2:home" }, { matchId: "bad id" }], removed: ["fd:2", 3], seed: -5 },
    });
    expect(r.settings).toMatchObject({ risk: "balanced", targetOdds: 1000, games: 12, picksPerGame: 2, markets: ["goals"], when: "today", leagues: "all" });
    expect(r.state.locked).toEqual([{ matchId: "fd:1", market: "1x2:home" }]);
    expect(r.state.removed).toEqual(["fd:2"]);
    expect(r.state.seed).toBe(0);
  });
});

describe("Forge markets by plan", () => {
  it("keeps free users on 1X2 whatever they ask for", async () => {
    const { marketsForPlan } = await import("./forge");
    expect(marketsForPlan(["result", "goals", "btts"], false)).toEqual(["result"]);
    expect(marketsForPlan(["double_chance", "goals"], false)).toEqual(["double_chance"]);
    expect(marketsForPlan(["goals"], false)).toEqual(["result"]);
    expect(marketsForPlan(["goals", "btts"], true)).toEqual(["goals", "btts"]);
  });
});

describe("forgeBest", () => {
  const settings: ForgeSettings = { ...DEFAULT_SETTINGS, targetOdds: 5, games: 10 };
  const fresh = { locked: [], removed: [], avoid: [], seed: 1 };

  it("takes the strongest reads first and stops once the price is reached", () => {
    const p = pool();
    const { legs, bench } = forgeBest(p, settings, fresh);
    const total = slipTotals(legs, 1).odds;
    expect(total).toBeGreaterThanOrEqual(0.95 * 5);
    expect(total).toBeLessThanOrEqual(5 * 1.35);
    // Nothing left on the bench is a stronger read than the weakest leg taken.
    const weakest = Math.min(...legs.map((l) => l.probability));
    expect(bench.every((b) => b.probability <= weakest + 0.08)).toBe(true);
    // Removing the weakest leg would leave the slip short of the price: no spare games.
    const sorted = [...legs].sort((a, b) => a.probability - b.probability);
    expect(slipTotals(sorted.slice(1), 1).odds).toBeLessThan(0.95 * 5);
  });

  it("uses fewer games for a smaller price", () => {
    const small = forgeBest(pool(), { ...settings, targetOdds: 2 }, fresh).legs.length;
    const big = forgeBest(pool(), { ...settings, targetOdds: 10 }, fresh).legs.length;
    expect(small).toBeLessThan(big);
  });

  it("keeps locked legs, never offers removed games, and swaps in the next best", () => {
    const first = forgeBest(pool(), settings, fresh);
    const keep = first.legs[0];
    const gone = first.legs[1].matchId;
    const again = forgeBest(pool(), settings, { locked: [{ matchId: keep.matchId, market: keep.market }], removed: [gone], avoid: [], seed: 1 });
    expect(again.legs.find((l) => l.matchId === keep.matchId)?.market).toBe(keep.market);
    expect([...again.legs, ...again.bench].some((l) => l.matchId === gone)).toBe(false);
    expect(nextBest(again.bench, new Set(again.legs.map((l) => l.matchId)))).toEqual(again.bench[0]);
  });

  it("offers corners and shots only on a tested line at its chance", () => {
    const prediction = fixture(0, 11);
    const corners = candidatesFor(prediction, { ...OPTS, markets: ["corners"] }, { "corners:under:12.5": 0.84, "corners:under:11.5": 0.9 });
    expect(corners.map((c) => c.market)).toEqual(["corners:under:12.5"]);
    expect(corners[0].label).toBe("Under 12.5 corners");
    // Below the line's tested chance, or with corners not chosen, nothing.
    expect(candidatesFor(prediction, { ...OPTS, markets: ["corners"] }, { "corners:under:12.5": 0.7 })).toHaveLength(0);
    expect(candidatesFor(prediction, OPTS, { "corners:under:12.5": 0.84 }).some((c) => c.market.startsWith("corners"))).toBe(false);
  });
});
