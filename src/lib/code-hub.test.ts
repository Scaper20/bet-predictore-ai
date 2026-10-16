import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { DEFAULT_SETTINGS, candidatesFor, type PoolEntry } from "./forge";
import {
  FREE_TIER_ID,
  HUB_TIERS,
  bookablePool,
  buildHub,
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

  it("publishes each tier at full size, shortest first, near its target", () => {
    const hub = buildHub(pool(), "2026-10-16");
    expect(hub.length).toBeGreaterThan(0);
    const order = HUB_TIERS.map((t) => t.id);
    expect(hub.map((c) => c.tier)).toEqual(order.filter((id) => hub.some((c) => c.tier === id)));
    for (const code of hub) {
      const tier = HUB_TIERS.find((t) => t.id === code.tier)!;
      expect(code.legs).toHaveLength(tier.games);
      expect(new Set(code.legs.map((l) => l.matchId)).size).toBe(tier.games);
      const total = code.legs.reduce((o, l) => o * l.fairOdds, 1);
      expect(total).toBeGreaterThan(tier.target / 2.5);
      expect(total).toBeLessThan(tier.target * 2.5);
    }
  });

  it("publishes nothing from an empty pool", () => {
    expect(buildHub([], "2026-10-16")).toEqual([]);
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
    expect(codeState(stored, first, first)).toEqual({ state: "closed" });
  });
  it("waits when no code has been booked", () => {
    expect(codeState({ bookingCode: null, deadline: null }, first, first - 60_000)).toEqual({ state: "waiting" });
  });
});
