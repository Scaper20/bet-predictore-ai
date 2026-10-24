import { describe, expect, it } from "vitest";
import { checkPicks, marketGap, PICK_MARKET_GAP } from "./market-check";
import { fairChanceOn } from "@/lib/odds/market-prob";
import type { Pick, Prediction } from "@/lib/model/predict";

/** A board where SportyBet has the home side at about 50%, the draw 28%, the away side 22%. */
const board = [
  { market_id: "1", specifier: null, outcomes: [{ id: "1", odds: "1.90" }, { id: "2", odds: "3.40" }, { id: "3", odds: "4.30" }] },
  { market_id: "10", specifier: null, outcomes: [{ id: "9", odds: "1.25" }, { id: "10", odds: "1.33" }, { id: "11", odds: "1.80" }] },
  { market_id: "18", specifier: "total=1.5", outcomes: [{ id: "12", odds: "1.30" }, { id: "13", odds: "3.40" }] },
  { market_id: "16", specifier: "hcp=-1", outcomes: [{ id: "1714", odds: "2.60" }, { id: "1715", odds: "1.50" }] },
];

const pick = (market: string, probability: number): Pick => ({
  market,
  label: market,
  group: "Match Result",
  probability,
  fairOdds: Math.round((1 / probability) * 100) / 100,
  confidence: 55,
});

const prediction = (picks: Pick[]): Prediction =>
  ({ match: { id: "m1" }, picks, topPick: picks[0], sweetSpot: true, sufficiency: { publishable: true } }) as unknown as Prediction;

describe("fairChanceOn", () => {
  it("strips the margin across the market", () => {
    const home = fairChanceOn("1x2:home", board)!;
    const draw = fairChanceOn("1x2:draw", board)!;
    const away = fairChanceOn("1x2:away", board)!;
    expect(home + draw + away).toBeCloseTo(1, 6);
    expect(home).toBeCloseTo(0.5, 2);
  });

  it("reads double chance against a book that sums to two", () => {
    const hd = fairChanceOn("dc:home-draw", board)!;
    expect(hd).toBeGreaterThan(0.7);
    expect(hd + fairChanceOn("dc:away-draw", board)! + fairChanceOn("dc:home-away", board)!).toBeCloseTo(2, 6);
  });

  it("reads a half-goal handicap through its same-bet twin", () => {
    expect(fairChanceOn("ah:home:-0.5", board)).toBeCloseTo(fairChanceOn("1x2:home", board)!, 6);
  });

  it("won't compare a line that can refund, or one that isn't listed", () => {
    expect(fairChanceOn("ah:home:-1", board)).toBeNull();
    expect(fairChanceOn("ou:over:2.5", board)).toBeNull();
    expect(fairChanceOn("btts:yes", [])).toBeNull();
  });
});

describe("checkPicks", () => {
  it("keeps the pick when SportyBet broadly agrees", () => {
    const p = prediction([pick("dc:home-draw", 0.76), pick("ou:over:1.5", 0.72)]);
    expect(checkPicks(p, board)).toBe(p);
  });

  it("swaps a pick SportyBet rates well below us for the next one it doesn't", () => {
    // SportyBet: away or draw about 49%; the model says 60%.
    const p = prediction([pick("dc:away-draw", 0.6), pick("1x2:away", 0.4), pick("ou:over:1.5", 0.71)]);
    expect(marketGap("dc:away-draw", 0.6, board)!).toBeGreaterThan(PICK_MARKET_GAP);
    const out = checkPicks(p, board);
    expect(out.topPick?.market).toBe("ou:over:1.5");
    expect(out.picks[0].market).toBe("ou:over:1.5");
    expect(out.sweetSpot).toBe(false);
    expect(out.marketCheck?.setAside.market).toBe("dc:away-draw");
    expect(out.marketCheck?.marketChance).toBeCloseTo(0.6 - marketGap("dc:away-draw", 0.6, board)!, 3);
  });

  it("publishes nothing rather than a weak or barred swap", () => {
    const p = prediction([pick("dc:away-draw", 0.6), pick("ou:over:1.5", 0.71)]);
    expect(checkPicks(p, board, ["ou:over:1.5"]).topPick).toBeNull();
    const weak = prediction([pick("dc:away-draw", 0.6), pick("1x2:home", 0.55)]);
    const out = checkPicks(weak, board);
    expect(out.topPick).toBeNull();
    expect(out.marketCheck?.setAside.market).toBe("dc:away-draw");
  });

  it("keeps a pick the market still rates 60%+ when nothing else is as likely", () => {
    // SportyBet has home or draw at about 76%; the model 82%; over 1.5 at 71% is less likely still.
    const p = prediction([pick("dc:home-draw", 0.82), pick("ou:over:1.5", 0.71)]);
    expect(marketGap("dc:home-draw", 0.82, board)!).toBeGreaterThan(PICK_MARKET_GAP);
    expect(checkPicks(p, board)).toBe(p);
  });

  it("leaves the picks alone without a SportyBet listing", () => {
    const p = prediction([pick("dc:away-draw", 0.6)]);
    expect(checkPicks(p, undefined)).toBe(p);
    expect(checkPicks(p, [])).toBe(p);
  });
});
