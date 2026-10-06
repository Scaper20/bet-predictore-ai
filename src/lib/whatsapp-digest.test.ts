import { describe, expect, it } from "vitest";
import {
  buildAccaTiers, digestEligible, digestPick, DIGEST_MIN_ODDS, formatPicksMessage, isYouthOrReserve,
} from "@/lib/whatsapp-digest";
import type { Prediction } from "@/lib/model/predict";
import type { PersonalizedPick } from "@/lib/for-you";

function pick(over: Partial<PersonalizedPick> = {}): PersonalizedPick {
  return {
    id: "m1",
    href: "/football/match/m1",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    league: { code: "premier-league", name: "English Premier League", shortName: "EPL" },
    kickoff: "2026-09-05T18:00:00.000Z",
    status: "scheduled",
    market: "1x2:home",
    group: "Match Result",
    label: "Home Win",
    probability: 0.6,
    fairOdds: 1 / 0.6,
    confidence: 70,
    matchesUsed: 120,
    dataQuality: 88,
    ...over,
  };
}

describe("buildAccaTiers", () => {
  it("returns nothing when fewer than two picks are available", () => {
    expect(buildAccaTiers([])).toEqual([]);
    expect(buildAccaTiers([pick({ id: "a" })])).toEqual([]);
  });

  it("builds tiers with increasing leg counts as the target odds climb", () => {
    // Six picks, each ~1.54x (0.65 probability) — safe should need 2 legs to
    // clear 2x, and each subsequent tier should need strictly more.
    const picks = Array.from({ length: 6 }, (_, i) =>
      pick({ id: `m${i}`, probability: 0.65, confidence: 90 - i }),
    );
    const tiers = buildAccaTiers(picks);

    expect(tiers.map((t) => t.tier)).toEqual(["safe", "balanced", "risky"]);
    const legCounts = tiers.map((t) => t.legs.length);
    expect(legCounts[0]).toBeLessThan(legCounts[1]);
    expect(legCounts[1]).toBeLessThan(legCounts[2]);
    for (const t of tiers) {
      expect(t.combinedFairOdds).toBeGreaterThanOrEqual(
        { safe: 2, balanced: 5, risky: 10 }[t.tier],
      );
    }
  });

  it("picks the highest-confidence legs first", () => {
    const picks = [
      pick({ id: "low", homeTeam: "Low", probability: 0.55, confidence: 40 }),
      pick({ id: "high", homeTeam: "High", probability: 0.55, confidence: 95 }),
      pick({ id: "mid", homeTeam: "Mid", probability: 0.55, confidence: 70 }),
    ];
    const [safe] = buildAccaTiers(picks);
    expect(safe.legs.length).toBeGreaterThanOrEqual(2);
    // The two highest-confidence picks (high, mid) must be the ones used,
    // regardless of their order in the input array.
    const usedTeams = safe.legs.map((l) => l.fixture.split(" vs ")[0]);
    expect(usedTeams).not.toContain("Low");
    expect(usedTeams).toEqual(expect.arrayContaining(["High", "Mid"]));
  });

  it("never repeats an identical combo under a different tier name", () => {
    // Only two picks at all, combined odds already past every threshold —
    // safe/balanced/risky would all resolve to the exact same 2-leg combo.
    const picks = [
      pick({ id: "a", probability: 0.3, confidence: 80 }),
      pick({ id: "b", probability: 0.3, confidence: 75 }),
    ];
    const tiers = buildAccaTiers(picks);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].tier).toBe("safe");
  });

  it("computes combined odds as the product of leg probabilities", () => {
    const picks = [
      pick({ id: "a", probability: 0.5, confidence: 90 }),
      pick({ id: "b", probability: 0.5, confidence: 80 }),
    ];
    const [safe] = buildAccaTiers(picks);
    // 0.5 * 0.5 = 0.25 -> fair odds 4.0
    expect(safe.combinedFairOdds).toBeCloseTo(4, 5);
  });

  it("omits a tier it cannot reach even using every available leg", () => {
    // Two picks at long odds already clear "risky" (10x) together, but there
    // are no more legs to build anything beyond that single combo with.
    const picks = [
      pick({ id: "a", probability: 0.25, confidence: 60 }),
      pick({ id: "b", probability: 0.3, confidence: 55 }),
    ];
    const tiers = buildAccaTiers(picks);
    // Combined: 1/(0.25*0.3) = 13.3x - clears every tier with the same 2 legs,
    // so only one tier (the first, "safe") should be reported.
    expect(tiers).toHaveLength(1);
  });
});

describe("digest selection", () => {
  const mk = (market: string, probability: number) => ({
    market, label: market, group: "Match Result" as const, probability, fairOdds: 1 / probability, confidence: 60,
  });
  const prediction = (over: { picks?: ReturnType<typeof mk>[]; league?: string; code?: string; matchesUsed?: number; publishable?: boolean } = {}) =>
    ({
      match: { league: { id: "x", name: over.league ?? "English Premier League", code: "code" in over ? over.code : "premier-league" } },
      picks: over.picks ?? [mk("dc:home-draw", 0.78), mk("1x2:home", 0.64), mk("btts:yes", 0.6)],
      sufficiency: { publishable: over.publishable ?? true },
      model: { matchesUsed: over.matchesUsed ?? 400 },
    }) as unknown as Prediction;

  it("skips selections shorter than the odds floor and takes the next one the rule allows", () => {
    const pick = digestPick(prediction());
    expect(pick?.market).toBe("1x2:home");
    expect(pick!.fairOdds).toBeGreaterThanOrEqual(DIGEST_MIN_ODDS);
  });

  it("never reaches for a market the headline rule excludes", () => {
    expect(digestPick(prediction({ picks: [mk("dc:home-draw", 0.8), mk("btts:yes", 0.6)] }))).toBeNull();
  });

  it("keeps youth and reserve football out of the community", () => {
    for (const name of ["UEFA European Under-21 Championship", "Premier League 2 U23", "Serie A Primavera", "Barcelona B Reserves"]) {
      expect(isYouthOrReserve(name)).toBe(true);
    }
    for (const name of ["English Premier League", "UEFA Nations League", "NPFL"]) expect(isYouthOrReserve(name)).toBe(false);
    expect(digestEligible(prediction({ league: "UEFA European Under-21 Championship", code: undefined }))).toBe(false);
  });

  it("asks uncatalogued competitions for real depth", () => {
    expect(digestEligible(prediction({ league: "American USL Championship", code: undefined, matchesUsed: 45 }))).toBe(false);
    expect(digestEligible(prediction({ league: "American USL Championship", code: undefined, matchesUsed: 240 }))).toBe(true);
  });

  it("quotes SportyBet's price when it has one, and never calls a pick value", () => {
    const msg = formatPicksMessage([pick({ bookPrice: 1.72 }), pick({ id: "m2", fairOdds: 1.55, bookPrice: null })]);
    expect(msg).toContain("@1.72 on SportyBet");
    expect(msg).toContain("@1.55 (est.)");
    expect(msg.toLowerCase()).not.toContain("value");
  });
});
