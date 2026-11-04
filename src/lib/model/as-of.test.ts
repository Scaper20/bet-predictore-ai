import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { trainingAsOf } from "./as-of";

const row = (date: string, home: string, away: string): ResultRow => ({
  date: Date.parse(date), homeId: home, awayId: away, homeName: home, awayName: away, homeGoals: 1, awayGoals: 0, leagueId: "x",
});

describe("trainingAsOf", () => {
  const kickoff = Date.parse("2026-11-04T19:00:00Z");
  const before = row("2026-10-30T19:00:00Z", "Alpha", "Beta");

  it("returns the very same array when nothing is at or after kickoff", () => {
    const rows = [before];
    expect(trainingAsOf(rows, kickoff, ["Gamma"], ["Delta"])).toBe(rows);
  });

  it("drops results at or after kickoff, the fixture's own included", () => {
    const own = row("2026-11-04T19:00:00Z", "Gamma", "Delta");
    const later = row("2026-11-05T19:00:00Z", "Alpha", "Beta");
    expect(trainingAsOf([before, own, later], kickoff, ["Gamma"], ["Delta"])).toEqual([before]);
  });

  it("drops the fixture's own row when the archive stamps it earlier that day", () => {
    const own = row("2026-11-04T00:00:00Z", "Gamma", "Delta");
    expect(trainingAsOf([before, own], kickoff, ["Gamma FC"], ["Delta"])).toEqual([before]);
  });

  it("keeps other results from the same day that finished before kickoff", () => {
    const sameDay = row("2026-11-04T12:00:00Z", "Alpha", "Beta");
    const rows = [before, sameDay];
    expect(trainingAsOf(rows, kickoff, ["Gamma"], ["Delta"])).toBe(rows);
  });
});
