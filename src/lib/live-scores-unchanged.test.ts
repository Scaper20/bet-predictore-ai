import { describe, expect, it } from "vitest";
import { unchanged, type StoredScore } from "../../supabase/functions/live-scores/unchanged";

const stored: StoredScore = { status: "live", minute: 67, home_goals: 1, away_goals: 0, score_source: "thesportsdb" };

describe("unchanged", () => {
  it("is true for a game the feed re-sends as it was", () => {
    expect(unchanged(stored, { ...stored })).toBe(true);
  });

  it("is true for a finished game and for half time, where there is no minute", () => {
    const finished: StoredScore = { ...stored, status: "finished", minute: null };
    expect(unchanged(finished, { ...finished })).toBe(true);
    const half: StoredScore = { ...stored, status: "halftime", minute: null };
    expect(unchanged(half, { ...half })).toBe(true);
  });

  it("is false once the minute moves", () => {
    expect(unchanged(stored, { ...stored, minute: 68 })).toBe(false);
  });

  it("is false when either score changes", () => {
    expect(unchanged(stored, { ...stored, home_goals: 2 })).toBe(false);
    expect(unchanged(stored, { ...stored, away_goals: 1 })).toBe(false);
  });

  it("is false when the game ends", () => {
    expect(unchanged(stored, { ...stored, status: "finished", minute: null })).toBe(false);
  });

  it("is false when another feed last wrote the score, so the feed still takes ownership", () => {
    expect(unchanged({ ...stored, score_source: "football-data-org" }, { ...stored })).toBe(false);
    expect(unchanged({ ...stored, score_source: null }, { ...stored })).toBe(false);
  });

  it("does not treat a missing score as a zero", () => {
    expect(unchanged({ ...stored, home_goals: null }, { ...stored, home_goals: 0 })).toBe(false);
    expect(unchanged({ ...stored, home_goals: 0 }, { ...stored, home_goals: null })).toBe(false);
  });
});
