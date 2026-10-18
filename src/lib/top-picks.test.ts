import { describe, expect, it } from "vitest";
import { buildTopPicks, liveState } from "./top-picks";
import type { FormEntry, Pick, Prediction } from "@/lib/model/predict";
import type { StatMarkets } from "@/lib/model/match-stats";

const pk = (market: string, probability: number, group: Pick["group"], label = market, confidence = probability * 80): Pick => ({
  market, label, group, probability, fairOdds: 1 / probability, confidence,
});
const games = (results: FormEntry["result"][], gf = 2, ga = 0): FormEntry[] =>
  results.map((result, i) => ({ opponent: "x", goalsFor: gf, goalsAgainst: ga, result, home: true, date: i }));

function pred(over: Partial<Prediction> & { picks: Pick[] }, status: "scheduled" | "finished" = "scheduled"): Prediction {
  return {
    match: { id: "m", home: { name: "Villarreal" }, away: { name: "Elche" }, status, score: status === "finished" ? { home: 2, away: 0 } : { home: null, away: null }, league: { code: "la-liga" } },
    markets: { home: 0.6, draw: 0.2, away: 0.2, expectedGoals: { home: 2.3, away: 1.2, total: 3.5 }, cleanSheet: { home: 0.3, away: 0.2 } },
    form: { home: { entries: games(["W", "W", "W", "W", "W"]) }, away: { entries: games(["L", "D", "L", "L", "D"], 0, 1) } },
    sufficiency: { publishable: true },
    topPick: over.picks[0],
    ...over,
  } as unknown as Prediction;
}

const picks = [
  pk("dc:home-draw", 0.84, "Double Chance", "Home or Draw", 70),
  pk("ou:over:1.5", 0.82, "Goals", "Over 1.5 Goals", 66),
  pk("ou:over:2.5", 0.58, "Goals", "Over 2.5 Goals", 50),
  pk("ou:over:0.5", 0.96, "Goals", "Over 0.5 Goals", 40),
  pk("1x2:home", 0.6, "Match Result", "Home Win", 50),
  pk("btts:yes", 0.7, "Both Teams To Score", "Both Teams To Score", 55),
  pk("dc:home-away", 0.8, "Double Chance", "Home or Away", 60),
];

describe("top picks", () => {
  it("leads with the headline pick and adds one pick per kind of market", () => {
    const t = buildTopPicks({ prediction: pred({ picks }) });
    expect(t.map((x) => x.market)).toEqual(["dc:home-draw", "ou:over:1.5", "btts:yes"]);
    expect(t[0].headline).toBe(true);
    expect(t[1].headline).toBe(false);
  });

  it("keeps Home or Away out of the extras unless it is the headline", () => {
    const t = buildTopPicks({ prediction: pred({ picks }) });
    expect(t.some((x) => x.market === "dc:home-away")).toBe(false);
    const own = buildTopPicks({ prediction: pred({ picks: [picks[6], ...picks.slice(0, 6)] }) });
    expect(own[0].market).toBe("dc:home-away");
  });

  it("gives a run from the recent games as the reason, and sibling lines", () => {
    const [first, second] = buildTopPicks({ prediction: pred({ picks }) });
    expect(first.reasons[0]).toBe("Villarreal on a 5-match winning run");
    expect(first.variations.map((v) => v.label)).toEqual(["Home Win", "Over 1.5 Goals"]);
    // Over 0.5 is too short to show beside Over 1.5; Over 2.5 sits at 58%.
    expect(second.variations.map((v) => v.label)).toEqual(["Over 2.5 Goals"]);
  });

  it("explains each pick in a sentence that names the numbers", () => {
    const [first, second] = buildTopPicks({ prediction: pred({ picks }) });
    expect(first.why).toBe("Villarreal are projected 2.3 goals to Elche's 1.2, so Villarreal avoid defeat in 84% of simulated games.");
    expect(second.why).toContain("3.5 goals are projected");
    expect(second.why).toContain("82%");
  });

  it("adds a corners pick and team-corner lines when the count model is available", () => {
    const corners = {
      expected: { home: 5.2, away: 5, total: 10.2 },
      over: { "7.5": 0.76, "9.5": 0.5 },
      homeOver: { "3.5": 0.73 },
      awayOver: { "3.5": 0.7 },
    } as unknown as StatMarkets;
    const onlyResult = [picks[0], pk("1x2:home", 0.5, "Match Result")];
    const t = buildTopPicks({ prediction: pred({ picks: onlyResult }), corners });
    const c = t.find((x) => x.market === "corners:over:7.5");
    expect(c?.label).toBe("Over 7.5 corners");
    expect(c?.variations.map((v) => v.label)).toEqual(["Villarreal over 3.5 corners", "Elche over 3.5 corners"]);
  });

  it("marks the result once the game is over", () => {
    const t = buildTopPicks({ prediction: pred({ picks }, "finished") });
    expect(t[0].outcome).toBe("win");
  });

  it("returns nothing for a locked or unpublishable pick", () => {
    expect(buildTopPicks({ prediction: pred({ picks, topPick: pk("locked", 0, "Goals") }) })).toEqual([]);
    expect(buildTopPicks({ prediction: pred({ picks, sufficiency: { publishable: false } as never }) })).toEqual([]);
  });

  it("settles goal lines as soon as the score decides them, and tracks the rest", () => {
    expect(liveState("ou:over:1.5", 1, 1)).toBe("won");
    expect(liveState("ou:under:2.5", 2, 1)).toBe("lost");
    expect(liveState("ou:over:2.5", 1, 0)).toBe("losing");
    expect(liveState("btts:yes", 1, 1)).toBe("won");
    expect(liveState("dc:home-draw", 0, 2)).toBe("losing");
    expect(liveState("dc:away-draw", 1, 1)).toBe("winning");
    expect(liveState("ah:home:0", 1, 1)).toBe("level");
  });

  it("never adds a paused under or a 4.5 line as an extra", () => {
    const withUnders = [picks[0], pk("ou:under:4.5", 0.85, "Goals", "Under 4.5 Goals", 75), pk("ou:under:3.5", 0.8, "Goals", "Under 3.5 Goals", 70), ...picks.slice(1)];
    const t = buildTopPicks({ prediction: pred({ picks: withUnders }) });
    expect(t.some((x) => x.market.startsWith("ou:under"))).toBe(false);
    expect(t[1].market).toBe("ou:over:1.5");
  });
});
