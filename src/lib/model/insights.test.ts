import { describe, expect, it } from "vitest";
import { buildPrediction } from "./predict";
import { fitLeague } from "./fit";
import { ordinal, rankTable } from "./insights";
import type { Match, ResultRow } from "@/lib/types";

const DAY = 86_400_000;

function row(h: string, a: string, hg: number, ag: number, date: number): ResultRow {
  return { homeId: h, awayId: a, homeName: h, awayName: a, homeGoals: hg, awayGoals: ag, date, leagueId: "t" };
}

/**
 * A double round-robin, run twice, where team strength is the index: Alpha
 * beats everyone, Foxtrot loses to everyone. Strong enough that every split
 * the insights look at has an unambiguous answer.
 */
function ladder(): ResultRow[] {
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  const rows: ResultRow[] = [];
  let d = Date.now() - 300 * DAY;
  for (let rep = 0; rep < 2; rep++) {
    for (let i = 0; i < names.length; i++) {
      for (let j = 0; j < names.length; j++) {
        if (i === j) continue;
        d += DAY;
        const stronger = i < j;
        rows.push(row(names[i], names[j], stronger ? 3 : 1, stronger ? 0 : 2, d));
      }
    }
  }
  return rows;
}

function fixture(home: string, away: string, code?: string): Match {
  return {
    id: `t:${home}-${away}`,
    kickoff: new Date().toISOString(),
    status: "scheduled",
    league: { id: "t", name: "Test", ...(code ? { code } : {}) },
    home: { id: home, name: home, shortName: home },
    away: { id: away, name: away, shortName: away },
    score: { home: null, away: null },
    source: "thesportsdb",
  };
}

describe("rankTable", () => {
  it("orders sides by fitted strength, best first", () => {
    const table = rankTable(fitLeague(ladder()));
    expect(table.get("alpha")?.overall).toBe(1);
    expect(table.get("foxtrot")?.overall).toBe(6);
  });
});

describe("insights", () => {
  it("names the stronger side and leans toward it", () => {
    const p = buildPrediction(fixture("Alpha", "Foxtrot"), ladder());
    const strength = p.insights.find((i) => i.kind === "strength");
    expect(strength?.lean).toBe("home");
    expect(strength?.text).toContain("Alpha 1st");
    expect(strength?.text).toContain("Foxtrot 6th");
  });

  it("reports venue splits only when both sides have enough games there", () => {
    const p = buildPrediction(fixture("Alpha", "Foxtrot"), ladder());
    const venue = p.insights.find((i) => i.kind === "venue");
    expect(venue?.lean).toBe("home");
    expect(venue?.text).toMatch(/Alpha at home: \d+W/);

    const thin = buildPrediction(fixture("Alpha", "Foxtrot"), ladder().slice(0, 12));
    expect(thin.insights.find((i) => i.kind === "venue")).toBeUndefined();
  });

  it("flags a scoring drought on the side that keeps losing 3-0", () => {
    const rows = ladder();
    let d = Date.now() - 20 * DAY;
    for (const opp of ["Bravo", "Charlie", "Delta", "Echo"]) rows.push(row(opp, "Foxtrot", 2, 0, (d += DAY)));
    const p = buildPrediction(fixture("Alpha", "Foxtrot"), rows);
    const drought = p.insights.find((i) => i.kind === "drought" && i.text.startsWith("Foxtrot"));
    expect(drought?.lean).toBe("home");
  });

  it("never invents observations for a fixture with no history", () => {
    const p = buildPrediction(fixture("Nobody", "Nowhere"), []);
    expect(p.insights.every((i) => i.kind === "edge" || i.kind === "neutral-venue")).toBe(true);
  });
});

describe("neutral venues", () => {
  it("drops home advantage at a tournament final, and only there", () => {
    const rows = ladder();
    const home = buildPrediction(fixture("Charlie", "Delta"), rows);
    const neutral = buildPrediction(fixture("Charlie", "Delta", "afcon"), rows);
    const qualifier = buildPrediction(fixture("Charlie", "Delta", "afcon-qualifiers"), rows);

    expect(neutral.model.neutralVenue).toBe(true);
    expect(neutral.model.homeAdvantage).toBe(0);
    expect(neutral.markets.home).toBeLessThan(home.markets.home);
    expect(neutral.insights.some((i) => i.kind === "neutral-venue")).toBe(true);

    expect(qualifier.model.neutralVenue).toBe(false);
    expect(qualifier.model.homeAdvantage).toBeCloseTo(home.model.homeAdvantage, 9);
  });
});

describe("ordinal", () => {
  it("handles the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "111th",
    ]);
  });
});
