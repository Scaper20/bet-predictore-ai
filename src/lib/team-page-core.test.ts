import { describe, expect, it } from "vitest";
import type { LeagueDef } from "@/lib/leagues";
import { mapLeaders, mapProfile, parseTeamSegment, primaryLeague, seasonStart, teamSegment, teamSlug, topBy } from "./team-page-core";

const ID = "8f14e45f-ceea-4e7a-9b6c-1d2e3f4a5b6c";

describe("team URLs", () => {
  it("slugs are ASCII and readable", () => {
    expect(teamSlug("Paris Saint-Germain")).toBe("paris-saint-germain");
    expect(teamSlug("FC København")).toBe("fc-kobenhavn");
    expect(teamSlug("Bayern München")).toBe("bayern-munchen");
    expect(teamSlug("1. FC Köln")).toBe("1-fc-koln");
    expect(teamSlug("???")).toBe("club");
  });

  it("round-trips a segment and accepts a bare id", () => {
    expect(parseTeamSegment(teamSegment(ID, "Arsenal"))).toEqual({ id: ID, slug: "arsenal" });
    expect(parseTeamSegment(ID)).toEqual({ id: ID, slug: null });
  });

  it("rejects anything that is not a club id", () => {
    expect(parseTeamSegment("arsenal")).toBeNull();
    expect(parseTeamSegment("arsenal--1234")).toBeNull();
    expect(parseTeamSegment(`<script>--${ID}`)).toBeNull();
    expect(parseTeamSegment("' or 1=1 --")).toBeNull();
  });
});

describe("primary league", () => {
  const defs: Record<string, Partial<LeagueDef>> = {
    "premier-league": { code: "premier-league", country: "England" },
    "champions-league": { code: "champions-league", country: "Europe" },
    "fa-cup": { code: "fa-cup", country: "England", knockout: true },
  };
  const byCode = (c: string) => defs[c] as LeagueDef | undefined;

  it("prefers the domestic league over cups and Europe", () => {
    const codes = ["champions-league", "champions-league", "champions-league", "fa-cup", "premier-league", "premier-league"];
    expect(primaryLeague(codes, byCode)?.code).toBe("premier-league");
  });

  it("falls back to the most played competition", () => {
    expect(primaryLeague(["champions-league", "unknown"], byCode)?.code).toBe("champions-league");
    expect(primaryLeague([], byCode)).toBeNull();
  });
});

describe("season start", () => {
  it("runs July to June", () => {
    expect(seasonStart(new Date("2026-11-03T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(seasonStart(new Date("2027-03-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});

describe("profile", () => {
  it("groups the squad, flags injuries, keeps recent transfers first", () => {
    const p = mapProfile({
      coach: "Mikel Arteta",
      venue: "Emirates Stadium",
      capacity: 60704,
      squad: [
        { id: 1, name: "David Raya", group: "keepers", shirt: 1 },
        { id: 7, name: "Bukayo Saka", group: "attackers", shirt: 7, goals: 4, injured: true, injury: "Late November" },
        { id: 9, name: "", group: "attackers" },
        { id: 10, name: "Coach Person", group: "coach" },
      ],
      transfers: [
        { direction: "in", name: "Old Signing", date: "2025-07-01", from: "Club A" },
        { direction: "out", name: "New Sale", date: "2026-09-01", to: "Club B", fee: "€30M" },
        { direction: "sideways", name: "Nope" },
      ],
      honours: [{ name: "Premier League", won: 14, seasons: ["2025/2026", "2003/2004"] }, { name: "Nothing", won: 0 }],
    })!;
    expect(p.coach).toBe("Mikel Arteta");
    expect(p.squad.keepers).toHaveLength(1);
    expect(p.squad.attackers.map((m) => m.name)).toEqual(["Bukayo Saka"]);
    expect(p.injured.map((m) => m.name)).toEqual(["Bukayo Saka"]);
    expect(p.transfers.map((t) => t.name)).toEqual(["New Sale", "Old Signing"]);
    expect(p.transfers[0].club).toBe("Club B");
    expect(p.honours).toEqual([{ name: "Premier League", won: 14, latest: "2025/2026" }]);
    expect(mapProfile(null)).toBeNull();
  });
});

describe("leaders", () => {
  it("maps rows and ranks by a stat", () => {
    const rows = mapLeaders([
      { player_id: "a", name: "A", apps: 10, minutes: 900, goals: 5 },
      { player_id: "b", name: "B", apps: 4, minutes: 200, goals: 5 },
      { player_id: "c", name: "C", apps: 10, minutes: 900, goals: 0 },
      { name: "no id" },
    ]);
    expect(rows).toHaveLength(3);
    expect(topBy(rows, (l) => l.goals).map((l) => l.name)).toEqual(["B", "A"]);
    expect(topBy(rows, (l) => l.goals, 5, 5).map((l) => l.name)).toEqual(["A"]);
  });
});
