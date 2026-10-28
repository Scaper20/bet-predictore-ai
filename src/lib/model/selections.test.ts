import { afterEach, describe, expect, it } from "vitest";
import { extrasOn, override, SELECTIONS, setSelectionPolicy } from "./selections";
import { isPausedPick } from "./paused";
import { headlineEligible, type Pick } from "./predict";
import { hubMarketAllowed } from "@/lib/code-hub";

const pick = (market: string, probability = 0.75): Pick => ({ market, label: market, group: "Goals", probability, fairOdds: 1 / probability, confidence: 60 });
const GOAL_BOUNDS_14 = SELECTIONS.find((s) => s.label === "Goal bounds 1-4")!.market;
const FIRST_HALF = SELECTIONS.find((s) => s.label === "1st half over 0.5")!.market;

afterEach(() => setSelectionPolicy({}));

describe("selection switches", () => {
  it("leaves the rules in code alone with nothing stored", () => {
    expect(isPausedPick("ou:under:2.5")).toBe(true);
    expect(headlineEligible(pick("ou:over:2.5", 0.75))).toBe(true);
    expect(headlineEligible(pick("btts:yes"))).toBe(false);
    expect(hubMarketAllowed("ah:away:1.5")).toBe(false);
    expect(hubMarketAllowed("ou:over:1.5")).toBe(true);
  });

  it("publishes or retracts a selection on one surface only", () => {
    setSelectionPolicy({ "ou:under:2.5": { headline: true }, "ou:over:1.5": { codeHub: false }, "btts:yes": { headline: true } });
    expect(isPausedPick("ou:under:2.5")).toBe(false);
    expect(isPausedPick("ou:under:2.5", "codeHub")).toBe(true);
    expect(headlineEligible(pick("btts:yes"))).toBe(true);
    expect(headlineEligible(pick("btts:yes", 0.85))).toBe(false); // the cap still holds
    expect(hubMarketAllowed("ou:over:1.5")).toBe(false);
    expect(headlineEligible(pick("ou:over:1.5"))).toBe(true);
  });

  it("offers an extra selection only where it is switched on, and never a halves market in a code", () => {
    setSelectionPolicy({ [GOAL_BOUNDS_14]: { headline: true, codeHub: true }, [FIRST_HALF]: { headline: true, codeHub: true } });
    expect(extrasOn("headline").map((s) => s.label)).toEqual(["1st half over 0.5", "Goal bounds 1-4"]);
    expect(extrasOn("codeHub").map((s) => s.label)).toEqual(["Goal bounds 1-4"]);
    expect(override(FIRST_HALF, "codeHub")).toBe(false);
  });
});
