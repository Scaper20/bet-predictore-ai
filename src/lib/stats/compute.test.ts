import { describe, expect, it } from "vitest";
import type { Match, StandingRow } from "@/lib/types";
import {
  applyLiveScores, findStreaks, goalProfile, outcome, ratingBand, ratingHue, ratingScore, summariseForm,
  type TeamResult,
} from "./compute";

const r = (gf: number, ga: number, i = 0): TeamResult => ({
  matchId: `m${i}`, leagueCode: "premier-league", kickoff: new Date(2026, 8, 30 - i).toISOString(),
  isHome: i % 2 === 0, opponentId: `o${i}`, opponentName: `Opp ${i}`, goalsFor: gf, goalsAgainst: ga, publicId: `db:m${i}`,
});
const seq = (pairs: [number, number][]) => pairs.map(([gf, ga], i) => r(gf, ga, i));

describe("form", () => {
  it("reads outcomes and points", () => {
    expect(outcome(r(2, 1))).toBe("W");
    expect(outcome(r(1, 1))).toBe("D");
    const f = summariseForm(seq([[2, 0], [1, 1], [0, 3], [3, 1]]));
    expect(f.letters).toEqual(["W", "D", "L", "W"]);
    expect(f.points).toBe(7);
    expect(f.ppg).toBeCloseTo(1.75);
    expect(f.cleanSheets).toBe(1);
    expect(f.failedToScore).toBe(1);
  });

  it("trend compares the recent half with the earlier half", () => {
    const improving = summariseForm(seq([[1, 0], [1, 0], [0, 1], [0, 1]]));
    expect(improving.trend).toBe(3);
    expect(summariseForm(seq([[1, 0]])).trend).toBe(0);
  });
});

describe("goal profile", () => {
  it("shares and averages", () => {
    const g = goalProfile(seq([[2, 1], [0, 0], [3, 2], [1, 0]]));
    expect(g.over25).toBe(0.5);
    expect(g.btts).toBe(0.5);
    expect(g.scored).toBe(1.5);
    expect(g.cleanSheets).toBe(0.5);
  });
  it("empty is zero, not NaN", () => {
    expect(goalProfile([]).over25).toBe(0);
  });
});

describe("streaks", () => {
  it("finds a winning run and drops the weaker unbeaten one", () => {
    const s = findStreaks(seq([[2, 0], [1, 0], [3, 1], [2, 1], [1, 1], [0, 2]]));
    const kinds = s.map((x) => x.kind);
    expect(kinds).toContain("winning");
    expect(kinds).not.toContain("unbeaten");
    expect(s.find((x) => x.kind === "winning")?.run).toBe(4);
  });

  it("counts a dense goals window when there is no unbroken run", () => {
    const games = seq([[2, 1], [3, 0], [0, 0], [2, 2], [4, 1], [1, 2], [3, 3], [2, 1], [1, 0], [2, 3]]);
    const over = findStreaks(games).find((x) => x.kind === "over25");
    expect(over).toMatchObject({ consecutive: false, run: 8, of: 10 });
  });

  it("ranks a rare run above a common one of the same length", () => {
    const clean = findStreaks(seq([[1, 0], [2, 0], [1, 0], [0, 0]])).find((x) => x.kind === "cleanSheets")!;
    const unbeaten = findStreaks(seq([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]])).find((x) => x.kind === "unbeaten")!;
    expect(clean.strength / clean.run).toBeGreaterThan(unbeaten.strength / unbeaten.run);
  });

  it("short runs are not trends", () => {
    expect(findStreaks(seq([[1, 0], [0, 1], [1, 0]]))).toEqual([]);
  });
});

const row = (pos: number, id: string, pts: number, gd = 0, gf = 10): StandingRow => ({
  position: pos, team: { id, name: id.toUpperCase(), shortName: id }, played: 5, won: 0, drawn: 0, lost: 0,
  goalsFor: gf, goalsAgainst: gf - gd, goalDifference: gd, points: pts,
});
const liveMatch = (home: string, away: string, hs: number, as: number): Match => ({
  id: `sdb:${home}${away}`, kickoff: new Date().toISOString(), status: "live", minute: 60,
  league: { id: "pl", name: "PL", code: "premier-league" },
  home: { id: home, name: home.toUpperCase(), shortName: home }, away: { id: away, name: away.toUpperCase(), shortName: away },
  score: { home: hs, away: as }, source: "thesportsdb",
});

describe("live table", () => {
  const table = [row(1, "a", 12, 5), row(2, "b", 11, 4), row(3, "c", 10, 3), row(4, "d", 9, 1)];

  it("is the official table when nothing is live", () => {
    expect(applyLiveScores(table, []).map((x) => x.team.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves clubs on the scores in play", () => {
    const out = applyLiveScores(table, [liveMatch("c", "a", 2, 0)]);
    expect(out.map((x) => x.team.id)).toEqual(["c", "a", "b", "d"]);
    const c = out[0];
    expect(c.points).toBe(13);
    expect(c.movement).toBe(2);
    expect(c.live?.for).toBe(2);
    expect(out[1].movement).toBe(-1);
  });

  it("matches a feed's spelling by name when the id differs", () => {
    const m = liveMatch("x", "y", 1, 1);
    m.home = { id: "other-id", name: "D", shortName: "d" };
    m.away = { id: "b", name: "B", shortName: "b" };
    const out = applyLiveScores(table, [m]);
    expect(out.find((x) => x.team.id === "d")?.points).toBe(10);
  });
});

describe("ratings", () => {
  it("maps Elo onto 1-10 around 5.5", () => {
    expect(ratingScore(1500)).toBe(5.5);
    expect(ratingScore(1830)).toBe(10);
    expect(ratingScore(1200)).toBe(1);
    expect(ratingScore(1610)).toBe(7.5);
  });
  it("colour runs from red to green", () => {
    expect(ratingHue(1)).toBe(25);
    expect(ratingHue(10)).toBe(150);
    expect(ratingBand(9)).toBe("Elite");
    expect(ratingBand(3)).toBe("Weak");
  });
});
