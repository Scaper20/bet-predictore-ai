import { describe, expect, it } from "vitest";
import { BOOKMAKERS, formatForBookmaker, marketFamily } from "./index";
import type { SlipLeg } from "@/lib/slip";

const leg = (market: string, label: string): SlipLeg => ({
  matchId: "m1",
  fixture: "Arsenal vs Chelsea",
  league: "EPL",
  kickoff: new Date().toISOString(),
  market,
  label,
  probability: 0.5,
  fairOdds: 2,
});

describe("marketFamily", () => {
  it("parses every family prefix used by predict.ts's Pick.market ids", () => {
    expect(marketFamily("1x2:home")).toBe("1x2");
    expect(marketFamily("dc:home-draw")).toBe("dc");
    expect(marketFamily("ou:over:2.5")).toBe("ou");
    expect(marketFamily("btts:yes")).toBe("btts");
    expect(marketFamily("cs:2-1")).toBe("cs");
    expect(marketFamily("ah:home:-1")).toBe("ah");
  });

  it("returns null for an unrecognised prefix rather than guessing", () => {
    expect(marketFamily("mystery:thing")).toBeNull();
  });
});

describe("formatForBookmaker", () => {
  it("every bookmaker has a menu label for every known market family", () => {
    const families = ["1x2", "dc", "ou", "btts", "cs", "ah"] as const;
    for (const b of BOOKMAKERS) {
      for (const f of families) {
        expect(b.marketMenuLabel[f]).toBeTruthy();
      }
    }
  });

  it("carries the fixture and the pick's own label through untouched", () => {
    const l = leg("ou:over:2.5", "Over 2.5 Goals");
    for (const b of BOOKMAKERS) {
      const formatted = formatForBookmaker(b, l);
      expect(formatted).not.toBeNull();
      expect(formatted!.fixture).toBe("Arsenal vs Chelsea");
      expect(formatted!.selection).toBe("Over 2.5 Goals");
      expect(formatted!.menu).toBe(b.marketMenuLabel.ou);
    }
  });

  it("returns null for a market id with no recognised family", () => {
    const l = leg("weird:thing", "Something");
    expect(formatForBookmaker(BOOKMAKERS[0], l)).toBeNull();
  });
});
