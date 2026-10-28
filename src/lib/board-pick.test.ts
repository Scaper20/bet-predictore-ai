import { describe, expect, it } from "vitest";
import { bestListedLine, listedOn, listedStatLines, type ListedLine } from "./board-pick";
import { boardChecked, PICK_MARKET_GAP } from "./market-check";
import type { Pick, Prediction } from "@/lib/model/predict";

/*
 * A board the way SportyBet lists stat lines: corners total at 9.5 only,
 * home corners at 3.5 and 4.5, and the main markets. No 12.5, no shots
 * handicap.
 */
const board = [
  { market_id: "1", specifier: null, outcomes: [{ id: "1", odds: "1.90" }, { id: "2", odds: "3.40" }, { id: "3", odds: "4.30" }] },
  { market_id: "10", specifier: null, outcomes: [{ id: "9", odds: "1.25" }, { id: "10", odds: "1.33" }, { id: "11", odds: "1.80" }] },
  { market_id: "18", specifier: "total=1.5", outcomes: [{ id: "12", odds: "1.30" }, { id: "13", odds: "3.40" }] },
  { market_id: "166", specifier: "total=9.5", outcomes: [{ id: "12", odds: "1.85" }, { id: "13", odds: "1.88" }] },
  { market_id: "900300", specifier: "total=3.5", outcomes: [{ id: "30", odds: "1.20" }, { id: "31", odds: "4.40" }] },
  { market_id: "900300", specifier: "total=4.5", outcomes: [{ id: "30", odds: "1.70" }, { id: "31", odds: "2.05" }] },
];

/** The model's chance for each stat line on the board. */
const MODEL: Record<string, number> = {
  "corners:over:9.5": 0.52,
  "corners:under:9.5": 0.48,
  "corners:home:over:3.5": 0.79,
  "corners:home:under:3.5": 0.21,
  "corners:home:over:4.5": 0.58,
  "corners:home:under:4.5": 0.42,
};
const priceStat = (m: string) => MODEL[m] ?? null;

describe("listedStatLines", () => {
  it("lists only the stat outcomes SportyBet carries, with both views and the price", () => {
    const lines = listedStatLines(board, priceStat);
    expect(lines.map((l) => l.market).sort()).toEqual(Object.keys(MODEL).sort());
    const home35 = lines.find((l) => l.market === "corners:home:over:3.5")!;
    expect(home35.price).toBe(1.2);
    expect(home35.marketChance).toBeCloseTo(1 / 1.2 / (1 / 1.2 + 1 / 4.4), 4);
    expect(home35.label).toBe("Home over 3.5 corners");
  });

  it("is empty without a board", () => {
    expect(listedStatLines(undefined, priceStat)).toEqual([]);
    expect(listedStatLines([], priceStat)).toEqual([]);
  });
});

describe("bestListedLine", () => {
  const line = (market: string, probability: number, marketChance: number | null, price = 1.3): ListedLine => ({ market, label: market, probability, marketChance, price });

  it("takes the strongest line on the lower of the two views", () => {
    const best = bestListedLine(
      [line("a", 0.8, 0.73), line("b", 0.76, 0.76), line("c", 0.74, 0.79)],
      { gap: PICK_MARKET_GAP, floor: 0.72 },
    );
    expect(best?.market).toBe("b");
  });

  it("respects the floor, the cap and the shortest price", () => {
    expect(bestListedLine([line("low", 0.7, 0.7)], { gap: 0.05, floor: 0.72 })).toBeNull();
    expect(bestListedLine([line("sure", 0.9, 0.9)], { gap: 0.05, floor: 0.72 })).toBeNull();
    expect(bestListedLine([line("short", 0.8, 0.8, 1.12)], { gap: 0.05, floor: 0.72 })).toBeNull();
  });

  it("skips a line SportyBet rates well below the model, or can't de-margin", () => {
    expect(bestListedLine([line("dissent", 0.8, 0.74)], { gap: 0.05, floor: 0.72 })).toBeNull();
    expect(bestListedLine([line("unpriced", 0.8, null)], { gap: 0.05, floor: 0.72 })).toBeNull();
  });
});

describe("listedOn", () => {
  it("finds a listed line or its same-bet twin", () => {
    expect(listedOn("corners:over:9.5", board)).toBe(true);
    expect(listedOn("dc:home-draw", board)).toBe(true);
    expect(listedOn("ah:home:0.5", board)).toBe(true); // Home +0.5 is Home or Draw
  });
  it("misses a line SportyBet doesn't carry", () => {
    expect(listedOn("corners:under:12.5", board)).toBe(false);
    expect(listedOn("sot:hcp:away:+3.5", board)).toBe(false);
    expect(listedOn("corners:over:9.5", undefined)).toBe(false);
  });
});

describe("boardChecked", () => {
  const pick = (market: string, probability: number): Pick => ({
    market, label: market, group: "Match Result", probability, fairOdds: Math.round((1 / probability) * 100) / 100, confidence: 55,
  });
  const prediction = (picks: Pick[]): Prediction =>
    ({ match: { id: "m1" }, picks, topPick: picks[0], sweetSpot: true, sufficiency: { publishable: true }, model: { dataQuality: 80, uncertainty: 0.9 } }) as unknown as Prediction;
  const lines = listedStatLines(board, priceStat);

  it("swaps an unlisted corners line for the strongest listed one", () => {
    const out = boardChecked(prediction([pick("corners:under:12.5", 0.84), pick("dc:home-draw", 0.76)]), board, lines);
    expect(out.topPick?.market).toBe("corners:home:over:3.5");
    expect(out.topPick?.group).toBe("Corners");
    expect(out.marketCheck).toMatchObject({ setAside: { market: "corners:under:12.5" }, reason: "unlisted" });
    expect(out.picks[0].market).toBe("corners:home:over:3.5");
  });

  it("falls back to a listed goals or result pick when no stat line is good enough", () => {
    const out = boardChecked(prediction([pick("sot:hcp:away:+3.5", 0.83), pick("ou:over:1.5", 0.74)]), board, []);
    expect(out.topPick?.market).toBe("ou:over:1.5");
    expect(out.sweetSpot).toBe(false);
  });

  it("runs the usual market check on a listed goals or result pick", () => {
    const p = prediction([pick("dc:home-draw", 0.76), pick("ou:over:1.5", 0.72)]);
    expect(boardChecked(p, board, lines)).toBe(p);
  });

  it("without a board, gives corners, shots and handicap picks to a goals or result pick", () => {
    const stat = boardChecked(prediction([pick("corners:under:12.5", 0.84), pick("dc:home-draw", 0.76)]), undefined);
    expect(stat.topPick?.market).toBe("dc:home-draw");
    const hcp = boardChecked(prediction([pick("ah:away:1.5", 0.8), pick("1x2:home", 0.7)]), []);
    expect(hcp.topPick?.market).toBe("1x2:home");
    const goals = prediction([pick("dc:home-draw", 0.76)]);
    expect(boardChecked(goals, undefined)).toBe(goals);
  });
});
