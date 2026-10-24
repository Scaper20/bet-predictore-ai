import { describe, expect, it } from "vitest";
import { bandOf, saferLines } from "./code-editor-policy";
import { fromRaw, rawMarket } from "@/lib/odds/markets";

const raw = (marketId: string, outcomeId: string, specifier?: string) => rawMarket({ marketId, outcomeId, ...(specifier ? { specifier } : {}) });
const read = (ms: string[]) => ms.map((m) => fromRaw(m) ?? m);

describe("bandOf", () => {
  it("uses the editor's bands", () => {
    expect([0.7, 0.6, 0.5, 0.4, 0.2].map(bandOf)).toEqual(["solid", "solid", "shaky", "risky", "outrageous"]);
  });
});

describe("saferLines", () => {
  it("lowers an over and raises an under", () => {
    expect(saferLines("ou:over:2.5")).toEqual(["ou:over:1.5", "ou:over:0.5"]);
    expect(saferLines("ou:under:1.5")).toEqual(["ou:under:2.5", "ou:under:3.5"]);
    expect(saferLines("tg:home:over:1.5")).toEqual(["tg:home:over:0.5"]);
    expect(saferLines("corners:home:over:5.5")).toEqual(["corners:home:over:4.5", "corners:home:over:3.5", "corners:home:over:2.5"]);
    expect(saferLines("corners:under:9.5")).toEqual(["corners:under:10.5", "corners:under:11.5", "corners:under:12.5"]);
  });

  it("gives a side more start on the handicap, and a result its double chance", () => {
    expect(saferLines("ah:home:-1.5")).toEqual(["ah:home:-1", "ah:home:-0.5", "ah:home:0"]);
    expect(saferLines("1x2:away")).toEqual(["dc:draw-away"]);
  });

  it("has a safer version of the wild picks users play", () => {
    // 2nd half over 1.5 -> over 0.5.
    expect(read(saferLines(raw("90", "12", "total=1.5")))).toEqual([{ marketId: "90", outcomeId: "12", specifier: "total=0.5" }]);
    // Both halves under 1.5 -> under 2.5 -> under 3.5.
    expect(saferLines(raw("59", "74", "total=1.5"))).toEqual(["ou:under:2.5", "ou:under:3.5"]);
    // Both halves over 1.5 -> both halves over 0.5 first.
    expect(read(saferLines(raw("58", "74", "total=1.5")))[0]).toEqual({ marketId: "900984", outcomeId: "74" });
    // Goal bounds 1-2 widens a goal at a time: 1-3, 0-2, then 0-3...
    expect(read(saferLines(raw("450001", "12"))).slice(0, 3)).toEqual([
      { marketId: "450001", outcomeId: "13" },
      { marketId: "450001", outcomeId: "2" },
      { marketId: "450001", outcomeId: "14" },
    ]);
    // 2UP -> 1UP -> double chance 1UP.
    expect(read(saferLines(raw("60100", "1")))).toEqual([{ marketId: "60200", outcomeId: "1" }, { marketId: "60110", outcomeId: "9" }]);
    // Multigoals 2-3 -> the ranges around it, narrowest first.
    expect(read(saferLines(raw("548", "1735")))[0]).toMatchObject({ marketId: "548" });
  });

  it("has nothing for a bet with no safer version of itself", () => {
    expect(saferLines("dc:home-draw")).toEqual([]);
    expect(saferLines("btts:yes")).toEqual([]);
  });
});
