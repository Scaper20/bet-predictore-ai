import { describe, expect, it } from "vitest";
import { holdPublished, type LoggedPick } from "./published-hold";
import type { Pick, Prediction } from "@/lib/model/predict";

const pick = (market: string, group: Pick["group"], probability: number): Pick => ({
  market,
  label: market,
  group,
  probability,
  fairOdds: 1 / probability,
  confidence: probability * 80,
});

const over15 = pick("ou:over:1.5", "Goals", 0.78);
const homeAway = pick("dc:home-away", "Double Chance", 0.74);

const prediction = (topPick: Pick | null, picks: Pick[]): Prediction =>
  ({ match: { id: "m1" }, topPick, picks, sweetSpot: true, marketCheck: { setAside: homeAway, marketChance: 0.6 } }) as unknown as Prediction;

const logged = (market: string, extra: Partial<LoggedPick> = {}): LoggedPick => ({
  match_id: "m1",
  market,
  label: "Over 1.5 Goals",
  probability: 0.8,
  fair_odds: 1.25,
  confidence: 64,
  ...extra,
});

describe("holdPublished", () => {
  it("leaves a game with nothing on the record as the live read made it", () => {
    const p = prediction(homeAway, [homeAway, over15]);
    expect(holdPublished(p, undefined)).toBe(p);
  });

  it("leaves the read alone when it still heads with the logged market", () => {
    const p = prediction(over15, [over15, homeAway]);
    expect(holdPublished(p, logged("ou:over:1.5"))).toBe(p);
  });

  it("puts the logged pick back at the head when the live read has moved", () => {
    const held = holdPublished(prediction(homeAway, [homeAway, over15]), logged("ou:over:1.5"));
    expect(held.topPick).toEqual({
      market: "ou:over:1.5",
      label: "Over 1.5 Goals",
      group: "Goals",
      probability: 0.8,
      fairOdds: 1.25,
      confidence: 64,
    });
    expect(held.picks.map((p) => p.market)).toEqual(["ou:over:1.5", "dc:home-away"]);
    expect(held.sweetSpot).toBe(false);
    expect(held.marketCheck).toBeUndefined();
  });

  it("holds a logged pick the live read no longer lists, or has no headline at all", () => {
    const held = holdPublished(prediction(null, [homeAway]), logged("sot:away:under:5.5", { label: "Away under 5.5 shots on target" }));
    expect(held.topPick?.market).toBe("sot:away:under:5.5");
    expect(held.topPick?.group).toBe("Shots");
    expect(held.picks).toHaveLength(2);
  });

  it("reads numeric columns that arrive as strings, and fills a missing confidence", () => {
    const held = holdPublished(
      prediction(homeAway, [homeAway, over15]),
      logged("ou:over:1.5", { probability: "0.8" as unknown as number, confidence: null }),
    );
    expect(held.topPick?.probability).toBe(0.8);
    expect(held.topPick?.confidence).toBe(over15.confidence);
  });
});
