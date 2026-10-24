import { describe, expect, it } from "vitest";
import event from "./__fixtures__/sportybet-event-markets.json";
import { gradeLegFull, priceLeg } from "@/lib/leg-pricing";
import { halfGrids } from "@/lib/model/halves";
import { scoreMatrix } from "@/lib/model/poisson";
import { rawMarket, type SportyBetSelection } from "./markets";
import { rawGrader } from "./raw-grades";
import { parseEventMarkets } from "./sportybet-api";

const markets = parseEventMarkets(event)!;
const raw = (marketId: string, outcomeId: string, specifier?: string) => rawMarket({ marketId, outcomeId, ...(specifier ? { specifier } : {}) });

/* A game close to Milan v Bologna as SportyBet priced it (59% / 23% / 18%). */
const ctx = { goals: scoreMatrix(1.75, 0.85, -0.05), halves: halfGrids(1.75, 0.85, { home: 0.443, away: 0.443 }, 0.1, 0.1) };
const chance = (market: string) => {
  const p = priceLeg(market, ctx)!;
  return p.win / (p.win + p.lose);
};

describe("rawGrader against SportyBet's own book", () => {
  it("prices every goals outcome it maps within 8 points of SportyBet's own chance", () => {
    // A wrong outcome id (Home/Draw for Draw/Home, "1-3" for "1-2") lands
    // tens of points away; the model and the book differ by a few at most.
    let graded = 0;
    const off: string[] = [];
    for (const m of markets) {
      for (const o of m.outcomes ?? []) {
        const sel: SportyBetSelection = { marketId: String(m.market_id), outcomeId: String(o.id), ...(m.specifier ? { specifier: m.specifier } : {}) };
        const g = rawGrader(sel);
        if (!g || g.scope === "corners") continue;
        graded++;
        const mine = chance(rawMarket(sel));
        if (Math.abs(mine - Number(o.probability)) > 0.08) off.push(`${sel.marketId} ${sel.outcomeId}: ${mine.toFixed(3)} v ${o.probability}`);
      }
    }
    expect(off).toEqual([]);
    expect(graded).toBeGreaterThan(550);
  });

  it("reads the markets people play that we used to refuse", () => {
    for (const [id, outcome, spec] of [
      ["450001", "12"], // goal bounds 1-2
      ["58", "76", "total=1.5"], // both halves over 1.5: no
      ["59", "74", "total=1.5"], // both halves under 1.5
      ["90", "12", "total=1.5"], // 2nd half over 1.5
      ["47", "418"], // HT/FT home/home
      ["1179", "1"], // 1st half or match result
      ["548", "1731"], // multigoals 1-3
      ["854", "74", "total=2.5"], // home or over 2.5
    ] as const) {
      expect(rawGrader({ marketId: id, outcomeId: outcome, ...(spec ? { specifier: spec } : {}) }), `${id} ${outcome}`).not.toBeNull();
    }
  });

  it("leaves what needs goal times or players to SportyBet's read", () => {
    for (const id of ["60200", "60300", "900383", "8", "9", "100", "38"]) expect(rawGrader({ marketId: id, outcomeId: "1" })).toBeNull();
  });
});

describe("grading a finished game", () => {
  const ft = { home: 2, away: 1 };
  const ht = { home: 0, away: 1 };
  it("settles the way SportyBet does", () => {
    expect(gradeLegFull(raw("47", "424"), ft, ht)).toBe("lose"); // Draw/Home: it was 0-1 at the break
    expect(gradeLegFull(raw("47", "430"), ft, ht)).toBe("win"); // Away/Home
    expect(gradeLegFull(raw("450001", "13"), ft, ht)).toBe("win"); // 1-3 goals: 3
    expect(gradeLegFull(raw("450001", "12"), ft, ht)).toBe("lose");
    expect(gradeLegFull(raw("450004", "3"), ft, ht)).toBe("lose"); // excluded 3: it was 3
    expect(gradeLegFull(raw("58", "76", "total=1.5"), ft, ht)).toBe("win"); // both halves over 1.5: no
    expect(gradeLegFull(raw("90", "12", "total=1.5"), ft, ht)).toBe("win"); // 2nd half 2-0
    expect(gradeLegFull(raw("1179", "3"), ft, ht)).toBe("win"); // away led at the break
    expect(gradeLegFull(raw("15", "sr:winning_margin:3+:113", "variant=sr:winning_margin:3+"), ft, ht)).toBe("win");
    expect(gradeLegFull(raw("45", "288"), ft, ht)).toBe("win"); // 2:1
    expect(gradeLegFull(raw("45", "324"), { home: 5, away: 0 }, null)).toBe("win"); // other
    expect(gradeLegFull(raw("12", "776"), { home: 1, away: 0 }, null)).toBe("push"); // home no bet
  });

  it("can't grade a halves market without the half-time score", () => {
    expect(gradeLegFull(raw("47", "418"), ft, null)).toBeNull();
    expect(gradeLegFull(raw("450001", "13"), ft, null)).toBe("win");
  });
});

describe("priceLeg with halves", () => {
  it("adds up to one across a market's outcomes", () => {
    const htft = ["418", "420", "422", "424", "426", "428", "430", "432", "434"].map((o) => priceLeg(raw("47", o), ctx)!.win);
    expect(htft.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("agrees with the full-match grid on a whole-match line", () => {
    // Goal bounds 0-2 is under 2.5.
    expect(priceLeg(raw("450001", "2"), ctx)!.win).toBeCloseTo(priceLeg("ou:under:2.5", ctx)!.win, 10);
  });

  it("prices a same-game combo with a halves part off the halves", () => {
    const both = priceLeg(`combo:1x2:home+${raw("90", "12", "total=0.5")}`, ctx)!.win;
    expect(both).toBeLessThan(chance("1x2:home"));
    expect(both).toBeGreaterThan(0.4);
    expect(priceLeg(`combo:corners:over:8.5+${raw("47", "418")}`, ctx)).toBeNull();
  });
});
