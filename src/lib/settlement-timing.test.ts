import { describe, expect, it } from "vitest";
import { settleStep } from "./settlement-timing";

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
