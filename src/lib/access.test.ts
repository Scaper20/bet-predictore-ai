import { describe, expect, it } from "vitest";
import { isFreeMarket, pickVisible, toolView, viewPrediction, type Viewer } from "./access";
import type { Pick, Prediction } from "@/lib/model/predict";

const pick = (market: string, confidence: number): Pick => ({
  market, label: "X", group: market.startsWith("1x2") ? "Match Result" : "Goals", probability: 0.7, fairOdds: 1.43, confidence,
});
const free: Viewer = { paid: false, freeStrongId: "m-strong", freeIds: ["m-strong", "m-hot"] };
const paid: Viewer = { paid: true, freeStrongId: null, freeIds: [] };

describe("free-tier access", () => {
  it("opens only the 1X2 market", () => {
    expect(isFreeMarket("1x2:home")).toBe(true);
    expect(isFreeMarket("ou:over:2.5")).toBe(false);
    expect(isFreeMarket("dc:homeOrDraw")).toBe(false);
  });

  it("shows free viewers 1X2 picks and only the chosen Strong pick", () => {
    expect(pickVisible(pick("1x2:home", 50), "m1", free)).toBe(true);
    expect(pickVisible(pick("ou:under:3.5", 50), "m1", free)).toBe(false);
    expect(pickVisible(pick("1x2:home", 70), "m1", free)).toBe(false);
    expect(pickVisible(pick("ou:under:3.5", 70), "m-strong", free)).toBe(true);
    expect(pickVisible(pick("ou:under:3.5", 70), "m1", paid)).toBe(true);
  });

  it("opens any market on today's free picks", () => {
    expect(pickVisible(pick("ou:over:2.5", 55), "m-hot", free)).toBe(true);
    expect(pickVisible(pick("btts:yes", 55), "m-other", free)).toBe(false);
  });

  it("opens every pick and market on the site, holding back only the Pro extras", () => {
    const p = {
      match: { id: "m1" },
      markets: { home: 0.5, draw: 0.3, away: 0.2, over: { "2.5": 0.55 }, halves: { ht: {} } },
      asianHandicap: [{}],
      picks: [pick("1x2:home", 50), pick("ou:over:2.5", 55)],
      topPick: pick("ou:over:2.5", 70),
    } as unknown as Prediction;
    const v = viewPrediction(p, free);
    expect(v.locked).toEqual({ pick: false, markets: false });
    expect(v.topPick?.market).toBe("ou:over:2.5");
    expect(v.markets.over).toEqual({ "2.5": 0.55 });
    expect(v.markets.halves).toBeUndefined();
    expect(v.asianHandicap).toEqual([]);
    expect(viewPrediction(p, paid).markets.halves).toBeDefined();
  });

  it("Ask KiqStat's tool view strips locked numbers before they leave the server", () => {
    const p = {
      match: { id: "m1" },
      markets: { home: 0.5, draw: 0.3, away: 0.2, bttsYes: 0.6, bttsNo: 0.4, over: { "2.5": 0.55 }, under: { "2.5": 0.45 },
        doubleChance: { homeOrDraw: 0.8, awayOrDraw: 0.5, homeOrAway: 0.7 }, cleanSheet: { home: 0.3, away: 0.2 },
        correctScore: [{ home: 1, away: 0, probability: 0.1 }], expectedGoals: { home: 1.5, away: 1, total: 2.5 } },
      asianHandicap: [{}],
      picks: [pick("1x2:home", 50), pick("ou:over:2.5", 55)],
      topPick: pick("ou:over:2.5", 55),
    } as unknown as Prediction;
    const v = toolView(p, free);
    expect(v.locked).toEqual({ pick: true, markets: true });
    expect(v.topPick).toMatchObject({ market: "locked", label: "", probability: 0 });
    expect(v.markets.over).toEqual({});
    expect(v.markets.halves).toBeUndefined();
    expect(v.markets.home).toBe(0.5);
    expect(v.picks.map((x) => x.market)).toEqual(["1x2:home"]);
    expect(v.asianHandicap).toEqual([]);
    expect(toolView(p, paid).topPick?.market).toBe("ou:over:2.5");
  });
});
