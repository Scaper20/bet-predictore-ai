import { describe, expect, it } from "vitest";
import { buildAcca, inFollowedLeagues, type PersonalizedPick } from "@/lib/for-you";

/**
 * These pin the two rules the previous implementation broke: the personalised
 * zone never widens past the user's followed competitions, and a suggested
 * accumulator is never padded with fixtures the user did not ask for.
 */

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

describe("inFollowedLeagues", () => {
  it("keeps only fixtures in the followed competitions", () => {
    const out = inFollowedLeagues(
      [
        pick({ id: "epl", league: { code: "premier-league", name: "EPL", shortName: "EPL" } }),
        pick({ id: "mls", league: { code: "mls", name: "Major League Soccer", shortName: "MLS" } }),
        pick({ id: "npfl", league: { code: "npfl", name: "NPFL", shortName: "NPFL" } }),
      ],
      new Set(["premier-league"]),
    );

    expect(out.map((p) => p.id)).toEqual(["epl"]);
  });

  it("returns empty rather than falling back to the open slate", () => {
    // The exact regression: an EPL follower with a quiet week used to be shown
    // the entire unfiltered feed under a "your leagues" heading.
    const slate = [
      pick({ id: "mls", league: { code: "mls", name: "MLS", shortName: "MLS" } }),
      pick({ id: "liga-mx", league: { code: "liga-mx", name: "Liga MX", shortName: "MX" } }),
    ];

    expect(inFollowedLeagues(slate, new Set(["premier-league"]))).toEqual([]);
  });

  it("drops fixtures from competitions outside the catalogue", () => {
    // The open feeds carry competitions with no code at all. Those can never
    // match a followed set, so they must not leak into the personalised zone.
    const out = inFollowedLeagues(
      [pick({ id: "uncatalogued", league: { code: null, name: "Some Cup", shortName: "Cup" } })],
      new Set(["premier-league"]),
    );

    expect(out).toEqual([]);
  });

  it("returns nothing when the followed set is empty", () => {
    expect(inFollowedLeagues([pick()], new Set())).toEqual([]);
  });

  it("keeps every fixture when all their leagues are followed", () => {
    const picks = [
      pick({ id: "a", league: { code: "npfl", name: "NPFL", shortName: "NPFL" } }),
      pick({ id: "b", league: { code: "premier-league", name: "EPL", shortName: "EPL" } }),
    ];

    expect(inFollowedLeagues(picks, new Set(["npfl", "premier-league"]))).toHaveLength(2);
  });
});

describe("buildAcca", () => {
  it("returns null rather than padding a one-leg slip", () => {
    expect(buildAcca([pick()])).toBeNull();
    expect(buildAcca([])).toBeNull();
  });

  it("takes the highest-confidence legs, capped at three", () => {
    const acca = buildAcca([
      pick({ id: "a", confidence: 55 }),
      pick({ id: "b", confidence: 91 }),
      pick({ id: "c", confidence: 72 }),
      pick({ id: "d", confidence: 84 }),
    ]);

    expect(acca?.legs.map((l) => l.matchId)).toEqual(["b", "d", "c"]);
  });

  it("multiplies the leg probabilities", () => {
    const acca = buildAcca([
      pick({ id: "a", probability: 0.5, confidence: 80 }),
      pick({ id: "b", probability: 0.4, confidence: 70 }),
    ]);

    expect(acca?.combinedProbability).toBeCloseTo(0.2);
  });

  it("quotes a fair price that is the reciprocal of the combined probability", () => {
    const acca = buildAcca([
      pick({ id: "a", probability: 0.5, confidence: 80 }),
      pick({ id: "b", probability: 0.5, confidence: 70 }),
    ]);

    // Break-even by construction: this is the price a book would have to offer
    // for the bet to be neutral, NOT a claim about any price on offer.
    expect(acca?.combinedFairOdds).toBeCloseTo(4);
    expect((acca?.combinedProbability ?? 0) * (acca?.combinedFairOdds ?? 0)).toBeCloseTo(1);
  });

  it("carries the real kickoff onto every leg", () => {
    // Legs used to reach the slip stamped with `Date.now() + 86400000`.
    const acca = buildAcca([
      pick({ id: "a", kickoff: "2026-09-05T18:00:00.000Z", confidence: 80 }),
      pick({ id: "b", kickoff: "2026-09-06T14:30:00.000Z", confidence: 70 }),
    ]);

    expect(acca?.legs.map((l) => l.kickoff)).toEqual([
      "2026-09-05T18:00:00.000Z",
      "2026-09-06T14:30:00.000Z",
    ]);
  });

  it("does not invent a bookmaker price on a leg", () => {
    const acca = buildAcca([pick({ id: "a", confidence: 80 }), pick({ id: "b", confidence: 70 })]);
    for (const leg of acca?.legs ?? []) {
      expect(Object.keys(leg)).not.toContain("bookmakerOdds");
      expect(Object.keys(leg)).not.toContain("odds");
    }
  });
});
