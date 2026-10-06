import { describe, expect, it } from "vitest";
import { buildPrediction, HEADLINE_MAX_PROBABILITY, TOTALS_SHRINK } from "./predict";
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

  it("still lists every market below the headline", () => {
    const p = buildPrediction(fixture("Alpha", "Hotel"), rows);
    expect(p.picks.some((x) => x.market === "btts:yes")).toBe(true);
    expect(p.picks.some((x) => x.market === "ou:over:0.5")).toBe(true);
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
