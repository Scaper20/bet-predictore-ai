import { describe, expect, it } from "vitest";
import { byRank, gradeCode, gradeGame, rankScore, recordOf } from "./code-hub-posts-core";

describe("rankScore", () => {
  it("prefers a fair price on a likelier code", () => {
    expect(rankScore(0.4, 1.0)).toBeGreaterThan(rankScore(0.1, 1.0));
    expect(rankScore(0.4, 1.1)).toBeGreaterThan(rankScore(0.4, 0.9));
  });

  it("sinks longshots and codes we can't fully read", () => {
    expect(rankScore(0.02, 3)).toBeLessThan(rankScore(0.05, 0.6));
    expect(rankScore(null, 1.2)).toBe(0);
  });
});

describe("byRank", () => {
  it("breaks ties on chance, then on who posted first", () => {
    const posts = [
      { id: "c", score: 0.5, chance: 0.3, postedAt: "2026-10-23T10:00:00Z" },
      { id: "b", score: 0.5, chance: 0.4, postedAt: "2026-10-23T11:00:00Z" },
      { id: "a", score: 0.6, chance: 0.2, postedAt: "2026-10-23T12:00:00Z" },
      { id: "d", score: 0.5, chance: 0.3, postedAt: "2026-10-23T09:00:00Z" },
    ];
    expect(posts.sort(byRank).map((p) => p.id)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("gradeGame", () => {
  it("grades a same-game combo only when every part lands", () => {
    expect(gradeGame("combo:1x2:home+ou:over:2.5", 2, 1)).toBe("win");
    expect(gradeGame("combo:1x2:home+ou:over:2.5", 1, 0)).toBe("lose");
    expect(gradeGame("btts:yes", 1, 1)).toBe("win");
  });
});

describe("gradeCode", () => {
  const scores = new Map([
    ["m1", { home: 2, away: 0 }],
    ["m2", { home: 1, away: 1 }],
  ]);

  it("is lost as soon as one game loses, even with others still to play", () => {
    expect(gradeCode([{ matchId: "m1", market: "1x2:away" }, { matchId: "m9", market: "1x2:home" }], scores)).toBe("lost");
  });

  it("waits while a game is still to play", () => {
    expect(gradeCode([{ matchId: "m1", market: "1x2:home" }, { matchId: "m9", market: "1x2:home" }], scores)).toBeNull();
  });

  it("is won when every game is in and none lost", () => {
    expect(gradeCode([{ matchId: "m1", market: "1x2:home" }, { matchId: "m2", market: "btts:yes" }], scores)).toBe("won");
  });

  it("is void when every game pushed", () => {
    expect(gradeCode([{ matchId: "m2", market: "ah:home:0" }], scores)).toBe("void");
  });
});

it("counts a poster's record", () => {
  expect(recordOf(["won", "lost", "won", "void", null])).toEqual({ landed: 2, missed: 1 });
});
