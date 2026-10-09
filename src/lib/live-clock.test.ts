import { describe, expect, it } from "vitest";
import { MAX_DRIFT_MINUTES, rebase, steadyMinute, tickedMinute } from "./live-clock";

const at = Date.parse("2026-10-09T01:00:00Z");
const later = (minutes: number, seconds = 0) => at + minutes * 60_000 + seconds * 1000;

describe("tickedMinute", () => {
  it("counts forward from when the minute was observed", () => {
    expect(tickedMinute(50, "live", at, at)).toBe(50);
    expect(tickedMinute(50, "live", at, later(0, 59))).toBe(50);
    expect(tickedMinute(50, "live", at, later(1))).toBe(50 + 1);
    expect(tickedMinute(50, "live", at, later(7, 30))).toBe(57);
  });

  it("stops at the end of the half it was observed in", () => {
    expect(tickedMinute(40, "live", at, later(9))).toBe(45);
    expect(tickedMinute(85, "live", at, later(9))).toBe(90);
  });

  it("holds the minute once the feed has been quiet too long", () => {
    expect(tickedMinute(50, "live", at, later(30))).toBe(50 + MAX_DRIFT_MINUTES);
  });

  it("does not project stoppage or extra time", () => {
    expect(tickedMinute(93, "live", at, later(3))).toBe(93);
    expect(tickedMinute(46, "live", at, later(3))).toBe(49);
  });

  it("leaves halftime, finished and unknown minutes alone", () => {
    expect(tickedMinute(45, "halftime", at, later(5))).toBe(45);
    expect(tickedMinute(90, "finished", at, later(5))).toBe(90);
    expect(tickedMinute(null, "live", at, later(5))).toBeNull();
    expect(tickedMinute(undefined, "live", at, later(5))).toBeNull();
  });

  it("never goes backwards on a clock running behind", () => {
    expect(tickedMinute(50, "live", at, at - 120_000)).toBe(50);
    expect(tickedMinute(50, "live", Number.NaN, later(5))).toBe(50);
  });
});

describe("steadyMinute", () => {
  it("holds a small dip so the clock never steps back", () => {
    expect(steadyMinute(58, 57)).toBe(58);
    expect(steadyMinute(58, 56)).toBe(58);
  });

  it("moves forward, and accepts a real correction from the feed", () => {
    expect(steadyMinute(58, 59)).toBe(59);
    expect(steadyMinute(58, 52)).toBe(52);
  });

  it("starts from the projection when there is nothing on screen", () => {
    expect(steadyMinute(null, 57)).toBe(57);
    expect(steadyMinute(57, null)).toBeNull();
  });
});

describe("rebase", () => {
  const first = { status: "live" as const, minute: 57, observedAt: at };

  it("keeps the first sighting while the feed repeats the same minute", () => {
    expect(rebase(first, { ...first, observedAt: later(1) }).observedAt).toBe(at);
  });

  it("restamps when the minute or the status moves", () => {
    expect(rebase(first, { ...first, minute: 58, observedAt: later(1) }).observedAt).toBe(later(1));
    expect(rebase(first, { ...first, status: "halftime", observedAt: later(1) }).observedAt).toBe(later(1));
    expect(rebase(null, first)).toEqual(first);
  });

  it("carries the reading's other fields through", () => {
    const next = { ...first, observedAt: later(1), home: 2, away: 0 };
    expect(rebase(first, next)).toEqual({ ...next, observedAt: at });
  });
});
