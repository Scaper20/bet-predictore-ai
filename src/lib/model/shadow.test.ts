import { describe, expect, it } from "vitest";
import { newMarketShadow, shadowPicks } from "./shadow";

const pick = (market: string, probability: number) =>
  ({ market, label: market, group: "Goals" as const, probability, fairOdds: 1 / probability, confidence: 60 });
const match = (code: string) => ({ league: { code } }) as never;

describe("shadowPicks", () => {
  it("logs GG or NG, whichever the model leans to", () => {
    const yes = shadowPicks({ match: match("mls"), asianHandicap: [], picks: [pick("btts:yes", 0.58), pick("btts:no", 0.42)] });
    expect(yes).toEqual([{ market: "btts:yes", label: "GG (both teams score)", probability: 0.58, reason: "btts" }]);
    const no = shadowPicks({ match: match("mls"), asianHandicap: [], picks: [pick("btts:yes", 0.4), pick("btts:no", 0.6)] });
    expect(no[0].market).toBe("btts:no");
  });

  it("logs the paused handicap the sweet spot would have picked", () => {
    const out = shadowPicks({
      match: match("serie-a"),
      asianHandicap: [],
      picks: [pick("ah:away:1.5", 0.8), pick("btts:yes", 0.5), pick("btts:no", 0.5)],
    });
    expect(out.map((s) => [s.market, s.reason])).toEqual([
      ["ah:away:1.5", "paused-handicap"],
      ["btts:yes", "btts"],
    ]);
  });

  it("logs no handicap outside the tested divisions", () => {
    const out = shadowPicks({ match: match("mls"), asianHandicap: [], picks: [pick("ah:away:1.5", 0.8)] });
    expect(out).toEqual([]);
  });
});

describe("newMarketShadow", () => {
  const p = (home: number, away: number) => ({ markets: { expectedGoals: { home, away } }, model: { rho: -0.05 } }) as Parameters<typeof newMarketShadow>[0];

  it("logs the new goal markets the model has at 60% or more, as new-market", () => {
    const out = newMarketShadow(p(1.6, 1.2));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.reason === "new-market" && s.probability >= 0.6 && s.market.startsWith("raw:"))).toBe(true);
    expect(out.map((s) => s.label)).toContain("2nd half over 0.5");
  });

  it("logs fewer of the goal-hungry ones on a tight game", () => {
    const tight = newMarketShadow(p(0.8, 0.6)).map((s) => s.label);
    expect(tight).not.toContain("Both halves over 0.5");
    expect(tight).toContain("Goal bounds 0-3");
  });
});
