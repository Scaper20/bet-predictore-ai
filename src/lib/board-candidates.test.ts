import { describe, expect, it } from "vitest";
import { bookLeg, keepOnBoard, onBoard, type BoardOptions } from "./board-candidates";
import type { Candidate } from "@/lib/forge";

const board = [
  { market_id: "1", specifier: null, outcomes: [{ id: "1" }, { id: "2" }, { id: "3" }] },
  { market_id: "10", specifier: null, outcomes: [{ id: "9" }, { id: "10" }, { id: "11" }] },
  { market_id: "18", specifier: "total=2.5", outcomes: [{ id: "12" }, { id: "13" }] },
  { market_id: "166", specifier: "total=9.5", outcomes: [{ id: "12" }, { id: "13" }] },
  { market_id: "166", specifier: "total=10.5", outcomes: [{ id: "12" }, { id: "13" }] },
  { market_id: "547", specifier: "total=2.5", outcomes: [{ id: "1724" }, { id: "1727" }] },
];

const pick = (market: string, probability: number, label = market): Candidate => ({
  market,
  label,
  probability,
  fairOdds: Math.round((1 / probability) * 100) / 100,
  picks: [{ market, label }],
});

const chances: Record<string, number> = { "corners:under:10.5": 0.71, "corners:under:9.5": 0.6 };
const opts: BoardOptions = {
  home: "Arsenal",
  away: "Chelsea",
  price: (m) => chances[m] ?? null,
  floor: (c) => c.probability - 0.05,
};

describe("onBoard", () => {
  it("keeps a listed pick untouched", () => {
    const c = pick("1x2:home", 0.55);
    expect(onBoard(c, board, opts)).toBe(c);
  });

  it("swaps an unlisted line for its twin at the same chance, relabelled", () => {
    const out = onBoard(pick("ah:home:0.5", 0.74, "Arsenal +0.5"), board, opts);
    expect(out).toMatchObject({ market: "dc:home-draw", probability: 0.74, fairOdds: 1.35 });
    expect(out?.label).toContain("Arsenal");
    expect(out?.picks).toEqual([{ market: "dc:home-draw", label: out?.label }]);
  });

  it("re-lines to the nearest listed line that clears the floor, re-priced", () => {
    const out = onBoard(pick("corners:under:11.5", 0.74), board, opts);
    expect(out).toMatchObject({ market: "corners:under:10.5", probability: 0.71, fairOdds: 1.41 });
    // 10.5 is under the floor here, and 9.5 further still: nothing fits.
    expect(onBoard(pick("corners:under:11.5", 0.8), board, opts)).toBeNull();
  });

  it("drops what SportyBet can't carry on this game", () => {
    expect(onBoard(pick("btts:yes", 0.6), board, opts)).toBeNull();
    expect(onBoard(pick("cs:1-0", 0.1), board, opts)).toBeNull();
  });

  it("keeps a same-game combo only when SportyBet lists it on this game", () => {
    expect(onBoard(pick("combo:dc:home-draw+ou:over:2.5", 0.4), board, opts)).not.toBeNull();
    expect(onBoard(pick("combo:dc:home-draw+btts:yes", 0.4), board, opts)).toBeNull();
  });
});

describe("keepOnBoard", () => {
  it("does not offer the same selection twice when two picks land on one twin", () => {
    const out = keepOnBoard([pick("1x2:home", 0.55), pick("ah:home:-0.5", 0.55), pick("dc:home-draw", 0.74)], board, opts);
    expect(out.map((c) => c.market)).toEqual(["1x2:home", "dc:home-draw"]);
  });
});

describe("bookLeg", () => {
  it("books a listed leg as it is", () => {
    expect(bookLeg("1x2:away", { markets: board })).toEqual({ ok: true, market: "1x2:away", twin: false });
  });

  it("books a pulled line as its same-chance twin, never another line", () => {
    expect(bookLeg("ah:away:0.5", { markets: board })).toEqual({ ok: true, market: "dc:away-draw", twin: true });
    expect(bookLeg("corners:under:11.5", { markets: board })).toEqual({ ok: false, reason: "not-offered" });
  });

  it("says why a leg can't go on", () => {
    expect(bookLeg("1x2:home", null)).toEqual({ ok: false, reason: "not-listed" });
    expect(bookLeg("cs:2-1", { markets: board })).toEqual({ ok: false, reason: "unmapped" });
    // An old board without markets can't say: a mapped leg goes on.
    expect(bookLeg("1x2:home", { markets: [] })).toEqual({ ok: true, market: "1x2:home", twin: false });
    expect(bookLeg("cs:2-1", { markets: [] })).toEqual({ ok: false, reason: "unmapped" });
  });
});
