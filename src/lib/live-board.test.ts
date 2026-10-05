import { describe, expect, it } from "vitest";
import type { Match } from "@/lib/types";
import { groupLiveMatches, matchProgress, searchLiveGroups } from "./live-board";

let n = 0;
function match(league: Partial<Match["league"]>, over: Partial<Match> = {}): Match {
  n++;
  return {
    id: `t:${n}`,
    kickoff: "2026-10-05T14:00:00Z",
    status: "live",
    minute: 30,
    league: { id: "x", name: "Somewhere League", ...league },
    home: { id: `h${n}`, name: `Home ${n}`, shortName: `H${n}` },
    away: { id: `a${n}`, name: `Away ${n}`, shortName: `A${n}` },
    score: { home: 0, away: 0 },
    source: "thesportsdb",
    ...over,
  };
}

describe("groupLiveMatches", () => {
  it("puts catalogued leagues first, in catalogue order", () => {
    const groups = groupLiveMatches([
      match({ id: "9", name: "Mongolian Premier League" }),
      match({ id: "2", name: "La Liga", code: "la-liga" }),
      match({ id: "1", name: "Premier League", code: "premier-league" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["premier-league", "la-liga", "9|Mongolian Premier League"]);
    expect(groups[0].tracked).toBe(true);
    expect(groups[2].tracked).toBe(false);
  });

  it("orders other leagues by how many games they have live", () => {
    const groups = groupLiveMatches([
      match({ id: "a", name: "Alpha League" }),
      match({ id: "b", name: "Beta League" }),
      match({ id: "b", name: "Beta League" }),
    ]);
    expect(groups.map((g) => [g.name, g.matches.length])).toEqual([
      ["Beta League", 2],
      ["Alpha League", 1],
    ]);
  });

  it("puts the games furthest on first within a league", () => {
    const [g] = groupLiveMatches([
      match({ id: "a" }, { minute: 12 }),
      match({ id: "a" }, { minute: 80 }),
      match({ id: "a" }, { status: "halftime", minute: null }),
    ]);
    expect(g.matches.map((m) => m.minute ?? "HT")).toEqual([80, "HT", 12]);
  });
});

describe("searchLiveGroups", () => {
  const groups = groupLiveMatches([
    match({ id: "1", name: "Premier League", code: "premier-league" }, { home: { id: "1", name: "Arsenal", shortName: "ARS" } }),
    match({ id: "1", name: "Premier League", code: "premier-league" }),
    match({ id: "7", name: "Série A Brasil", country: "Brazil" }, { home: { id: "2", name: "São Paulo", shortName: "SAO" } }),
  ]);

  it("matches teams, ignoring case and accents", () => {
    const hits = searchLiveGroups(groups, "sao paulo");
    expect(hits).toHaveLength(1);
    expect(hits[0].matches[0].home.name).toBe("São Paulo");
    expect(searchLiveGroups(groups, "ARSENAL")[0].matches).toHaveLength(1);
  });

  it("keeps a whole league when the league itself matches", () => {
    expect(searchLiveGroups(groups, "premier")[0].matches).toHaveLength(2);
    expect(searchLiveGroups(groups, "brazil")).toHaveLength(1);
  });

  it("returns everything for an empty query", () => {
    expect(searchLiveGroups(groups, "  ")).toBe(groups);
  });
});

describe("matchProgress", () => {
  it("tracks the clock, capped at full time", () => {
    expect(matchProgress(match({}, { minute: 45 }))).toBe(0.5);
    expect(matchProgress(match({}, { minute: 94 }))).toBe(1);
    expect(matchProgress(match({}, { status: "halftime", minute: null }))).toBe(0.5);
  });
});
