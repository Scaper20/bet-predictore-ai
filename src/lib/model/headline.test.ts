import { describe, expect, it } from "vitest";
import { buildPrediction, HEADLINE_MAX_PROBABILITY, TOTALS_SHRINK } from "./predict";
import { isStatMarket, pausedHandicapCandidates, SWEET_SPOT_FILLERS, SWEET_SPOT_MAX, SWEET_SPOTS, sweetSpotLabel, sweetSpotPick } from "./sweet-spots";
import { isPausedHandicap } from "./paused";
import { STAT_LINES, statGrid, statMarkets, statSelections, type StatKind } from "./match-stats";
import { statKindOf } from "../settlement";
import { expectedRates, fitLeague } from "./fit";
import type { Match, ResultRow } from "@/lib/types";

const DAY = 86_400_000;
const NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

/** Four double round-robins (224 matches, over the publishing bar); strength runs down the list. */
function season(): ResultRow[] {
  const rows: ResultRow[] = [];
  let d = Date.now() - 400 * DAY;
  for (let rep = 0; rep < 4; rep++) {
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = 0; j < NAMES.length; j++) {
        if (i === j) continue;
        d += DAY;
        const gap = j - i;
        const hg = Math.max(0, 1 + Math.round(gap / 2) + ((i + rep) % 2));
        const ag = Math.max(0, 1 - Math.round(gap / 3) + ((j + rep) % 2));
        rows.push({ homeId: NAMES[i], awayId: NAMES[j], homeName: NAMES[i], awayName: NAMES[j], homeGoals: hg, awayGoals: ag, date: d, leagueId: "t" });
      }
    }
  }
  return rows;
}

function fixture(home: string, away: string): Match {
  return {
    id: `t:${home}-${away}`, kickoff: new Date().toISOString(), status: "scheduled",
    league: { id: "t", name: "Test" },
    home: { id: home, name: home, shortName: home }, away: { id: away, name: away, shortName: away },
    score: { home: null, away: null }, source: "thesportsdb",
  };
}

describe("headline pick", () => {
  const rows = season();

  it("is never shorter than the cap, and only from markets that held up in the backtest", () => {
    for (const [h, a] of [["Alpha", "Hotel"], ["Hotel", "Alpha"], ["Delta", "Echo"], ["Bravo", "Golf"]]) {
      const pick = buildPrediction(fixture(h, a), rows).topPick;
      expect(pick).not.toBeNull();
      expect(pick!.probability).toBeLessThanOrEqual(HEADLINE_MAX_PROBABILITY);
      expect(pick!.market).toMatch(/^(1x2|dc):|^ou:(over|under):(1\.5|2\.5|3\.5)$/);
    }
  });

  it("takes a sweet spot as the pick in a tested division, the usual ranking elsewhere", () => {
    const tested = (h: string, a: string) => {
      const m = fixture(h, a);
      return buildPrediction({ ...m, league: { id: "t", name: "Premier League", code: "premier-league" } }, rows);
    };
    const strong = tested("Alpha", "Charlie");
    const rule = SWEET_SPOTS.find((r) => r.market === strong.topPick!.market);
    expect(rule).toBeDefined();
    expect(strong.topPick!.probability).toBeGreaterThanOrEqual(rule!.min);
    expect(strong.topPick!.probability).toBeLessThanOrEqual(SWEET_SPOT_MAX);
    expect(strong.picks[0]).toBe(strong.topPick);
    // The same game in an untested competition keeps the usual headline.
    const usual = buildPrediction(fixture("Alpha", "Charlie"), rows).topPick!;
    expect(usual.probability).toBeLessThanOrEqual(HEADLINE_MAX_PROBABILITY);
    expect(buildPrediction({ ...fixture("Alpha", "Charlie"), league: { id: "t", name: "Premier League", code: "premier-league" } }, rows, [], { sweetSpots: false }).topPick!.market).toBe(usual.market);
    // A game no rule covers keeps the usual pick even in a tested division.
    expect(tested("Alpha", "Hotel").topPick!.market).toBe(buildPrediction(fixture("Alpha", "Hotel"), rows).topPick!.market);
  });

  it("still lists every market below the headline", () => {
    const p = buildPrediction(fixture("Alpha", "Hotel"), rows);
    expect(p.picks.some((x) => x.market === "btts:yes")).toBe(true);
    expect(p.picks.some((x) => x.market === "ou:over:0.5")).toBe(true);
  });
});

describe("sweet spots", () => {
  const pick = (market: string, probability: number) => ({ market, label: market, group: "Double Chance" as const, probability, fairOdds: 1 / probability, confidence: 70 });

  it("picks the applying rule with the strongest record, inside the price band", () => {
    const picks = [pick("dc:home-draw", 0.8), pick("ah:away:1.5", 0.78), pick("dc:home-away", 0.9), pick("ou:over:1.5", 0.83)];
    // Home or away is the strongest rule but at 90% it is too short; home or draw is next.
    expect(sweetSpotPick(picks, "serie-a")!.market).toBe("dc:home-draw");
  });

  it("reads a whole handicap line as win against loss, and logs it while it is paused", () => {
    // Away +1: the home side wins by two or more 15%, by exactly one 17% (a refund), otherwise away covers.
    const ah = [{ line: -1, home: 0.15, away: 0.68, push: 0.17 }];
    expect(sweetSpotPick([pick("dc:home-draw", 0.6)], "serie-a", [], ah)).toBeNull();
    const [shadow] = pausedHandicapCandidates([pick("dc:home-draw", 0.6)], "serie-a", ah);
    expect(shadow.market).toBe("ah:away:1");
    expect(shadow.probability).toBeCloseTo(0.68 / 0.83, 6);
    expect(shadow.label).toBe("Away +1 handicap");
  });

  it("never picks a handicap of a goal or more, but keeps draw no bet", () => {
    expect(sweetSpotPick([pick("ah:away:1.5", 0.8), pick("dc:home-draw", 0.6)], "serie-a")).toBeNull();
    const dnb = [{ line: 0, home: 0.15, away: 0.55, push: 0.3 }];
    expect(sweetSpotPick([pick("dc:home-draw", 0.6)], "serie-a", [], dnb)!.market).toBe("ah:away:0");
    expect(isPausedHandicap("ah:away:1.5")).toBe(true);
    expect(isPausedHandicap("ah:home:-1")).toBe(true);
    expect(isPausedHandicap("ah:away:2")).toBe(true);
    expect(isPausedHandicap("ah:away:0.5")).toBe(false);
    expect(isPausedHandicap("ah:home:-0.5")).toBe(false);
    expect(isPausedHandicap("ah:away:0")).toBe(false);
  });

  it("lets Under 12.5 corners compete, and shots only fill a game nothing else covers", () => {
    const stats = { "corners:under:12.5": 0.83, "sot:home:over:3.5": 0.84 };
    expect(sweetSpotPick([pick("dc:home-draw", 0.8)], "serie-a", [], [], stats)!.market).toBe("corners:under:12.5");
    expect(sweetSpotPick([pick("dc:home-draw", 0.8)], "serie-a", [], [], { "sot:home:over:3.5": 0.84 })!.market).toBe("dc:home-draw");
    const filler = sweetSpotPick([pick("dc:home-draw", 0.6)], "serie-a", [], [], { "sot:home:over:3.5": 0.84 })!;
    expect(filler.market).toBe("sot:home:over:3.5");
    expect(filler.group).toBe("Shots");
    expect(isStatMarket(filler.market)).toBe(true);
  });

  it("finds every stat rule's market among the count model's selections", () => {
    const chances: Record<string, number> = {};
    for (const kind of ["corners", "shots", "shotsOnTarget"] as StatKind[]) {
      const grid = statGrid({ home: 5, away: 4 }, { kTotal: 20, rho: 0 }, STAT_LINES[kind].max);
      Object.assign(chances, statSelections(kind, statMarkets(grid, STAT_LINES[kind])));
    }
    for (const rule of [...SWEET_SPOTS, ...SWEET_SPOT_FILLERS].filter((r) => isStatMarket(r.market))) {
      expect(chances[rule.market], rule.market).toBeGreaterThan(0);
      expect(statKindOf(rule.market), rule.market).not.toBeNull();
    }
  });

  it("names stat and handicap picks in plain words", () => {
    expect(sweetSpotLabel("corners:under:12.5")).toBe("Under 12.5 corners");
    expect(sweetSpotLabel("ah:home:0")).toBe("Home draw no bet");
    expect(sweetSpotLabel("sot:hcp:away:+3.5")).toBe("Away +3.5 shots on target handicap");
    expect(sweetSpotLabel("sot:most:home-or-level")).toBe("Home level or more shots on target");
    expect(sweetSpotLabel("shots:away:under:12.5")).toBe("Away under 12.5 shots");
  });

  it("applies only in the divisions it was tested on, and respects a barred market", () => {
    const picks = [pick("dc:home-draw", 0.8)];
    expect(sweetSpotPick(picks, "mls")).toBeNull();
    expect(sweetSpotPick(picks, undefined)).toBeNull();
    expect(sweetSpotPick(picks, "serie-a", ["dc:home-draw"])).toBeNull();
    expect(sweetSpotPick([pick("dc:home-draw", 0.7)], "serie-a")).toBeNull();
  });
});

describe("totals calibration", () => {
  it("pulls the projected total toward the league mean without changing who is favoured", () => {
    const rows = season();
    const fit = fitLeague(rows);
    const raw = expectedRates(fit, "Alpha", "Hotel");
    const p = buildPrediction(fixture("Alpha", "Hotel"), rows);
    const rawTotal = raw.lambda + raw.mu;
    const mean = 2 * fit.observedGoalRate;
    const total = p.markets.expectedGoals.total;

    expect(total).toBeCloseTo(mean + TOTALS_SHRINK * (rawTotal - mean), 6);
    // Same ratio, so the 1X2 lean is preserved.
    expect(p.markets.expectedGoals.home / p.markets.expectedGoals.away).toBeCloseTo(raw.lambda / raw.mu, 6);
  });
});
