import { describe, expect, it } from "vitest";
import { ageOn, hitLines, hitRates, initials, mapGameLog, mapHeader, mapPeers, mapPlayerShots, per90, percentiles, seasonLines, shotSplits, statOf } from "./player-page-core";

const header = {
  id: "p1", name: "Erling Haaland", lastName: "Haaland", countryCode: "NOR", usualPosition: 3,
  profile: {
    position: "Striker", positionShort: "ST", otherPositions: ["CF", 5], shirt: 9, height: 195, foot: "Left",
    country: "Norway", birthDate: "2000-07-21", marketValue: 157706260, contractEnd: "2034-06-30",
    teamName: "Manchester City", onLoan: false, injury: null,
    career: { club: [{ team: "Manchester City", start: "2022-07-01", active: true, apps: 210, goals: 175 }, { team: "" }], national: [] },
    trophies: [{ name: "FA Cup", team: "Manchester City", won: 2, latest: "2025/2026" }, { name: "Nothing", won: 0 }],
  },
  team: { id: "t1", name: "Manchester City", crest: "https://x/c.png" },
};

function game(i: number, over: Record<string, unknown> = {}) {
  return {
    match_id: `m${i}`, source_ids: { thesportsdb: String(i) }, kickoff: `2026-10-${String(30 - i).padStart(2, "0")}T15:00:00Z`,
    league_code: i % 3 === 0 ? "champions-league" : "premier-league", side: i % 2 ? "away" : "home",
    opponent_id: "o", opponent_name: "Opp", goals_for: 2, goals_against: 1, role: "starter", minutes: 90, rating: 7.5,
    goals: i % 2, assists: 0, shots: 3 + (i % 3), shots_on_target: 1, xg: 0.6, xa: 0.1, tackles: 0, clearances: 0,
    fouls_committed: 1, fouls_won: 2, passes_attempted: 20, passes_completed: 15, saves: 0, is_goalkeeper: false, yellow: 0, red: 0,
    ...over,
  };
}

describe("header", () => {
  it("maps the profile and computes age", () => {
    const h = mapHeader(header, new Date("2026-11-03T00:00:00Z"))!;
    expect(h.name).toBe("Erling Haaland");
    expect(h.short).toBe("Haaland");
    expect(h.initials).toBe("EH");
    expect(h.group).toBe("attacker");
    expect(h.age).toBe(26);
    expect(h.otherPositions).toEqual(["CF", "5"]);
    expect(h.career.club).toHaveLength(1);
    expect(h.trophies).toHaveLength(1);
    expect(h.team?.name).toBe("Manchester City");
    expect(h.hasProfile).toBe(true);
  });

  it("works without a profile and rejects junk", () => {
    const h = mapHeader({ id: "p2", name: "Someone New", usualPosition: null })!;
    expect(h.hasProfile).toBe(false);
    expect(h.age).toBeNull();
    expect(mapHeader(null)).toBeNull();
    expect(mapHeader({ id: "x" })).toBeNull();
  });

  it("small helpers", () => {
    expect(initials("Rodri")).toBe("RO");
    expect(initials("Virgil van Dijk")).toBe("VD");
    expect(ageOn("not a date")).toBeNull();
    expect(per90(3, 45)).toBeNull();
    expect(per90(3, 270)).toBe(1);
  });
});

describe("game log and seasons", () => {
  const games = mapGameLog([game(1), game(2), game(3, { role: "sub", minutes: 20 }), game(4), { match_id: "bad" }]);

  it("maps rows newest first and drops malformed ones", () => {
    expect(games).toHaveLength(4);
    expect(games[0].matchId).toBe("m1");
    expect(games[0].isHome).toBe(false);
    expect(statOf(games[0], "goalsAssists")).toBe(1);
  });

  it("totals by competition with an 'all' line first", () => {
    const lines = seasonLines(games, new Date("2026-07-01T00:00:00Z"));
    expect(lines[0].leagueCode).toBe("all");
    expect(lines[0].apps).toBe(4);
    expect(lines[0].starts).toBe(3);
    expect(lines[0].minutes).toBe(290);
    expect(lines.find((l) => l.leagueCode === "champions-league")?.apps).toBe(1);
  });
});

describe("hit rates", () => {
  it("counts how often each line was cleared in recent starts", () => {
    const games = mapGameLog([1, 2, 4, 5, 7, 8].map((i) => game(i)));
    const rates = hitRates(games);
    const shots = rates.filter((r) => r.market === "shots");
    expect(shots.length).toBeGreaterThan(0);
    for (const r of shots) expect(r.hits).toBe(r.values.filter((v) => v > r.line).length);
    expect(rates.some((r) => r.market === "saves")).toBe(false);
  });

  it("needs three starts, and keepers get saves", () => {
    expect(hitRates(mapGameLog([game(1), game(2)]))).toEqual([]);
    const gk = mapGameLog([1, 2, 4].map((i) => game(i, { is_goalkeeper: true, saves: 3 })));
    expect(hitRates(gk).every((r) => r.market === "saves")).toBe(true);
  });

  it("lines sit around the median", () => {
    expect(hitLines([1, 2, 2, 3], "shots")).toEqual([1.5, 2.5, 3.5]);
    expect(hitLines([0, 0, 1], "goals")).toEqual([0.5, 1.5]);
    expect(hitLines([38, 41, 44], "passes")).toEqual([34.5, 39.5, 44.5]);
  });
});

describe("percentiles", () => {
  it("ranks a player within the peer pool", () => {
    const peers = mapPeers(Array.from({ length: 20 }, (_, i) => ({ player_id: `p${i}`, minutes: 1000, shots: i, goals: 0.1 })));
    const pct = percentiles("p19", peers, ["shots", "goals"])!;
    expect(pct.shots).toBeGreaterThan(90);
    expect(pct.goals).toBe(50);
    expect(percentiles("nobody", peers, ["shots"])).toBeNull();
    expect(percentiles("p1", peers.slice(0, 5), ["shots"])).toBeNull();
  });
});

describe("shots", () => {
  it("scales shots and splits them", () => {
    const shots = mapPlayerShots([
      { x: 95, y: 34, xg: 0.4, event_type: "Goal", on_target: true, shot_type: "LeftFoot", situation: "RegularPlay" },
      { x: 80, y: 20, xg: 0.05, event_type: "Miss", shot_type: "Header", situation: "FromCorner" },
      { x: null },
    ], "Haaland");
    expect(shots).toHaveLength(2);
    expect(shots[0].goal).toBe(true);
    const byType = shotSplits(shots, "type");
    expect(byType.map((s) => s.label).sort()).toEqual(["Header", "Left foot"]);
  });
});
