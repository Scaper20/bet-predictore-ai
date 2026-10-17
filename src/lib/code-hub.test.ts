import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { DEFAULT_SETTINGS, candidatesFor, type PoolEntry } from "./forge";
import {
  FREE_TIER_ID,
  hubGameRange,
  HUB_FORGE_MARKETS,
  HUB_LEG_MIN_PROBABILITY,
  HUB_MAX_CODES_PER_GAME,
  HUB_MIN_TARGET_SHARE,
  HUB_TIERS,
  bookablePool,
  buildHub,
  hubMarketAllowed,
  hubTotals,
  codeState,
  hubAccess,
  hubLegResult,
  hubStatus,
  type HubLeg,
} from "./code-hub";
import { isQuotable } from "./odds/markets";

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


describe("bookablePool", () => {
  it("keeps only single picks SportyBet can book", () => {
    for (const e of bookablePool(pool())) {
      for (const c of e.candidates) {
        expect(c.market.startsWith("combo:")).toBe(false);
        expect(isQuotable(c.market)).toBe(true);
      }
    }
  });
});

describe("buildHub", () => {
  it("is the same hub for the same pool and day", () => {
    const a = buildHub(pool(), "2026-10-16").map((c) => c.legs.map((l) => l.matchId + l.market));
    const b = buildHub(pool(), "2026-10-16").map((c) => c.legs.map((l) => l.matchId + l.market));
    expect(a).toEqual(b);
  });

  it("publishes each tier at any length in its range, shortest first, near its target", () => {
    const hub = buildHub(pool(), "2026-10-16");
    expect(hub.length).toBeGreaterThan(0);
    const order = HUB_TIERS.map((t) => t.id);
    expect(hub.map((c) => c.tier)).toEqual(order.filter((id) => hub.some((c) => c.tier === id)));
    for (const code of hub) {
      const tier = HUB_TIERS.find((t) => t.id === code.tier)!;
      const [fewest, most] = hubGameRange(tier);
      expect(code.legs.length).toBeGreaterThanOrEqual(fewest);
      expect(code.legs.length).toBeLessThanOrEqual(most);
      expect(new Set(code.legs.map((l) => l.matchId)).size).toBe(code.legs.length);
      const total = code.legs.reduce((o, l) => o * l.fairOdds, 1);
      expect(total).toBeGreaterThan(tier.target * HUB_MIN_TARGET_SHARE);
      expect(total).toBeLessThan(tier.target * 2.5);
    }
  });

  it("lets a 2-odds code run from two to four games, and keeps a 100 near its count", () => {
    expect(hubGameRange(HUB_TIERS.find((t) => t.id === "2")!)).toEqual([2, 4]);
    expect(hubGameRange(HUB_TIERS.find((t) => t.id === "100")!)).toEqual([11, 13]);
  });

  it("publishes nothing from an empty pool", () => {
    expect(buildHub([], "2026-10-16")).toEqual([]);
  });
});

describe("buildHub rules", () => {
  const HUB_OPTS = { markets: HUB_FORGE_MARKETS, picksPerGame: 1 as const, allowHandicap: true };
  const PAIRS = [[0, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6], [11, 0], [10, 1], [6, 2], [7, 3], [8, 4], [9, 5]];
  const entries = (hours: number): PoolEntry[] =>
    PAIRS.map(([i, j], k) => {
      const prediction = fixture(i, j, hours + k);
      return { prediction, candidates: candidatesFor(prediction, HUB_OPTS) };
    });
  const today = entries(2);
  const later = PAIRS.map(([i, j], k) => {
    // The same pairings two days on, as different fixtures.
    const prediction = fixture(i, j, 50 + k);
    prediction.match.id = `later:${i}-${j}`;
    return { prediction, candidates: candidatesFor(prediction, HUB_OPTS) };
  });
  const hub = buildHub(today, "2026-10-16", [...today, ...later]);

  it("uses only match result, double chance, over 1.5 and half-goal handicaps, every leg at 60% or more", () => {
    for (const code of hub) {
      for (const l of code.legs) {
        expect(hubMarketAllowed(l.market)).toBe(true);
        expect(l.market.startsWith("ou:under")).toBe(false);
        expect(l.probability).toBeGreaterThanOrEqual(HUB_LEG_MIN_PROBABILITY);
      }
    }
  });

  it("puts a game in at most two codes, always with the same pick", () => {
    const seen = new Map<string, { market: string; count: number }>();
    for (const code of hub) {
      for (const l of code.legs) {
        const prev = seen.get(l.matchId);
        if (prev) expect(l.market).toBe(prev.market);
        seen.set(l.matchId, { market: l.market, count: (prev?.count ?? 0) + 1 });
      }
    }
    for (const v of seen.values()) expect(v.count).toBeLessThanOrEqual(HUB_MAX_CODES_PER_GAME);
  });

  it("keeps daily codes on today's games and lets the four-day codes reach ahead", () => {
    for (const code of hub) {
      const tier = HUB_TIERS.find((t) => t.id === code.tier)!;
      if (tier.days === 1) for (const l of code.legs) expect(l.matchId.startsWith("later:")).toBe(false);
    }
    const long = hub.filter((c) => HUB_TIERS.find((t) => t.id === c.tier)!.days === 4);
    expect(long.length).toBeGreaterThan(0);
    expect(long.some((c) => c.legs.some((l) => l.matchId.startsWith("later:")))).toBe(true);
  });

  it("publishes a code only within reach of its target odds", () => {
    for (const code of hub) {
      const tier = HUB_TIERS.find((t) => t.id === code.tier)!;
      expect(hubTotals(code.legs).odds).toBeGreaterThanOrEqual(HUB_MIN_TARGET_SHARE * tier.target);
    }
    // Only short prices on offer: nine or eleven of them cannot make 50 or 100.
    const short = [...today, ...later]
      .map((e) => ({ ...e, candidates: e.candidates.filter((c) => c.fairOdds < 1.3) }))
      .filter((e) => e.candidates.length > 0);
    expect(buildHub(short, "2026-10-16", short).some((c) => c.tier === "50" || c.tier === "100")).toBe(false);
  });

  it("never offers a 1.5-odds code", () => {
    expect(HUB_TIERS.every((t) => t.target >= 2)).toBe(true);
  });
});

describe("hubAccess", () => {
  const kickoff = Date.parse("2026-10-16T15:00:00Z");
  const before = kickoff - 3600_000;
  it("opens every code to paid members", () => {
    for (const t of HUB_TIERS) expect(hubAccess(t.id, kickoff, true, before)).toBe("open");
  });
  it("opens only the free code to free accounts before kick-off, the rest after", () => {
    for (const t of HUB_TIERS) {
      expect(hubAccess(t.id, kickoff, false, before)).toBe(t.id === FREE_TIER_ID ? "open" : "locked");
      expect(hubAccess(t.id, kickoff, false, kickoff + 1)).toBe("open");
    }
  });
});

describe("settling", () => {
  const leg = (market: string): HubLeg => ({
    matchId: "m",
    homeName: "A",
    awayName: "B",
    league: "L",
    kickoff: "2026-10-16T15:00:00Z",
    market,
    label: market,
    probability: 0.5,
    fairOdds: 2,
    price: null,
  });
  it("grades legs from the final score", () => {
    expect(hubLegResult(leg("1x2:home"), { home: 2, away: 0 })).toBe("win");
    expect(hubLegResult(leg("1x2:home"), { home: 0, away: 0 })).toBe("loss");
    expect(hubLegResult(leg("1x2:home"), undefined)).toBe("pending");
  });
  it("loses at the first miss and lands when every leg is in", () => {
    const k = 0;
    expect(hubStatus(["win", "loss", "pending"], k, 1)).toBe("lost");
    expect(hubStatus(["win", "win"], k, 1)).toBe("won");
    expect(hubStatus(["win", "pending"], k, 1)).toBe("live");
    expect(hubStatus(["pending"], 10, 1)).toBe("pending");
  });
});

describe("codeState", () => {
  const first = Date.parse("2026-10-16T15:00:00Z");
  it("shows a stored code until the first kick-off", () => {
    const stored = { bookingCode: "ABC123", deadline: "2026-10-16T15:00:00Z" };
    expect(codeState(stored, first, first - 60_000)).toEqual({ state: "ready", bookingCode: "ABC123", deadline: first });
  });
  it("keeps the code on the card once the games start", () => {
    const stored = { bookingCode: "ABC123", deadline: "2026-10-16T15:00:00Z" };
    expect(codeState(stored, first, first)).toEqual({ state: "started", bookingCode: "ABC123" });
    expect(codeState(stored, first, first + 3 * 86_400_000)).toEqual({ state: "started", bookingCode: "ABC123" });
    expect(codeState({ bookingCode: null, deadline: null }, first, first)).toEqual({ state: "closed" });
  });
  it("waits when no code has been booked", () => {
    expect(codeState({ bookingCode: null, deadline: null }, first, first - 60_000)).toEqual({ state: "waiting" });
  });
});
