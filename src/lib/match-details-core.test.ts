import { describe, expect, it } from "vitest";
import { lineupStatus, mapEvents, mapMatchDetails, mapShots, mapTeamStats, ratingBand, shortName } from "./match-details-core";

function p(over: Record<string, unknown>) {
  return { id: "p", name: "Player", side: "home", role: "starter", shirt: "1", x: 0.5, y: 0.1, rating: 7, minutes: 90, ...over };
}

const bundle = {
  details: {
    finished: true,
    lineupType: "standard",
    referee: "Michael Oliver",
    stadium: "Tottenham Hotspur Stadium",
    stadiumCity: "London",
    capacity: 62850,
    attendance: 61726,
    hasXg: true,
  },
  lineups: [
    { side: "home", formation: "4-2-3-1", coach: "Ange Postecoglou", rating: 6.5, avgAge: 24.8 },
    { side: "away", formation: "4-3-3", coach: "Mauricio Pochettino", rating: 7.1, avgAge: 25.2 },
  ],
  players: [
    ...Array.from({ length: 11 }, (_, i) => p({ id: `h${i}`, name: `Home Player ${i}`, shirt: String(i + 1), rating: 6 + i / 10 })),
    ...Array.from({ length: 11 }, (_, i) => p({ id: `a${i}`, name: `Away Player ${i}`, side: "away", shirt: String(i + 1), rating: 6.5 })),
    p({ id: "sub1", name: "Eric Dier", role: "sub", subIn: 34, shirt: "15", rating: 6.6 }),
    p({ id: "sub2", name: "Unused Sub", role: "sub", shirt: "40", rating: null, minutes: null }),
    p({ id: "x", name: "Nicolas Jackson", side: "away", role: "starter", lastName: "Jackson", rating: 9.1, goals: 3 }),
    { id: "bad", name: "", side: "home", role: "starter" },
  ],
  events: [
    { minute: 6, type: "Goal", side: "home", player: "Home Player 9", homeScore: 1, awayScore: 0 },
    { minute: 18, type: "Card", side: "home", player: "Home Player 3", card: "Yellow" },
    { minute: 55, type: "Card", side: "home", player: "Home Player 3", card: "YellowRed" },
    { minute: 34, type: "Substitution", side: "home", player: "Eric Dier", related: "Home Player 4" },
    { minute: 45, type: "AddedTime", detail: "12" },
    { minute: 50, type: "Comment" },
    { type: "Goal" },
  ],
  shots: [
    { side: "home", minute: 6, x: 94.5, y: 34, xg: 0.41, event: "Goal", onTarget: true, player: "Home Player 9" },
    { side: "away", minute: 20, x: 300, y: -5, xg: 0.05, event: "Miss", onTarget: false },
    { side: "nowhere", x: 1, y: 1 },
  ],
  teamStats: {
    home_xg: 0.89,
    stats: {
      all: {
        possession: [39, 61],
        expected_goals: [0.89, 4.12],
        total_shots: [8, 17],
        fouls: [12, 21],
        unknown_stat: [1, 2],
        corners: ["x", 3],
      },
    },
  },
};

describe("mapMatchDetails", () => {
  it("builds both lineups, a timeline, shots and team stats", () => {
    const d = mapMatchDetails(bundle, true)!;
    expect(d.finished).toBe(true);
    expect(d.lineupStatus).toBe("final");
    expect(d.referee).toBe("Michael Oliver");
    expect(d.home!.formation).toBe("4-2-3-1");
    expect(d.home!.starters).toHaveLength(11);
    expect(d.away!.starters).toHaveLength(12);
    expect(d.home!.subs.map((s) => s.name)).toEqual(["Eric Dier", "Unused Sub"]);
    // Invalid rows are dropped, not rendered.
    expect([...d.home!.starters, ...d.home!.subs].some((x) => x.id === "bad")).toBe(false);
  });

  it("counts each player's cards from the timeline", () => {
    const d = mapMatchDetails(bundle, true)!;
    const booked = d.home!.starters.find((x) => x.name === "Home Player 3")!;
    expect(booked.yellow).toBe(1);
    expect(booked.red).toBe(1);
  });

  it("names the best-rated player of a finished game", () => {
    const d = mapMatchDetails(bundle, true)!;
    expect(d.playerOfMatch?.name).toBe("Nicolas Jackson");
    expect(d.playerOfMatch?.short).toBe("Jackson");
  });

  it("returns null for anything that is not a bundle", () => {
    expect(mapMatchDetails(null)).toBeNull();
    expect(mapMatchDetails({})).toBeNull();
    expect(mapMatchDetails("oops")).toBeNull();
  });

  it("says when there is no lineup yet", () => {
    const d = mapMatchDetails({ details: { finished: false, lineupType: "unavailable" }, players: [], lineups: [] })!;
    expect(d.lineupStatus).toBe("none");
    expect(d.home).toBeNull();
  });

  it("keeps unavailable players separate", () => {
    const d = mapMatchDetails({
      details: { finished: false, lineupType: "lastStarting11" },
      players: [
        p({ id: "s", name: "Starter One" }),
        p({ id: "u", name: "Injured One", role: "unavailable", absence: "injury", expectedReturn: "Late November" }),
      ],
      lineups: [{ side: "home", formation: "4-4-2" }],
    })!;
    expect(d.lineupStatus).toBe("previous");
    expect(d.home!.unavailable[0].expectedReturn).toBe("Late November");
    expect(d.playerOfMatch).toBeNull();
  });
});

describe("pieces", () => {
  it("timeline skips unknown and broken events", () => {
    const ev = mapEvents(bundle.events);
    expect(ev.map((e) => e.type)).toEqual(["goal", "card", "card", "sub", "added-time"]);
    expect(ev[0].score).toEqual([1, 0]);
    expect(ev[2].card).toBe("second-yellow");
  });

  it("shots are scaled to 0-100 and clamped", () => {
    const s = mapShots(bundle.shots);
    expect(s).toHaveLength(2);
    expect(s[0].goal).toBe(true);
    expect(s[0].x).toBeCloseTo(90, 0);
    expect(s[0].y).toBeCloseTo(50, 0);
    expect(s[1].x).toBe(100);
    expect(s[1].y).toBe(0);
  });

  it("team stats keep known rows in order and skip bad values", () => {
    const rows = mapTeamStats(bundle.teamStats);
    expect(rows.map((r) => r.key)).toEqual(["possession", "expected_goals", "total_shots", "fouls"]);
    expect(rows.find((r) => r.key === "fouls")!.higherIsBetter).toBe(false);
    expect(mapTeamStats(null)).toEqual([]);
  });

  it("short names keep particles", () => {
    expect(shortName("Virgil van Dijk")).toBe("van Dijk");
    expect(shortName("Kevin De Bruyne")).toBe("De Bruyne");
    expect(shortName("Rodri")).toBe("Rodri");
    expect(shortName("Bukayo Saka", "Saka")).toBe("Saka");
  });

  it("lineup status and rating bands", () => {
    expect(lineupStatus("standard", false, false)).toBe("confirmed");
    expect(lineupStatus("standard", true, true)).toBe("final");
    expect(lineupStatus("lastStarting11", false, false)).toBe("previous");
    expect(lineupStatus("predicted", false, false)).toBe("predicted");
    expect(lineupStatus("unavailable", false, false)).toBe("none");
    expect(lineupStatus(null, false, false)).toBe("none");
    expect(ratingBand(8.2)).toBe("elite");
    expect(ratingBand(6.4)).toBe("ok");
    expect(ratingBand(null)).toBeNull();
  });
});
