import { describe, expect, it } from "vitest";
import { freeIds, freeSlot, hotness, selectFreePicks } from "./free-picks";
import type { Prediction } from "@/lib/model/predict";

function pred(id: string, opts: { league?: string; market?: string; confidence?: number; strength?: number; publishable?: boolean } = {}): Prediction {
  const s = opts.strength ?? 0;
  const rating = { id, name: id, attack: s / 2, defence: s / 2, played: 10, goalsFor: 10, goalsAgainst: 10 };
  return {
    match: { id, league: { id: opts.league ?? "x", name: opts.league ?? "x", code: opts.league }, status: "scheduled" },
    league: null,
    markets: { home: 0.45, draw: 0.27, away: 0.28 },
    topPick: { market: opts.market ?? "ou:over:2.5", label: "Over 2.5", group: "Goals", probability: 0.6, fairOdds: 1.6, confidence: opts.confidence ?? 50 },
    ratings: { home: rating, away: rating },
    sufficiency: { publishable: opts.publishable ?? true },
  } as unknown as Prediction;
}

describe("free picks", () => {
  it("rates a big-league clash of strong sides hotter than a minor tie", () => {
    expect(hotness(pred("a", { league: "premier-league", strength: 0.6 }))).toBeGreaterThan(
      hotness(pred("b", { league: "championship", strength: -0.2 })),
    );
    expect(hotness(pred("c", { league: "championship" }), 20)).toBeGreaterThan(hotness(pred("c", { league: "championship" }), 0));
  });

  it("picks one Strong pick, two hot games and three more, all different", () => {
    const set = selectFreePicks("2026-10-07", [
      pred("strong1", { confidence: 72 }),
      pred("strong2", { confidence: 65 }),
      pred("epl", { league: "premier-league", strength: 0.6 }),
      pred("ucl", { league: "champions-league", strength: 0.5 }),
      pred("n1", { league: "eredivisie", confidence: 58 }),
      pred("n2", { league: "eredivisie", confidence: 57 }),
      pred("n3", { league: "eredivisie", confidence: 56 }),
      pred("n4", { league: "brasileirao", confidence: 55 }),
      pred("thin", { confidence: 59, publishable: false }),
    ]);
    expect(set.strong).toBe("strong1");
    expect(set.hot).toEqual(["epl", "ucl"]);
    // At most two from one competition.
    expect(set.normal).toEqual(["n1", "n2", "n4"]);
    expect(new Set(freeIds(set)).size).toBe(6);
    expect(freeSlot(set, "ucl")).toBe("hot");
    expect(freeSlot(set, "strong2")).toBeNull();
  });

  it("fills every slot from one league when that is all that is playing", () => {
    const set = selectFreePicks("d", ["a", "b", "c", "d", "e", "f"].map((id, i) => pred(id, { league: "brasileirao", confidence: 50 + i })));
    expect(set.hot.length + set.normal.length).toBe(5);
  });

  it("skips picks that are already free while there are enough others", () => {
    const set = selectFreePicks("d", [
      pred("x1", { market: "1x2:home", confidence: 59, league: "a" }),
      ...["p1", "p2", "p3", "p4", "p5"].map((id, i) => pred(id, { league: `l${i}` })),
    ]);
    expect(freeIds(set)).not.toContain("x1");
    expect(set.strong).toBeNull();
  });
});
