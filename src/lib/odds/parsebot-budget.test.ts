import { describe, expect, it } from "vitest";
import {
  ALLOWED_ENDPOINTS,
  boardDecision,
  boardTtlMs,
  capsFrom,
  DEFAULT_CAPS,
  liveEnabled,
  MAX_STALE_MS,
  nextKickoff,
} from "./parsebot-budget";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

describe("liveEnabled", () => {
  it("is off without the admin switch, even with a key", () => {
    expect(liveEnabled({ PARSEBOT_API_KEY: "k" }, false)).toBe(false);
    expect(liveEnabled({ PARSEBOT_API_KEY: "k", PARSEBOT_LIVE: "on" }, false)).toBe(false);
  });
  it("is off with the switch but no key", () => {
    expect(liveEnabled({}, true)).toBe(false);
    expect(liveEnabled({ PARSEBOT_API_KEY: "  " }, true)).toBe(false);
  });
  it("is on with the switch and a key", () => {
    expect(liveEnabled({ PARSEBOT_API_KEY: "k" }, true)).toBe(true);
  });
  it("stays off when the environment says off, whatever the switch", () => {
    expect(liveEnabled({ PARSEBOT_API_KEY: "k", PARSEBOT_LIVE: "off" }, true)).toBe(false);
  });
});

describe("capsFrom", () => {
  it("defaults to the 1,000-credit plan", () => {
    expect(capsFrom({})).toEqual(DEFAULT_CAPS);
  });
  it("reads whole numbers and ignores junk", () => {
    expect(capsFrom({ PARSEBOT_DAILY_CREDITS: "12", PARSEBOT_WINDOW_CREDITS: "500" })).toEqual({ daily: 12, window: 500 });
    expect(capsFrom({ PARSEBOT_DAILY_CREDITS: "-3", PARSEBOT_WINDOW_CREDITS: "lots" })).toEqual(DEFAULT_CAPS);
  });
});

describe("allow-list", () => {
  it("never includes the per-fixture odds endpoint", () => {
    expect(ALLOWED_ENDPOINTS).not.toContain("get_event_odds");
    expect(ALLOWED_ENDPOINTS).toEqual(["get_upcoming_events", "book_bet"]);
  });
});

describe("boardTtlMs", () => {
  it("tightens as kickoff approaches", () => {
    expect(boardTtlMs(NOW + 3 * HOUR, NOW)).toBe(2 * HOUR);
    expect(boardTtlMs(NOW + 24 * HOUR, NOW)).toBe(6 * HOUR);
    expect(boardTtlMs(NOW + 72 * HOUR, NOW)).toBe(24 * HOUR);
    expect(boardTtlMs(null, NOW)).toBe(24 * HOUR);
  });
});

describe("nextKickoff", () => {
  it("ignores games already started", () => {
    expect(nextKickoff([{ kickoff: NOW - HOUR }, { kickoff: NOW + 5 * HOUR }, { kickoff: NOW + 2 * HOUR }], NOW)).toBe(NOW + 2 * HOUR);
    expect(nextKickoff([{ kickoff: NOW - HOUR }], NOW)).toBeNull();
  });
});

describe("boardDecision", () => {
  const board = (ageH: number, kickoffInH: number) => ({
    fetchedAt: NOW - ageH * HOUR,
    events: [{ kickoff: NOW + kickoffInH * HOUR }],
  });

  it("uses a fresh board without calling", () => {
    expect(boardDecision(board(1, 3), true, NOW)).toBe("use");
    expect(boardDecision(board(5, 72), true, NOW)).toBe("use");
  });
  it("refreshes a stale board only when a call is allowed", () => {
    expect(boardDecision(board(3, 3), true, NOW)).toBe("refresh");
    expect(boardDecision(board(3, 3), false, NOW)).toBe("stale-ok");
  });
  it("drops a board too old to show", () => {
    expect(boardDecision(board(MAX_STALE_MS / HOUR + 1, 3), false, NOW)).toBe("none");
  });
  it("never calls when switched off and nothing is stored", () => {
    expect(boardDecision(null, false, NOW)).toBe("none");
    expect(boardDecision(null, true, NOW)).toBe("refresh");
  });
});
