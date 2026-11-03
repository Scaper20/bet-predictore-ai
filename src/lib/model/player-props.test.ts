import { describe, expect, it } from "vitest";
import {
  calibrate, expectedMinutes, logScore, opponentFactor, overProb, playerRate, project, propLadder,
  type ConcededGame, type PositionPriors, type PropGame, type PropParams,
} from "./player-props";
import { buildLadder, choosePick, hitFact, propRisk, PROP_CAP, PROP_FLOOR, PROP_MIN_PRICE } from "./prop-picks";
import type { PlayerLine } from "@/lib/odds/player-lines";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);

function game(daysAgo: number, over: Partial<PropGame> = {}): PropGame {
  return { t: NOW - daysAgo * DAY, min: 90, started: true, g: 0, a: 0, sh: 3, sot: 1, xg: 0.3, xa: 0.1, tk: 1, cl: 1, fc: 1, pa: 30, sv: 0, ...over };
}

const prior = { goals: 0.3, assists: 0.15, goalsAssists: 0.45, shots: 2, shotsOnTarget: 0.7, tackles: 1, fouls: 1, clearances: 1, passes: 30, saves: 3, xg: 0.3, xa: 0.15 };
const priors: PositionPriors = { 0: prior, 1: prior, 2: prior, 3: prior };
const params: PropParams = { halfLife: 180, k: 5, blend: 0, oppK: 30, size: { 0: Infinity, 1: 10, 2: 10, 3: 10 } };

describe("player rate", () => {
  it("shrinks a short history toward the position average", () => {
    const rate = playerRate([game(10, { sh: 6 })], "shots", NOW, prior, params);
    expect(rate).toBeGreaterThan(2);
    expect(rate).toBeLessThan(6);
    expect(playerRate([], "shots", NOW, prior, params)).toBeCloseTo(2, 6);
  });

  it("ignores games on or after now and tiny cameos", () => {
    const base = playerRate([game(10)], "shots", NOW, prior, params);
    expect(playerRate([game(10), game(-1, { sh: 20 }), game(5, { min: 5, sh: 20 })], "shots", NOW, prior, params)).toBeCloseTo(base, 9);
  });

  it("weights recent games more", () => {
    const recentHigh = playerRate([game(5, { sh: 6 }), game(400, { sh: 0 })], "shots", NOW, prior, params);
    const oldHigh = playerRate([game(5, { sh: 0 }), game(400, { sh: 6 })], "shots", NOW, prior, params);
    expect(recentHigh).toBeGreaterThan(oldHigh);
  });

  it("goals + assists is the sum", () => {
    const h = [game(5, { g: 1, a: 1 })];
    expect(playerRate(h, "goalsAssists", NOW, prior, params)).toBeCloseTo(
      playerRate(h, "goals", NOW, prior, params) + playerRate(h, "assists", NOW, prior, params), 9);
  });
});

describe("minutes and opponent", () => {
  it("expected minutes shrink toward 80", () => {
    expect(expectedMinutes([], NOW)).toBe(80);
    expect(expectedMinutes(Array.from({ length: 10 }, (_, i) => game(i + 1)), NOW)).toBeGreaterThan(85);
  });

  it("an opponent that concedes more raises the factor, clipped", () => {
    const leaky: ConcededGame[] = Array.from({ length: 10 }, (_, i) => ({ t: NOW - (i + 1) * DAY, min: 360, y: { ...zero(), shots: 16 } }));
    const f = opponentFactor(leaky, "shots", NOW, 2, params);
    expect(f).toBeGreaterThan(1.3);
    expect(f).toBeLessThanOrEqual(1.6);
    expect(opponentFactor(leaky, "shots", NOW, 2, { ...params, oppK: 0 })).toBe(1);
  });

  it("with each player's usual output, a club that only meets low-output teams is not marked down", () => {
    // Opponents record 4 shots per 90 against this club, the position average is 8 —
    // but those players usually record 4 anyway, so the club concedes as normal.
    const games: ConcededGame[] = Array.from({ length: 10 }, (_, i) => ({
      t: NOW - (i + 1) * DAY, min: 360, y: { ...zero(), shots: 16 }, e: { ...zero(), shots: 16 },
    }));
    expect(opponentFactor(games, "shots", NOW, 8, params)).toBeCloseTo(1, 6);
    const plain = games.map(({ e: _e, ...g }) => (void _e, g));
    expect(opponentFactor(plain, "shots", NOW, 8, params)).toBeLessThan(0.8);
    // and one that halves what players usually do is marked down
    const tight = games.map((g) => ({ ...g, y: { ...g.y, shots: 8 } }));
    expect(opponentFactor(tight, "shots", NOW, 8, params)).toBeLessThan(0.85);
  });
});

function zero() {
  return { goals: 0, assists: 0, goalsAssists: 0, shots: 0, shotsOnTarget: 0, tackles: 0, fouls: 0, clearances: 0, passes: 0, saves: 0 };
}

describe("projection and distribution", () => {
  it("keeps saves for keepers and the rest for outfielders", () => {
    const i = { history: [game(3)], conceded: [], now: NOW, priors, params };
    expect(project({ ...i, market: "saves", position: 3 })).toBeNull();
    expect(project({ ...i, market: "shots", position: 0 })).toBeNull();
    expect(project({ ...i, market: "shots", position: 3 })!.mean).toBeGreaterThan(0);
  });

  it("over probabilities fall as the line rises, and the ladder centres near 50/50", () => {
    expect(overProb(2, 10, 0.5)).toBeGreaterThan(overProb(2, 10, 1.5));
    expect(overProb(2, Infinity, -0.5)).toBe(1);
    const ladder = propLadder(2.2, 10, "shots", 3);
    expect(ladder.map((r) => r.line)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]); // centre 1.5; nothing below 0.5
    const passes = propLadder(38, 11, "passes", 3);
    expect(passes).toHaveLength(7);
    expect(passes[1].line - passes[0].line).toBe(5);
    const centre = passes[3];
    expect(Math.abs(centre.over - 0.5)).toBeLessThan(0.15);
  });

  it("scores and calibrates", () => {
    expect(logScore(1, Infinity, 0)).toBeCloseTo(-1, 9);
    expect(calibrate(0.8, 1)).toBeCloseTo(0.8, 9);
    expect(calibrate(0.8, 0.5)).toBeLessThan(0.8);
  });
});

describe("pick", () => {
  const line = (l: number, over: number | null, under: number | null): PlayerLine => ({
    platform: "sportybet", market: "shots", platformMarket: "776", specifier: "v", line: l, playerId: "1", playerName: "X", teamName: null,
    overOdds: over, underOdds: under, overOutcome: over ? `o${l}` : null, underOutcome: under ? `u${l}` : null,
  });
  const sel = (l: PlayerLine, side: "over" | "under") => (side === "over" ? l.overOutcome : l.underOutcome);

  it("picks only listed, priced lines inside the floor and cap", () => {
    const prob = (l: number) => overProb(3.2, 10, l);
    const pick = choosePick(prob, [line(0.5, 1.05, null), line(1.5, 1.3, 3.2), line(2.5, 2.0, 1.75)], sel);
    expect(pick).not.toBeNull();
    expect(pick!.probability).toBeGreaterThanOrEqual(PROP_FLOOR);
    expect(pick!.probability).toBeLessThanOrEqual(PROP_CAP);
    expect(pick!.price).toBeGreaterThanOrEqual(PROP_MIN_PRICE);
    expect(pick!.selection).toBe(pick!.side === "over" ? `o${pick!.line}` : `u${pick!.line}`);
  });

  it("returns nothing without lines, or when the bookmaker disagrees strongly", () => {
    expect(choosePick(() => 0.8, [], sel)).toBeNull();
    // model 80% over, book prices over at 3.0 vs under 1.35 (about 31% over): gap too wide
    expect(choosePick(() => 0.8, [line(1.5, 3.0, 1.35)], sel)).toBeNull();
  });

  it("ladder marks listed prices; risk bands; hit facts", () => {
    const ladder = buildLadder(2.4, 10, "shots", 1, [line(1.5, 1.4, 2.8)]);
    expect(ladder.find((r) => r.line === 1.5)?.overPrice).toBe(1.4);
    expect(ladder.find((r) => r.line === 2.5)?.overPrice).toBeNull();
    expect(propRisk(0.85)).toBe("low");
    expect(propRisk(0.75)).toBe("medium");
    expect(hitFact([0, 2, 3, 1], 1.5, "over")).toEqual({ hits: 2, of: 4 });
  });
});
