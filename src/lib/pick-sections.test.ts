import { describe, expect, it } from "vitest";
import type { Match } from "@/lib/types";
import { pickSections } from "./pick-sections";

// 9 Oct 2026, 15:00 in Lagos (WAT, UTC+1).
const NOW = new Date("2026-10-09T14:00:00Z");

const match = (id: string, kickoff: string, status: Match["status"] = "scheduled", league = "epl"): { match: Match } => ({
  match: {
    id,
    kickoff,
    status,
    league: { code: league, name: league },
    home: { name: `${id} home` },
    away: { name: `${id} away` },
    score: { home: null, away: null },
    source: "thesportsdb",
  } as unknown as Match,
});

describe("pickSections", () => {
  it("puts games under way first, then the rest of today, then tomorrow and later", () => {
    const sections = pickSections(
      [
        match("sat", "2026-10-11T14:00:00Z"),
        match("tomorrow", "2026-10-10T18:00:00Z"),
        match("tonight", "2026-10-09T19:00:00Z"),
        match("live", "2026-10-09T13:00:00Z", "live"),
        match("ht", "2026-10-09T13:15:00Z", "halftime"),
      ],
      { now: NOW },
    );
    expect(sections.map((s) => s.title)).toEqual(["Live now", "Upcoming today", "Tomorrow", sections[3].title]);
    expect(sections[0].items.map((i) => i.match.id)).toEqual(["live", "ht"]);
    expect(sections[1].items.map((i) => i.match.id)).toEqual(["tonight"]);
    expect(sections[3].items.map((i) => i.match.id)).toEqual(["sat"]);
  });

  it("keeps a game stuck on live for hours out of the live section", () => {
    const sections = pickSections([match("stuck", "2026-10-09T06:00:00Z", "live")], { now: NOW });
    expect(sections.map((s) => s.key)).toEqual(["Today"]);
  });

  it("lists followed competitions first within a section, then by kickoff", () => {
    const sections = pickSections(
      [match("a", "2026-10-09T17:00:00Z", "scheduled", "epl"), match("b", "2026-10-09T19:00:00Z", "scheduled", "npfl")],
      { now: NOW, followed: new Set(["npfl"]) },
    );
    expect(sections[0].items.map((i) => i.match.id)).toEqual(["b", "a"]);
  });
});
