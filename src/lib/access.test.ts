import { describe, expect, it } from "vitest";
import { isFreeMarket, pickVisible, proLeagueLocked, toolView, viewPrediction, type Viewer } from "./access";
import type { Pick, Prediction } from "@/lib/model/predict";

const pick = (market: string, confidence: number): Pick => ({
  market, label: "X", group: market.startsWith("1x2") ? "Match Result" : "Goals", probability: 0.7, fairOdds: 1.43, confidence,
});
const free: Viewer = { paid: false, freeStrongId: "m-strong", freeIds: ["m-strong", "m-hot"] };
const paid: Viewer = { paid: true, freeStrongId: null, freeIds: [] };

describe("free-tier access", () => {
  it("opens only the 1X2 market", () => {
    expect(isFreeMarket("1x2:home")).toBe(true);
    expect(isFreeMarket("ou:over:2.5")).toBe(false);
    expect(isFreeMarket("dc:homeOrDraw")).toBe(false);
  });

  it("shows free viewers 1X2 picks and only the chosen Strong pick", () => {
    expect(pickVisible(pick("1x2:home", 50), "m1", free, "la-liga")).toBe(true);
    expect(pickVisible(pick("ou:under:3.5", 50), "m1", free, "la-liga")).toBe(false);
    expect(pickVisible(pick("1x2:home", 70), "m1", free, "la-liga")).toBe(false);
    expect(pickVisible(pick("ou:under:3.5", 70), "m-strong", free, "la-liga")).toBe(true);
    expect(pickVisible(pick("ou:under:3.5", 70), "m1", paid, "la-liga")).toBe(true);
    // Outside the tested divisions no pick is Strong, so a 1X2 pick stays free.
    expect(pickVisible(pick("1x2:home", 70), "m1", free, "mls")).toBe(true);
  });

  it("opens any market on today's free picks", () => {
    expect(pickVisible(pick("ou:over:2.5", 55), "m-hot", free, "la-liga")).toBe(true);
    expect(pickVisible(pick("btts:yes", 55), "m-other", free, "la-liga")).toBe(false);
  });

  it("opens every pick and market on the site, holding back only the Pro extras", () => {
    const p = {
      match: { id: "m1", league: { code: "la-liga" } },
      markets: { home: 0.5, draw: 0.3, away: 0.2, over: { "2.5": 0.55 }, halves: { ht: {} } },
      asianHandicap: [{}],
      picks: [pick("1x2:home", 50), pick("ou:over:2.5", 55)],
      topPick: pick("ou:over:2.5", 70),
    } as unknown as Prediction;
    const v = viewPrediction(p, free);
    expect(v.locked).toEqual({ pick: false, markets: false });
    expect(v.topPick?.market).toBe("ou:over:2.5");
    expect(v.markets.over).toEqual({ "2.5": 0.55 });
    expect(v.markets.halves).toBeUndefined();
    expect(v.asianHandicap).toEqual([]);
    expect(viewPrediction(p, paid).markets.halves).toBeDefined();
  });

  it("Ask KiqStat's tool view strips locked numbers before they leave the server", () => {
    const p = {
      match: { id: "m1", league: { code: "la-liga" } },
      markets: { home: 0.5, draw: 0.3, away: 0.2, bttsYes: 0.6, bttsNo: 0.4, over: { "2.5": 0.55 }, under: { "2.5": 0.45 },
        doubleChance: { homeOrDraw: 0.8, awayOrDraw: 0.5, homeOrAway: 0.7 }, cleanSheet: { home: 0.3, away: 0.2 },
        correctScore: [{ home: 1, away: 0, probability: 0.1 }], expectedGoals: { home: 1.5, away: 1, total: 2.5 } },
      asianHandicap: [{}],
      picks: [pick("1x2:home", 50), pick("ou:over:2.5", 55)],
      topPick: pick("ou:over:2.5", 55),
    } as unknown as Prediction;
    const v = toolView(p, free);
    expect(v.locked).toEqual({ pick: true, markets: true });
    expect(v.topPick).toMatchObject({ market: "locked", label: "", probability: 0 });
    expect(v.markets.over).toEqual({});
    expect(v.markets.halves).toBeUndefined();
    expect(v.markets.home).toBe(0.5);
    expect(v.picks.map((x) => x.market)).toEqual(["1x2:home"]);
    expect(v.asianHandicap).toEqual([]);
    expect(toolView(p, paid).topPick?.market).toBe("ou:over:2.5");
  });
});

describe("Pro leagues", () => {
  const NOW = Date.parse("2026-10-18T12:00:00Z");
  const game = (id: string, code: string, kickoff = "2026-10-18T18:45:00Z") =>
    ({
      match: { id, kickoff, league: { code, name: code } },
      markets: { home: 0.34, draw: 0.3, away: 0.36, over: { "2.5": 0.55 }, bttsYes: 0.5, halves: { ht: {} } },
      asianHandicap: [{}],
      picks: [pick("1x2:away", 50), pick("ou:under:3.5", 70)],
      topPick: pick("ou:under:3.5", 70),
    }) as unknown as Prediction;

  it("locks a Pro-league match for free viewers before kick-off", () => {
    const v = viewPrediction(game("m1", "serie-a"), free, NOW);
    expect(v.locked).toEqual({ pick: true, markets: true, proLeague: true });
    expect(v.topPick?.market).toBe("locked");
    expect(v.topPick?.label).toBe("");
    expect(v.picks).toEqual([]);
    expect(v.markets.over).toEqual({});
    expect(v.markets.bttsYes).toBe(0);
    expect(v.markets.home).toBe(0.34);
  });

  it("opens it at kick-off, for paid viewers, and on today's free picks", () => {
    expect(viewPrediction(game("m1", "serie-a", "2026-10-18T11:00:00Z"), free, NOW).locked.pick).toBe(false);
    expect(viewPrediction(game("m1", "serie-a"), paid, NOW).locked.pick).toBe(false);
    expect(viewPrediction(game("m-hot", "serie-a"), free, NOW).locked.pick).toBe(false);
  });

  it("leaves free leagues and national teams alone", () => {
    expect(viewPrediction(game("m1", "premier-league"), free, NOW).locked).toEqual({ pick: false, markets: false });
    expect(proLeagueLocked(game("m1", "afcon").match, free, NOW)).toBe(false);
  });

  it("gives Ask KiqStat only the split on a locked Pro-league match", () => {
    const v = toolView(game("m1", "champions-league"), free, NOW);
    expect(v.picks).toEqual([]);
    expect(v.locked.proLeague).toBe(true);
  });
});

describe("More predictions", () => {
  const NOW = Date.parse("2026-10-18T12:00:00Z");
  const g = (group: string, market: string) => ({ group, market, label: market, family: "x", probability: 0.77, calibrated: 0.77, score: 0.77, marketChance: 0.77, price: 1.25, loadPrice: 1.25 });
  const game = (code: string) =>
    ({
      match: { id: "m1", kickoff: "2026-10-18T18:45:00Z", league: { code, name: code } },
      markets: { home: 0.34, draw: 0.3, away: 0.36, over: {}, halves: {} },
      asianHandicap: [],
      picks: [pick("1x2:away", 50)],
      topPick: pick("1x2:away", 50),
      engine: {
        headline: g("team-goals", "tg:home:over:0.5"),
        groups: [g("corners", "corners:home:under:5.5"), g("team-goals", "tg:home:over:0.5"), g("goals", "ou:over:1.5")],
      },
    }) as unknown as Prediction;

  it("gives a free viewer the strongest group's pick and names the rest, never the engine's headline", () => {
    const v = viewPrediction(game("premier-league"), free, NOW);
    expect(v.engine?.groups.map((x) => x.market)).toEqual(["corners:home:under:5.5"]);
    expect(v.lockedGroups).toEqual(["team-goals", "goals"]);
    expect(v.engine?.headline).toBeNull();
    expect(JSON.stringify(v)).not.toContain("tg:home:over:0.5");
  });

  it("gives Pro every group, and a locked Pro-league game none", () => {
    expect(viewPrediction(game("premier-league"), paid, NOW).engine?.groups).toHaveLength(3);
    const locked = viewPrediction(game("serie-a"), free, NOW);
    expect(locked.engine?.groups).toEqual([]);
    expect(locked.lockedGroups).toEqual(["corners", "team-goals", "goals"]);
    expect(toolView(game("premier-league"), free, NOW).engine?.groups).toEqual([]);
  });
});
