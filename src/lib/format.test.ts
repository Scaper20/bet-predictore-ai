import { describe, expect, it } from "vitest";
import { groupByDay } from "./format";
import type { Match, MatchStatus } from "@/lib/types";

/**
 * These assert ORDERING only, never the literal "Today"/"Tomorrow" labels.
 * relativeDay() resolves against the real clock in Africa/Lagos, so a suite
 * that asserted the strings would go red for whoever ran it either side of
 * Lagos midnight.
 *
 * Fixtures are anchored to a CALENDAR DAY and an hour within it, not to an
 * offset from `now`. groupByDay buckets on the Lagos calendar date, so
 * "now + 3 hours" is only reliably "today" if the suite happens to run before
 * 21:00 — which is how this file started failing every evening.
 */

/** A kickoff at `hour` local time, `dayOffset` days from today. */
function match(dayOffset: number, hour: number, status: MatchStatus = "scheduled"): Match {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);

  return {
    id: `d${dayOffset}h${hour}${status}`,
    kickoff: d.toISOString(),
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
    const tomorrow = match(1, 15);
    const today = match(0, 15);

    const groups = groupByDay([tomorrow, today]);

    expect(groups).toHaveLength(2);
    expect(groups[0].matches[0].id).toBe(today.id);
    expect(groups[1].matches[0].id).toBe(tomorrow.id);
  });

  it("orders fixtures within a day by kickoff", () => {
    const groups = groupByDay([match(0, 18), match(0, 12), match(0, 15)]);

    // All three are the same calendar day, so this is one group — the
    // assertion below is only meaningful because of that.
    expect(groups).toHaveLength(1);
    const [firstDay] = kickoffsOf(groups);
    expect(firstDay).toHaveLength(3);
    expect(firstDay).toEqual([...firstDay].sort((a, b) => a - b));
  });

  it("pins a live match to the top of its own day, not the first day", () => {
    // A live game belongs at the top of the day it is actually being played,
    // not hoisted into whichever group happens to render first. The live one
    // kicks off LATEST of the three today, so ordering by kickoff alone would
    // put it last.
    const liveToday = match(0, 20, "live");
    const earlierToday = match(0, 12);
    const tomorrow = match(1, 15);

    const groups = groupByDay([tomorrow, earlierToday, liveToday]);

    expect(groups).toHaveLength(2);
    expect(groups[0].matches.map((m) => m.id)).toEqual([liveToday.id, earlierToday.id]);
    expect(groups[1].matches[0].id).toBe(tomorrow.id);
  });

  it("returns nothing for an empty slate", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
