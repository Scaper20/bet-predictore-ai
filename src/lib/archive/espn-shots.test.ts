import { describe, expect, it } from "vitest";
import { matchShots, nameWords } from "./espn-shots";

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
