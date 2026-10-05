import { describe, expect, it } from "vitest";
import type { Match, ProviderId } from "@/lib/types";
import { mergeMatches } from "./index";
import { RateGate } from "./http";

function match(source: ProviderId, over: Omit<Partial<Match>, "home" | "away"> & { home?: string; away?: string } = {}): Match {
  const { home = "Arsenal", away = "Chelsea", ...rest } = over;
  return {
    id: `${source === "football-data" ? "fd" : source === "thesportsdb" ? "sdb" : "af"}:${home}`,
    kickoff: "2026-10-05T15:00:00.000Z",
    status: "scheduled",
    minute: null,
    league: { id: "x", name: "Premier League" },
    home: { id: "1", name: home, shortName: home },
    away: { id: "2", name: away, shortName: away },
    score: { home: null, away: null },
    source,
    ...rest,
  };
}

describe("mergeMatches", () => {
  it("keeps football-data's identity but TheSportsDB's live score", () => {
    const fd = match("football-data", { home: "Arsenal FC", away: "Chelsea FC", round: "Matchday 7" });
    const sdb = match("thesportsdb", { status: "live", minute: 63, score: { home: 2, away: 1 } });
    const [m] = mergeMatches([[fd], [sdb]]);
    expect(m.id).toBe("fd:Arsenal FC");
    expect(m.round).toBe("Matchday 7");
    expect(m.status).toBe("live");
    expect(m.minute).toBe(63);
    expect(m.score).toEqual({ home: 2, away: 1 });
  });

  it("prefers the live feed even when the delayed feed already shows a score", () => {
    const fd = match("football-data", { status: "live", minute: 55, score: { home: 1, away: 1 } });
    const sdb = match("thesportsdb", { status: "live", minute: 61, score: { home: 2, away: 1 } });
    const [m] = mergeMatches([[fd], [sdb]]);
    expect(m.score).toEqual({ home: 2, away: 1 });
    expect(m.minute).toBe(61);
  });

  it("keeps football-data's final result once both feeds say finished", () => {
    const fd = match("football-data", { status: "finished", score: { home: 3, away: 1 } });
    const sdb = match("thesportsdb", { status: "finished", score: { home: 2, away: 1 } });
    const [m] = mergeMatches([[fd], [sdb]]);
    expect(m.score).toEqual({ home: 3, away: 1 });
  });

  it("takes a finished result over a delayed 'live'", () => {
    const fd = match("football-data", { status: "live", minute: 85, score: { home: 0, away: 0 } });
    const sdb = match("thesportsdb", { status: "finished", score: { home: 1, away: 0 } });
    const [m] = mergeMatches([[fd], [sdb]]);
    expect(m.status).toBe("finished");
    expect(m.score).toEqual({ home: 1, away: 0 });
    expect(m.minute).toBeNull();
  });

  it("matches clubs whose names differ by more than a suffix", () => {
    const fd = match("football-data", { home: "Brighton & Hove Albion FC", away: "Nottingham Forest FC" });
    const sdb = match("thesportsdb", { home: "Brighton", away: "Nottingham Forest", status: "halftime" });
    const merged = mergeMatches([[fd], [sdb]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("halftime");
  });

  it("does not merge different games on the same day", () => {
    const a = match("football-data", { home: "Arsenal FC", away: "Chelsea FC" });
    const b = match("thesportsdb", { home: "Everton", away: "Fulham" });
    expect(mergeMatches([[a], [b]])).toHaveLength(2);
  });

  it("lets a postponement from the identity feed stand", () => {
    const fd = match("football-data", { status: "postponed" });
    const sdb = match("thesportsdb", { status: "live", minute: 3, score: { home: 0, away: 0 } });
    expect(mergeMatches([[fd], [sdb]])[0].status).toBe("postponed");
  });
});

describe("RateGate", () => {
  it("hands out slots up to the budget, then refuses fast", async () => {
    const gate = new RateGate("test", 2, 0);
    await gate.take();
    await gate.take();
    await expect(gate.take()).rejects.toMatchObject({ status: 429 });
  });

  it("refuses while paused by upstream", async () => {
    const gate = new RateGate("test", 10, 0);
    gate.pause(30);
    await expect(gate.take()).rejects.toMatchObject({ status: 429 });
  });
});
