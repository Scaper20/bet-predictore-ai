import { describe, expect, it } from "vitest";
import { groupByDay } from "./format";
import type { Match, MatchStatus } from "@/lib/types";

/**
 * These assert ORDERING only, never the literal "Today"/"Tomorrow" labels.
 * relativeDay() resolves against the real clock in Africa/Lagos, so a suite
 * that asserted the strings would go red for whoever ran it either side of
 * Lagos midnight.
 */

function match(hoursFromNow: number, status: MatchStatus = "scheduled"): Match {
  const kickoff = new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
  return {
    id: `m${hoursFromNow}${status}`,
    kickoff,
    status,
    league: { id: "1", name: "Test League", code: "premier-league" },
    home: { id: "h", name: "Home", shortName: "HOM" },
    away: { id: "a", name: "Away", shortName: "AWY" },
    score: { home: null, away: null },
    source: "football-data",
  };
}

const kickoffsOf = (groups: { matches: Match[] }[]) =>
  groups.map((g) => g.matches.map((m) => Date.parse(m.kickoff)));

describe("groupByDay", () => {
  it("orders day groups chronologically regardless of incoming order", () => {
    // compareMatches ranks league importance above kickoff, so a later day can
    // legitimately arrive first. The headings must still read in date order.
    const tomorrow = match(30);
    const today = match(2);

    const groups = groupByDay([tomorrow, today]);

    expect(groups).toHaveLength(2);
    expect(groups[0].matches[0].id).toBe(today.id);
    expect(groups[1].matches[0].id).toBe(tomorrow.id);
  });

  it("orders fixtures within a day by kickoff", () => {
    const groups = groupByDay([match(6), match(2), match(4)]);

    const [firstDay] = kickoffsOf(groups);
    expect(firstDay).toEqual([...firstDay].sort((a, b) => a - b));
  });

  it("pins a live match to the top of its own day, not the first day", () => {
    // A live game belongs at the top of the day it is actually being played,
    // not hoisted into whichever group happens to render first.
    const liveToday = match(-1, "live");
    const laterToday = match(3);
    const tomorrow = match(30);

    const groups = groupByDay([tomorrow, laterToday, liveToday]);

    expect(groups).toHaveLength(2);
    expect(groups[0].matches[0].id).toBe(liveToday.id);
    expect(groups[1].matches[0].id).toBe(tomorrow.id);
  });

  it("returns nothing for an empty slate", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
