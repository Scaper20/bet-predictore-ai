import { describe, expect, it } from "vitest";
import { matchCorners, matchGoals, matchShots, nameWords, findEspnGame, espnStatsComplete, goalsOf, halfTimeOf, type ArchiveRow, type EspnDetail, type EspnResult } from "./espn-shots";

const t = Date.parse("2026-10-12T01:00:00Z");

describe("nameWords", () => {
  it("drops accents, punctuation and filler words", () => {
    expect([...nameWords("Club León")]).toEqual(["leon"]);
    expect([...nameWords("Atl. San Luis")]).toEqual(["san", "luis"]);
  });
});

describe("matchShots", () => {
  const espn = [
    { date: t, home: "Pumas UNAM", away: "Club América", hg: 1, ag: 1, hsot: 4, asot: 6, hs: 11, as: 14 },
    { date: t, home: "Estudiantes de La Plata", away: "Racing Club", hg: 2, ag: 0, hsot: 7, asot: 2 },
  ];
  const rows = [
    { id: "a", kickoff: t - 3600_000, home: "UNAM Pumas", away: "Club America", hg: 1, ag: 1 },
    { id: "b", kickoff: t, home: "Estudiantes L.P.", away: "Racing Club", hg: 2, ag: 0 },
    // Same score, same night, different clubs: never matched.
    { id: "c", kickoff: t, home: "Necaxa", away: "Toluca", hg: 1, ag: 1 },
    // Right clubs, wrong score: not this game.
    { id: "d", kickoff: t, home: "Estudiantes L.P.", away: "Racing Club", hg: 1, ag: 0 },
  ];

  it("matches on date, exact score and a shared name word", () => {
    const out = matchShots(espn, rows);
    expect(out.map((u) => u.id).sort()).toEqual(["a", "b"]);
    expect(out.find((u) => u.id === "a")).toEqual({ id: "a", hsot: 4, asot: 6, hs: 11, as: 14 });
    expect(out.find((u) => u.id === "b")).toEqual({ id: "b", hsot: 7, asot: 2, hs: null, as: null });
  });

  it("does not match on a word several clubs share", () => {
    const night = [
      { date: t, home: "Rosario Central", away: "Tigre", hg: 1, ag: 0, hsot: 5, asot: 2 },
      { date: t, home: "Central Córdoba", away: "Lanús", hg: 2, ag: 2, hsot: 3, asot: 3 },
    ];
    expect(matchShots(night, [{ id: "x", kickoff: t, home: "Barracas Central", away: "Sarmiento Junin", hg: 1, ag: 0 }])).toEqual([]);
  });

  it("fills every source's copy of a game", () => {
    const copies = [
      { id: "p", kickoff: t, home: "AS Monaco FC", away: "Crvena Zvezda", hg: 5, ag: 1 },
      { id: "q", kickoff: t, home: "Monaco", away: "Crvena Zvezda", hg: 5, ag: 1 },
    ];
    const game = [{ date: t, home: "AS Monaco", away: "Red Star Belgrade", hg: 5, ag: 1, hsot: 9, asot: 2 }];
    expect(matchShots(game, copies).map((u) => u.id).sort()).toEqual(["p", "q"]);
  });

  it("skips a game ESPN lists without statistics", () => {
    const blank = [{ date: t, home: "Pumas UNAM", away: "Club América", hg: 1, ag: 1, hsot: 0, asot: 0, hs: 0, as: 0 }];
    expect(matchShots(blank, rows)).toEqual([]);
  });

  it("ignores games more than 30 hours apart", () => {
    expect(matchShots(espn, [{ ...rows[0], kickoff: t + 2 * 86_400_000 }])).toEqual([]);
  });
});

describe("findEspnGame", () => {
  const t = Date.UTC(2026, 9, 11, 14);
  const games = [
    { date: t, home: "Crystal Palace", away: "Nottingham Forest", hg: 3, ag: 1, hs: 13, as: 24, hsot: 7, asot: 6, hc: 5, ac: 8 },
    { date: t, home: "Hull City", away: "Everton", hg: 2, ag: 2, hs: 9, as: 15, hsot: 5, asot: 7, hc: 7, ac: 6 },
    { date: t, home: "Rayo Vallecano", away: "Athletic Club", hg: 1, ag: 1, hs: 1, as: 1, hsot: 1, asot: 0, hc: 1, ac: 2 },
  ];

  it("finds the game on time, score and a name word one club owns", () => {
    expect(findEspnGame(games, { home: "Crystal Palace", away: "Nott'm Forest", kickoff: t, hg: 3, ag: 1 })?.hc).toBe(5);
    expect(findEspnGame(games, { home: "Hull", away: "Everton", kickoff: t + 3_600_000, hg: 2, ag: 2 })?.ac).toBe(6);
    // Wrong score: not this game.
    expect(findEspnGame(games, { home: "Crystal Palace", away: "Nott'm Forest", kickoff: t, hg: 2, ag: 1 })).toBeNull();
  });

  it("refuses counts that never came through", () => {
    expect(espnStatsComplete(games[0])).toBe(true);
    expect(espnStatsComplete(games[2])).toBe(false);
    expect(espnStatsComplete({ ...games[0], hc: undefined })).toBe(false);
  });
});

describe("matchCorners", () => {
  const rows = [
    { id: "a", kickoff: t, home: "Flamengo", away: "Palmeiras", hg: 2, ag: 1 },
    { id: "b", kickoff: t, home: "Gremio", away: "Santos", hg: 0, ag: 0 },
  ];

  it("fills corners on the same match rules as shots", () => {
    const espn = [{ date: t, home: "Flamengo", away: "Palmeiras", hg: 2, ag: 1, hc: 6, ac: 3 }];
    expect(matchCorners(espn, rows)).toEqual([{ id: "a", hc: 6, ac: 3 }]);
  });

  it("skips a game listed without corners, or with nil for both sides", () => {
    const espn = [
      { date: t, home: "Flamengo", away: "Palmeiras", hg: 2, ag: 1 },
      { date: t, home: "Gremio", away: "Santos", hg: 0, ag: 0, hc: 0, ac: 0 },
    ];
    expect(matchCorners(espn, rows)).toEqual([]);
  });
});

describe("goalsOf", () => {
  const d = (clock: string, team: string, extra: Partial<EspnDetail> = {}): EspnDetail => ({ scoringPlay: true, clock: { displayValue: clock }, team: { id: team }, ...extra });

  it("reads each goal's minute, added time and side, as ESPN listed Bournemouth 2-0 Sunderland", () => {
    const details = [d("6'", "349"), { scoringPlay: false, clock: { displayValue: "17'" }, team: { id: "366" } }, d("48'", "349")];
    expect(goalsOf(details, "349", "366", 2, 0)).toEqual([[6, 0, "h"], [48, 0, "h"]]);
    expect(halfTimeOf(goalsOf(details, "349", "366", 2, 0)!)).toEqual({ home: 1, away: 0 });
  });

  it("keeps first-half added time in the first half", () => {
    const goals = goalsOf([d("45'+6'", "2"), d("90'+3'", "1")], "1", "2", 1, 1)!;
    expect(goals).toEqual([[45, 6, "a"], [90, 3, "h"]]);
    expect(halfTimeOf(goals)).toEqual({ home: 0, away: 1 });
  });

  it("reads an own goal for whichever side makes the score add up", () => {
    expect(goalsOf([d("10'", "2", { ownGoal: true })], "1", "2", 1, 0)).toEqual([[10, 0, "h"]]);
    expect(goalsOf([d("10'", "1", { ownGoal: true })], "1", "2", 1, 0)).toEqual([[10, 0, "h"]]);
  });

  it("gives nothing when the list doesn't add up to the score", () => {
    expect(goalsOf([d("10'", "1")], "1", "2", 2, 0)).toBeNull();
    expect(goalsOf([d("10'", "9")], "1", "2", 1, 0)).toBeNull();
  });
});

describe("matchGoals", () => {
  it("gives an archive row its timeline and half-time score", () => {
    const espn: EspnResult[] = [{ date: Date.parse("2026-10-18T14:00:00Z"), home: "AFC Bournemouth", away: "Sunderland", hg: 2, ag: 0, goals: [[6, 0, "h"], [48, 0, "h"]] }];
    const rows: ArchiveRow[] = [{ id: "r1", kickoff: Date.parse("2026-10-18T14:00:00Z"), home: "Bournemouth", away: "Sunderland", hg: 2, ag: 0 }];
    expect(matchGoals(espn, rows)).toEqual([{ id: "r1", goals: [[6, 0, "h"], [48, 0, "h"]], htHome: 1, htAway: 0 }]);
  });
});
