import { describe, expect, it } from "vitest";
import { boardPrices } from "./anchor-shadow";

const row = {
  "1|": { "1": [2.93, 0.33], "2": [3.81, 0.25], "3": [2.34, 0.42] },
  "18|total=2.5": { "12": [1.59, 0.61], "13": [2.45, 0.39] },
};

describe("boardPrices", () => {
  it("reads the 1X2 and over/under 2.5 odds", () => {
    expect(boardPrices(row)).toEqual({ oneXTwo: { home: 2.93, draw: 3.81, away: 2.34 }, overUnder: { over: 1.59, under: 2.45 } });
  });
  it("is null when a market is missing or a price is not real", () => {
    expect(boardPrices({ "1|": row["1|"] })).toBeNull();
    expect(boardPrices({ ...row, "1|": { ...row["1|"], "2": [1, 0] } })).toBeNull();
    expect(boardPrices(null)).toBeNull();
  });
});
