import { describe, expect, it } from "vitest";
import { adjustRates, mapUsage, sideAvailability, type PlayerUsage } from "./availability";

function u(id: string, starts: number, xg: number, xa: number, pos = 3): PlayerUsage {
  return { playerId: id, name: id.toUpperCase(), usualPosition: pos, games: starts, starts, minutes: starts * 90, goals: 0, assists: 0, xg, xa, teamGames: 6, teamXg: 9, teamXa: 3 };
}

const usage = [u("striker", 6, 4, 0.5), u("winger", 5, 1.5, 1.5, 3), u("keeper", 6, 0, 0, 0), u("cb", 4, 0.2, 0, 1), u("rotation", 2, 1, 0)];

describe("sideAvailability", () => {
  it("finds regulars missing from the named eleven and their share of the attack", () => {
    const s = sideAvailability(usage, ["winger", "keeper", "cb", "rotation"], [{ playerId: "striker", kind: "injury" }])!;
    expect(s.regulars).toBe(4);
    expect(s.missing.map((m) => m.playerId)).toEqual(["striker"]);
    expect(s.missing[0].reason).toBe("injured");
    expect(s.attackLoss).toBeCloseTo(4.5 / 12, 5);
    expect(s.basis).toBe("xi");
  });

  it("before the XI is out, uses the injury list only", () => {
    const s = sideAvailability(usage, null, [{ playerId: "keeper", kind: "suspension" }, { playerId: "rotation", kind: "injury" }])!;
    expect(s.missing.map((m) => m.playerId)).toEqual(["keeper"]);
    expect(s.keeperMissing).toBe(true);
    expect(s.missing[0].reason).toBe("suspended");
    expect(s.basis).toBe("absences");
  });

  it("says nothing on too few games", () => {
    expect(sideAvailability([{ ...u("a", 2, 1, 0), teamGames: 2 }], null)).toBeNull();
    expect(sideAvailability([], null)).toBeNull();
  });
});

describe("adjustRates", () => {
  it("leaves rates alone with nothing missing", () => {
    expect(adjustRates({ home: 1.5, away: 1.1 }, null, null, 0.6, 0.05)).toEqual({ home: 1.5, away: 1.1 });
  });

  it("lowers a side missing its attack and lifts the opponent of a side missing its keeper", () => {
    const home = sideAvailability(usage, ["winger", "keeper", "cb"], [])!; // striker missing
    const away = sideAvailability(usage, ["striker", "winger", "cb"], [])!; // keeper missing
    const r = adjustRates({ home: 1.5, away: 1.1 }, home, away, 0.6, 0.05);
    // Home lose their striker's share, but face a side without its keeper.
    expect(r.home).toBeCloseTo(1.5 * (1 - 0.6 * home.attackLoss) * (1 + 0.05 * (away.defenceLoss + 1)), 9);
    // Home lost no defenders, and away's missing keeper carries no attack: away unchanged.
    expect(r.away).toBeCloseTo(1.1, 9);
  });

  it("never moves a rate by more than a quarter", () => {
    const huge = { gamesLookedAt: 6, regulars: 11, missing: [], attackLoss: 1, defenceLoss: 11, keeperMissing: true, basis: "xi" as const };
    const r = adjustRates({ home: 2, away: 2 }, huge, huge, 5, 5);
    expect(r.home).toBeCloseTo(2 * 0.75 * 1.25, 9);
  });
});

describe("mapUsage", () => {
  it("drops malformed rows", () => {
    const rows = mapUsage([{ player_id: "a", name: "A", starts: "3", team_games: 6 }, { name: "no id" }, null]);
    expect(rows).toHaveLength(1);
    expect(rows[0].starts).toBe(3);
  });
});
