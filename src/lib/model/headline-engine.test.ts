import { describe, expect, it } from "vitest";
import { calibrate, calibrationKey, chooseHeadline, engineFamily, groupPicks, rankCandidates, type EngineCandidate } from "./headline-engine";

const c = (market: string, probability: number, marketChance: number | null = null, price: number | null = null): EngineCandidate => ({ market, probability, marketChance, price });

describe("engineFamily", () => {
  it("names the families with skill and leaves the rest out", () => {
    expect(engineFamily("1x2:home")).toBe("result");
    expect(engineFamily("1x2:draw")).toBeNull();
    expect(engineFamily("dc:home-away")).toBeNull();
    expect(engineFamily("btts:yes")).toBeNull();
    expect(engineFamily("ou:over:2.5")).toBe("goals-over");
    expect(engineFamily("ou:over:0.5")).toBeNull();
    expect(engineFamily("tg:home:over:0.5")).toBe("team-goals");
    expect(engineFamily("corners:home:over:4.5")).toBe("corners-team");
    expect(engineFamily("corners:over:10")).toBeNull(); // whole lines push
    expect(engineFamily("sot:most:away")).toBe("sot-most");
    expect(engineFamily("shots:hcp:home:+2.5")).toBeNull(); // SportyBet has no shots handicap
    expect(engineFamily("bookings:over:3.5")).toBeNull();
  });
});

describe("calibrate", () => {
  const table = { "corners:home:over": [[0.6, 0.55], [0.8, 0.74]] } as const;
  it("keys stat lines without their line, goals lines with it", () => {
    expect(calibrationKey("corners:home:over:4.5")).toBe("corners:home:over");
    expect(calibrationKey("tg:home:over:0.5")).toBe("tg:home:over:0.5");
  });
  it("interpolates between knots and runs parallel past the ends", () => {
    expect(calibrate("corners:home:over:4.5", 0.7, table)).toBeCloseTo(0.645, 6);
    expect(calibrate("corners:home:over:3.5", 0.82, table)).toBeCloseTo(0.76, 6);
    expect(calibrate("corners:home:over:6.5", 0.5, table)).toBeCloseTo(0.45, 6);
    expect(calibrate("dc:home-draw", 0.7, table)).toBe(0.7);
  });
});

describe("rankCandidates", () => {
  const none = {};
  it("takes the likeliest candidate that still pays the floor", () => {
    const pick = chooseHeadline(
      [c("ou:over:1.5", 0.86, null, 1.1), c("tg:home:over:0.5", 0.77, null, 1.24), c("1x2:home", 0.6, null, 1.6)],
      { onBoard: true, calibration: none },
    );
    expect(pick?.market).toBe("tg:home:over:0.5");
    expect(pick?.loadPrice).toBe(1.24);
  });

  it("on the board, needs the line listed; off it, prices from fair odds less the margin", () => {
    expect(chooseHeadline([c("corners:home:over:3.5", 0.77)], { onBoard: true, calibration: none })).toBeNull();
    const off = chooseHeadline([c("corners:home:over:3.5", 0.77)], { onBoard: false, calibration: none });
    expect(off?.loadPrice).toBeCloseTo(1 / (0.77 * 1.07), 6);
  });

  it("drops a line SportyBet rates 3+ points under the model, and ranks on the lower view", () => {
    expect(rankCandidates([c("dc:home-draw", 0.78, 0.74, 1.27)], { onBoard: true, calibration: none })).toEqual([]);
    const [a, b] = rankCandidates([c("dc:home-draw", 0.78, 0.76, 1.24), c("tg:away:over:0.5", 0.77, 0.77, 1.22)], { onBoard: true, calibration: none });
    expect(a.market).toBe("tg:away:over:0.5");
    expect(b.score).toBeCloseTo(0.76, 6);
  });

  it("never picks a paused selection", () => {
    expect(chooseHeadline([c("ou:under:3.5", 0.77, null, 1.24), c("ah:away:+1.5", 0.78, null, 1.22)], { onBoard: true, calibration: none })).toBeNull();
  });

  it("gives the best pick per group", () => {
    const picks = groupPicks(
      [c("corners:home:over:3.5", 0.7, 0.7, 1.35), c("corners:most:home", 0.76, 0.76, 1.24), c("corners:away:under:5.5", 0.75, 0.75, 1.25), c("tg:home:over:0.5", 0.72, 0.72, 1.3)],
      { onBoard: true, calibration: none },
    );
    expect(picks.map((p) => p.market)).toEqual(["corners:most:home", "tg:home:over:0.5"]);
  });
});
