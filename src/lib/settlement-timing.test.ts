import { describe, expect, it } from "vitest";
import { settleStep, voidReason } from "./settlement-timing";

const H = 3_600_000;
const MIN = 60_000;

describe("settleStep", () => {
  it("grades any row whose final score is stored, however old: a rescheduled game", () => {
    expect(settleStep({ cachedFinished: true, ageMs: 12 * 24 * H, refetchesLeft: 0 }, { maxAgeHours: 8 })).toBe("grade");
  });
  it("does not look a game up before it can be over", () => {
    expect(settleStep({ cachedFinished: false, ageMs: 60 * MIN, refetchesLeft: 5 }, { refetchAfterMinutes: 95 })).toBe("skip");
    expect(settleStep({ cachedFinished: false, ageMs: 96 * MIN, refetchesLeft: 5 }, { refetchAfterMinutes: 95 })).toBe("refetch");
  });
  it("leaves old unfinished rows to the daily sweep when a window is set", () => {
    expect(settleStep({ cachedFinished: false, ageMs: 30 * H, refetchesLeft: 5 }, { maxAgeHours: 8 })).toBe("skip");
    expect(settleStep({ cachedFinished: false, ageMs: 30 * H, refetchesLeft: 5 }, {})).toBe("refetch");
  });
  it("rations look-ups", () => {
    expect(settleStep({ cachedFinished: false, ageMs: 120 * MIN, refetchesLeft: 0 }, { refetchAfterMinutes: 95 })).toBe("skip");
  });
});

describe("voidReason", () => {
  const kick = "2026-11-14T15:00:00Z";
  const at = (days: number) => Date.parse(kick) + days * 86_400_000;

  it("waits three days before voiding anything", () => {
    expect(voidReason(kick, { status: "postponed" }, at(2.9))).toBeNull();
    expect(voidReason(kick, { status: "postponed" }, at(3))).toBe("postponed");
  });

  it("voids a game moved to another day", () => {
    // Peterborough v Oxford, logged for 14 Nov, rearranged for 5 Dec.
    expect(voidReason(kick, { status: "scheduled", kickoff: "2026-12-05T15:00:00Z" }, at(9))).toBe("moved");
    // A kickoff moved by a few hours is the same game.
    expect(voidReason(kick, { status: "scheduled", kickoff: "2026-11-14T17:30:00Z" }, at(9))).toBeNull();
  });

  it("voids a pick with no sign of play after two weeks", () => {
    expect(voidReason(kick, undefined, at(13))).toBeNull();
    expect(voidReason(kick, undefined, at(14))).toBe("stale");
    expect(voidReason(kick, { status: "scheduled", kickoff: kick }, at(20))).toBe("stale");
  });

  it("never voids a game that was played", () => {
    for (const status of ["finished", "live", "halftime"]) expect(voidReason(kick, { status }, at(30))).toBeNull();
  });
});
