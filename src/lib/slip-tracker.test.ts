import { describe, expect, it } from "vitest";
import {
  combinedProbability,
  gradeMarket,
  legState,
  legsToPoll,
  settleLeg,
  slipSettled,
  slipSignature,
  slipStatus,
  type LegState,
  type TrackedLeg,
} from "./slip-tracker";

const NOW = Date.parse("2026-10-03T12:00:00Z");

function leg(over: Partial<TrackedLeg> = {}): TrackedLeg {
  return {
    matchId: "fd:1",
    fixture: "Home v Away",
    homeName: "Home",
    awayName: "Away",
    league: "League",
    kickoff: "2026-10-03T10:00:00Z",
    market: "1x2:home",
    label: "Home Win",
    probability: 0.5,
    fairOdds: 2,
    ...over,
  };
}

const won: LegState = { kind: "settled", result: { home: 1, away: 0, grade: "win" } };
const lost: LegState = { kind: "settled", result: { home: 0, away: 1, grade: "lose" } };
const voided: LegState = { kind: "settled", result: { home: 1, away: 1, grade: "void" } };
const pending: LegState = { kind: "pending" };
const live: LegState = { kind: "live", score: { status: "live", minute: 58, home: 1, away: 0 }, onTrack: true };

describe("gradeMarket", () => {
  it("grades the shared markets through the settlement grader", () => {
    expect(gradeMarket("dc:away-draw", 0, 1)).toBe("win");
    expect(gradeMarket("ou:under:3.5", 2, 2)).toBe("lose");
  });

  it("grades Asian handicap, including quarter lines", () => {
    expect(gradeMarket("ah:home:-0.5", 1, 0)).toBe("win");
    expect(gradeMarket("ah:home:-1", 1, 0)).toBe("push");
    expect(gradeMarket("ah:away:1.5", 2, 1)).toBe("win");
    // -0.75 = half on -0.5 (wins) and half on -1 (pushes) on a one-goal win
    expect(gradeMarket("ah:home:-0.75", 1, 0)).toBe("win");
    // +0.25 on a one-goal defeat: both halves (0 and +0.5) lose
    expect(gradeMarket("ah:home:0.25", 0, 1)).toBe("lose");
    // +0.25 on a draw: half pushes, half wins
    expect(gradeMarket("ah:home:0.25", 1, 1)).toBe("win");
  });

  it("returns null for markets it doesn't know", () => {
    expect(gradeMarket("mystery", 1, 0)).toBeNull();
  });
});

describe("settleLeg", () => {
  it("settles a finished match against the leg's market", () => {
    expect(settleLeg(leg(), { status: "finished", home: 2, away: 1 })).toEqual({ home: 2, away: 1, grade: "win" });
    expect(settleLeg(leg({ market: "ou:over:2" }), { status: "finished", home: 1, away: 1 })?.grade).toBe("void");
  });

  it("voids postponed and cancelled matches", () => {
    expect(settleLeg(leg(), { status: "postponed", home: null, away: null })).toMatchObject({
      grade: "void",
      abandoned: "postponed",
    });
  });

  it("leaves unfinished matches alone", () => {
    expect(settleLeg(leg(), { status: "live", home: 1, away: 0 })).toBeNull();
    expect(settleLeg(leg(), { status: "finished", home: null, away: null })).toBeNull();
  });
});

describe("legState", () => {
  it("is pending before kickoff and unknown after it without a score", () => {
    expect(legState(leg({ kickoff: "2026-10-03T15:00:00Z" }), undefined, undefined, NOW).kind).toBe("pending");
    expect(legState(leg(), undefined, undefined, NOW).kind).toBe("unknown");
  });

  it("reads whether a live leg is on track", () => {
    const state = legState(leg({ market: "ou:under:3.5" }), undefined, { status: "live", minute: 58, home: 1, away: 0 }, NOW);
    expect(state).toMatchObject({ kind: "live", onTrack: true });
    const behind = legState(leg(), undefined, { status: "halftime", home: 0, away: 1 }, NOW);
    expect(behind).toMatchObject({ kind: "live", onTrack: false });
  });

  it("prefers a stored result over anything the feed says", () => {
    const result = { home: 2, away: 0, grade: "win" as const };
    expect(legState(leg(), result, { status: "live", home: 0, away: 0 }, NOW)).toEqual({ kind: "settled", result });
  });
});

describe("slipStatus", () => {
  it("is lost as soon as one leg loses", () => {
    expect(slipStatus([won, lost, pending])).toBe("lost");
  });
  it("is won only once every leg is in, with voids dropping out", () => {
    expect(slipStatus([won, won, won])).toBe("won");
    expect(slipStatus([won, voided])).toBe("won");
    expect(slipStatus([voided, voided])).toBe("void");
  });
  it("is live while anything has started, pending before that", () => {
    expect(slipStatus([won, live, pending])).toBe("live");
    expect(slipStatus([won, pending])).toBe("live");
    expect(slipStatus([pending, pending])).toBe("pending");
  });
});

describe("helpers", () => {
  it("only polls legs that have kicked off and aren't settled", () => {
    const legs = [leg({ matchId: "fd:1" }), leg({ matchId: "fd:2" }), leg({ matchId: "fd:3", kickoff: "2026-10-04T10:00:00Z" })];
    const polled = legsToPoll(legs, { "fd:1": { home: 1, away: 0, grade: "win" } }, NOW);
    expect(polled.map((l) => l.matchId)).toEqual(["fd:2"]);
  });

  it("counts a slip as settled once a leg loses or every leg is in", () => {
    const legs = [leg({ matchId: "fd:1" }), leg({ matchId: "fd:2" })];
    expect(slipSettled(legs, {})).toBe(false);
    expect(slipSettled(legs, { "fd:1": { home: 1, away: 0, grade: "win" } })).toBe(false);
    expect(slipSettled(legs, { "fd:1": { home: 0, away: 1, grade: "lose" } })).toBe(true);
    expect(slipSettled(legs, { "fd:1": { home: 1, away: 0, grade: "win" }, "fd:2": { home: 1, away: 1, grade: "void" } })).toBe(true);
  });

  it("multiplies the legs into a combined chance", () => {
    expect(combinedProbability([leg({ probability: 0.78 }), leg({ probability: 0.746 }), leg({ probability: 0.77 })])).toBeCloseTo(0.448, 3);
  });

  it("signs a slip regardless of leg order", () => {
    expect(slipSignature([{ matchId: "a", market: "x" }, { matchId: "b", market: "y" }])).toBe(
      slipSignature([{ matchId: "b", market: "y" }, { matchId: "a", market: "x" }]),
    );
  });
});
