import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction } from "@/lib/model/predict";
import { candidatesFor, type PoolEntry } from "./forge";
import { buildHub, HUB_FORGE_MARKETS } from "./code-hub";
import { buildShadowHub, teamMark, teamRecords, TEAM_BASE_HIT, TEAM_WEIGHT, type SettledPick } from "./code-hub-shadow";

const pick = (home: string, away: string, day: number, won: boolean, leagueCode = "serie-a"): SettledPick => ({
  leagueCode,
  homeName: home,
  awayName: away,
  kickoff: new Date(Date.UTC(2026, 9, day)).toISOString(),
  won,
});

describe("teamRecords", () => {
  it("counts only each team's last eight picks", () => {
    // Ten picks on Bologna's games: the first two lost, the last eight won.
    const picks = Array.from({ length: 10 }, (_, i) => pick("Bologna", `Opp${i}`, i + 1, i >= 2));
    expect(teamRecords(picks).get("serie-a|bologna")).toEqual({ n: 8, hit: 1 });
  });

  it("gives no record to a team with fewer than four picks", () => {
    const picks = [pick("Lecce", "A", 1, true), pick("B", "Lecce", 2, true), pick("Lecce", "C", 3, false)];
    expect(teamRecords(picks).has("serie-a|lecce")).toBe(false);
  });

  it("keeps the same name in two leagues apart", () => {
    const picks = [...[1, 2, 3, 4].map((d) => pick("Union", "X", d, true, "a")), ...[1, 2, 3, 4].map((d) => pick("Union", "Y", d, false, "b"))];
    const r = teamRecords(picks);
    expect(r.get("a|union")?.hit).toBe(1);
    expect(r.get("b|union")?.hit).toBe(0);
  });
});

describe("teamMark", () => {
  const records = new Map([
    ["serie-a|bologna", { n: 8, hit: 1 }],
    ["serie-a|lecce", { n: 8, hit: 0.75 }],
  ]);

  it("nudges by a quarter of the pair's distance from the usual hit rate", () => {
    expect(teamMark(records, "serie-a", "Bologna", "Lecce")).toBeCloseTo(TEAM_WEIGHT * (0.875 - TEAM_BASE_HIT), 9);
  });

  it("is zero when either team has no record", () => {
    expect(teamMark(records, "serie-a", "Bologna", "Parma")).toBe(0);
    expect(teamMark(records, "la-liga", "Bologna", "Lecce")).toBe(0);
  });
});

/* A small synthetic league, as in code-hub.test.ts. */
const TEAMS = ["Aces", "Bees", "Cubs", "Dons", "Eels", "Fox", "Gulls", "Hawks", "Ibis", "Jays", "Kites", "Lions"];
const RESULTS: ResultRow[] = (() => {
  const rows: ResultRow[] = [];
  let day = Date.parse("2026-01-01");
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 2; round++)
    for (let i = 0; i < TEAMS.length; i++)
      for (let j = 0; j < TEAMS.length; j++) {
        if (i === j) continue;
        const hg = Math.floor(rnd() * (2.2 - i * 0.12) + rnd() * 1.2);
        const ag = Math.floor(rnd() * (2.2 - j * 0.12) * 0.8 + rnd() * 0.9);
        rows.push({ homeId: TEAMS[i], awayId: TEAMS[j], homeName: TEAMS[i], awayName: TEAMS[j], homeGoals: hg, awayGoals: ag, date: (day += 3600_000), leagueId: "x" });
      }
  return rows;
})();

function pool(): PoolEntry[] {
  return [[0, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6], [11, 0], [10, 1], [6, 2], [7, 3]].map(([i, j], k) => {
    const match: Match = {
      id: `t:${i}-${j}`,
      kickoff: new Date(Date.now() + (6 + k) * 3600_000).toISOString(),
      status: "scheduled",
      league: { id: "x", name: "Test League", code: "premier-league" },
      home: { id: TEAMS[i], name: TEAMS[i], shortName: TEAMS[i] },
      away: { id: TEAMS[j], name: TEAMS[j], shortName: TEAMS[j] },
      score: { home: null, away: null },
      source: "football-data",
    };
    const prediction = buildPrediction(match, RESULTS);
    return { prediction, candidates: candidatesFor(prediction, { markets: HUB_FORGE_MARKETS, picksPerGame: 1, allowHandicap: true }) };
  });
}

describe("buildShadowHub", () => {
  it("is the real hub when no team has a record", () => {
    const p = pool();
    expect(buildShadowHub(p, "2026-11-09", new Map())).toEqual(buildHub(p, "2026-11-09"));
  });

  it("hands every leg back at its real chance, whatever the nudge", () => {
    const p = pool();
    const records = new Map(TEAMS.map((t) => [`premier-league|${t.toLowerCase()}`, { n: 8, hit: 1 }]));
    const real = new Map(p.flatMap((e) => e.candidates.map((c) => [`${e.prediction.match.id}|${c.market}`, c.probability] as const)));
    for (const code of buildShadowHub(p, "2026-11-09", records)) {
      for (const l of code.legs) expect(l.probability).toBe(real.get(`${l.matchId}|${l.market}`));
    }
  });
});
