import { describe, expect, it } from "vitest";
import { summariseEngine, type EngineLogRow, type PublishedLogRow } from "./engine-record";

const e = (match_id: string, slot: string, market: string, result: EngineLogRow["result"], load_price = 1.25): EngineLogRow => ({
  match_id, slot, market, family: market.split(":")[0], calibrated: 0.77, load_price, result, logged_at: "2026-10-28T08:00:00Z",
});
const p = (match_id: string, market: string, result: PublishedLogRow["result"], price: number | null = 1.15): PublishedLogRow => ({
  match_id, market, probability: 0.8, price_at_publish: price, result,
});

describe("summariseEngine", () => {
  it("compares the two headlines on games both settled", () => {
    const r = summariseEngine(
      [e("a", "headline", "tg:home:over:0.5", "win"), e("b", "headline", "dc:home-draw", "lose"), e("c", "headline", "ou:over:1.5", null), e("a", "corners", "corners:home:under:5.5", "win")],
      [p("a", "ou:over:1.5", "win"), p("b", "dc:home-draw", "win", 1.3), p("c", "ou:over:1.5", null)],
      Date.parse("2026-11-04T09:00:00Z"),
    );
    expect(r.games).toBe(2);
    expect(r.engine).toMatchObject({ n: 2, landed: 0.5, price: 1.25, atFloor: 1 });
    expect(r.published).toMatchObject({ n: 2, landed: 1, atFloor: 0.5 });
    expect(r.same).toBe(0.5);
    expect(r.pending).toBe(1);
    expect(r.days).toBe(7);
    expect(r.groups).toEqual([{ group: "corners", graded: 1, landed: 1, stated: 0.77, pending: 0 }]);
  });
});
