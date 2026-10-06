import { describe, expect, it } from "vitest";
import { isStaleInPlay, settleStale } from "./match-status";

const now = Date.parse("2026-10-06T12:00:00Z");

describe("stale in-play matches", () => {
  it("treats a game still 'live' days after kickoff as finished", () => {
    const m = { status: "live" as const, kickoff: "2026-10-01T06:10:00Z", minute: 67 };
    expect(isStaleInPlay(m.status, m.kickoff, now)).toBe(true);
    expect(settleStale(m, now)).toMatchObject({ status: "finished", minute: null });
  });

  it("leaves a game in its second half alone", () => {
    const m = { status: "live" as const, kickoff: "2026-10-06T10:30:00Z", minute: 70 };
    expect(settleStale(m, now)).toBe(m);
  });

  it("never touches scheduled or finished games", () => {
    expect(isStaleInPlay("scheduled", "2026-10-01T06:10:00Z", now)).toBe(false);
    expect(isStaleInPlay("finished", "2026-10-01T06:10:00Z", now)).toBe(false);
  });
});
