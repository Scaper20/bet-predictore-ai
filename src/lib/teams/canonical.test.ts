import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { canonicaliseRows, looseKey, type NameBook } from "./canonical";

const row = (home: string, away: string, day = "2026-09-01", hg = 1, ag = 0): ResultRow => ({
  homeId: home, awayId: away, homeName: home, awayName: away, homeGoals: hg, awayGoals: ag,
  date: Date.parse(`${day}T15:00:00Z`), leagueId: "premier-league",
});

const book: NameBook = {
  canonical: new Map([
    [looseKey("Leeds United"), "Leeds United"],
    [looseKey("Leeds"), "Leeds United"],
    [looseKey("Nott'm Forest"), "Nottingham Forest"],
    [looseKey("Nottingham Forest"), "Nottingham Forest"],
  ]),
  spellings: new Map(),
};

describe("canonical club names", () => {
  it("matches the resolver's loose key", () => {
    expect(looseKey("Bendel Insurance F.C.")).toBe(looseKey("Bendel Insurance"));
    expect(looseKey("Man United")).toBe(looseKey("Manchester United"));
  });

  it("rewrites history spellings to the fixture's names", () => {
    const [r] = canonicaliseRows([row("Leeds", "Nott'm Forest")], book);
    expect(r.homeName).toBe("Leeds United");
    expect(r.awayName).toBe("Nottingham Forest");
    expect(r.homeId).toBe("Leeds United");
  });

  it("drops a game two sources hold under two spellings", () => {
    const out = canonicaliseRows([row("Leeds", "Nott'm Forest"), row("Leeds United", "Nottingham Forest")], book);
    expect(out).toHaveLength(1);
  });

  it("leaves unknown names alone", () => {
    const [r] = canonicaliseRows([row("Wrexham", "Leeds")], book);
    expect(r.homeName).toBe("Wrexham");
    expect(r.awayName).toBe("Leeds United");
  });
});
