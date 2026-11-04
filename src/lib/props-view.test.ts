import { describe, expect, it } from "vitest";
import { clearedCount, factLine, pickLabel, viewProps, type PropRow } from "./props-view";

const row: PropRow = {
  matchId: "m", publicId: "fd:1", kickoff: "2026-11-04T20:00:00Z", leagueCode: "champions-league", leagueName: "UCL",
  homeName: "A", awayName: "B", eventId: "sr:match:1", playerId: "p", playerName: "Harry Kane", teamId: "t", teamName: "B", teamCrest: null,
  position: 3, lineup: "confirmed", market: "shots", mean: 3.4,
  rungs: [{ line: 2.5, over: 0.61, under: 0.39, overPrice: 1.55, underPrice: 2.3 }],
  recent: [4, 2, 5, 3, 1, 6, 3, 2, 4, 3],
  pick: { line: 1.5, side: "over", probability: 0.8, marketProbability: 0.76, price: 1.3, risk: "low", selection: "raw:776:x:y", published: true },
  hasPick: true, bookable: true, locked: false,
};

describe("viewProps", () => {
  it("free viewers get facts only: no mean, ladder or pick", () => {
    const [free] = viewProps([row], false);
    expect(free.locked).toBe(true);
    expect(free.mean).toBeNull();
    expect(free.rungs).toEqual([]);
    expect(free.pick).toBeNull();
    expect(free.hasPick).toBe(true);
    expect(free.recent).toEqual(row.recent);
    const html = JSON.stringify(free);
    expect(html).not.toContain("0.61");
    expect(html).not.toContain("raw:776");
    expect(html).not.toContain("3.4");
  });

  it("paid viewers get everything", () => {
    const [paid] = viewProps([row], true);
    expect(paid.locked).toBe(false);
    expect(paid.pick?.line).toBe(1.5);
    expect(paid.rungs).toHaveLength(1);
  });
});

describe("facts", () => {
  it("counts cleared lines over the last eight", () => {
    expect(clearedCount(row.recent, 2.5)).toEqual({ hits: 5, of: 8 });
    expect(clearedCount(row.recent, 2.5, "under")).toEqual({ hits: 3, of: 8 });
  });
  it("picks a fact line near the median", () => {
    expect(factLine(row.recent, "shots")).toBe(2.5);
    expect(factLine([31, 40, 44, 52], "passes")).toBe(44.5);
    expect(factLine([], "goals")).toBe(0.5);
    expect(pickLabel("shotsOnTarget", 0.5, "over")).toBe("Over 0.5 shots on target");
  });
});
