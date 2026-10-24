import { describe, expect, it } from "vitest";
import { bookableOn, twinsOf } from "./bookable";
import { gradeLeg } from "@/lib/leg-pricing";

const board = [
  { market_id: "1", specifier: null, outcomes: [{ id: "1" }, { id: "2" }, { id: "3" }] },
  { market_id: "10", specifier: null, outcomes: [{ id: "9" }, { id: "10" }, { id: "11" }] },
  { market_id: "11", specifier: null, outcomes: [{ id: "4" }, { id: "5" }] },
  { market_id: "14", specifier: "hcp=0:1", outcomes: [{ id: "1711" }, { id: "1712" }, { id: "1713" }] },
  { market_id: "16", specifier: "hcp=-0.5", outcomes: [{ id: "1714" }, { id: "1715" }] },
  { market_id: "166", specifier: "total=9.5", outcomes: [{ id: "12" }, { id: "13" }] },
  { market_id: "166", specifier: "total=11.5", outcomes: [{ id: "12" }, { id: "13" }] },
  { market_id: "162", specifier: null, outcomes: [{ id: "1" }, { id: "2" }, { id: "3" }] },
  { market_id: "900318", specifier: null, outcomes: [{ id: "1" }, { id: "2" }, { id: "3" }] },
];

describe("twinsOf", () => {
  it("only pairs selections that win on exactly the same results", () => {
    const results = [];
    for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) results.push([h, a]);
    const markets = ["ah:home:-0.5", "ah:away:0.5", "ah:home:-1.5", "ah:away:-2.5", "1x2:away", "dc:home-draw", "eh:home:-1", "eh:away:2", "ah:home:0", "dnb:away"];
    for (const m of markets) {
      for (const t of twinsOf(m)) {
        for (const [h, a] of results) {
          expect(gradeLeg(t.market, h, a), `${m} vs ${t.market} at ${h}-${a}`).toBe(gradeLeg(m, h, a));
        }
      }
    }
  });

  it("pairs most-count with the -0.5 count handicap", () => {
    expect(twinsOf("sot:most:home").map((t) => t.market)).toContain("sot:hcp:home:-0.5");
    expect(twinsOf("corners:most:away-or-level").map((t) => t.market)).toContain("corners:hcp:away:+0.5");
    for (let h = 0; h <= 12; h++) for (let a = 0; a <= 12; a++) {
      expect(gradeLeg("corners:hcp:away:+0.5", h, a) === "win").toBe(gradeLeg("corners:most:away-or-level", h, a) === "win");
    }
  });
});

describe("bookableOn", () => {
  it("books the exact selection when it is listed", () => {
    expect(bookableOn("1x2:home", board)).toMatchObject({ kind: "exact", market: "1x2:home" });
    expect(bookableOn("corners:under:9.5", board)).toMatchObject({ kind: "exact" });
  });

  it("swaps to a twin when only the twin is listed", () => {
    expect(bookableOn("ah:away:0.5", board.filter((m) => m.market_id !== "16"))).toMatchObject({ kind: "twin", market: "dc:away-draw" });
    expect(bookableOn("ah:home:0", board)).toMatchObject({ kind: "twin", market: "dnb:home", selection: { marketId: "11", outcomeId: "4" } });
    expect(bookableOn("ah:home:-1.5", board)).toMatchObject({ kind: "twin", market: "eh:home:-1" });
    expect(bookableOn("sot:most:home-or-level", board)).toMatchObject({ kind: "none" });
    expect(bookableOn("corners:most:home", board)).toMatchObject({ kind: "exact" });
  });

  it("re-lines to the nearest listed line that still clears the floor", () => {
    const chances: Record<string, number> = { "corners:under:11.5": 0.74, "corners:under:9.5": 0.42 };
    const price = (m: string) => chances[m] ?? null;
    expect(bookableOn("corners:under:12.5", board, { price, floor: 0.7 })).toMatchObject({
      kind: "nearest", market: "corners:under:11.5", probability: 0.74,
    });
    expect(bookableOn("corners:under:12.5", board, { price, floor: 0.8 })).toMatchObject({ kind: "none", reason: "not-offered" });
    expect(bookableOn("corners:under:12.5", board)).toMatchObject({ kind: "none" });
  });

  it("says why when nothing fits", () => {
    expect(bookableOn("cs:2-1", board)).toMatchObject({ kind: "none", reason: "unmapped" });
    expect(bookableOn("1x2:home", [])).toMatchObject({ kind: "none", reason: "no-board" });
  });
});
