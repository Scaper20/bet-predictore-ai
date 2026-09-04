import { describe, expect, it } from "vitest";
import { familiesOwnedBy, familyOf, modelIdForMarket, ownerOf } from "./router";
import { ACTIVE_MODEL_ID, allModels } from "./registry";

describe("familyOf", () => {
  it("takes the prefix predictions_log groups on", () => {
    expect(familyOf("ou:over:2.5")).toBe("ou");
    expect(familyOf("1x2:home")).toBe("1x2");
    expect(familyOf("btts")).toBe("btts");
  });
});

describe("ownerOf", () => {
  it("resolves every market the settlement grader can grade", () => {
    // Exactly the markets evaluatePick handles; if one of these ever resolves
    // to nothing, a settled row becomes unattributable.
    const markets = [
      "1x2:home", "1x2:draw", "1x2:away",
      "dc:home-draw", "dc:away-draw", "dc:home-away",
      "btts:yes", "btts:no",
      "ou:over:2.5", "ou:under:1.5",
      "cs:2-1",
    ];
    for (const market of markets) {
      expect(ownerOf(market).status, market).toBe("live");
    }
  });

  it("never attributes a pick to a model that has not shipped", () => {
    // A development model declares the families it is aiming at. Those are an
    // intention, not a claim on today's picks.
    const roadmap = allModels().filter((m) => m.status === "development");
    for (const model of roadmap) {
      for (const family of model.pickTypes) {
        expect(ownerOf(`${family}:anything`).id).not.toBe(model.id);
      }
    }
  });

  it("falls back to the active model for an unclaimed family", () => {
    expect(modelIdForMarket("some-market-nobody-owns:selection")).toBe(ACTIVE_MODEL_ID);
  });
});

describe("familiesOwnedBy", () => {
  it("reports only what a model actually owns, not what it aims at", () => {
    for (const model of allModels()) {
      const owned = familiesOwnedBy(model.id);
      if (model.status === "live") expect(owned.length).toBeGreaterThan(0);
      else expect(owned).toEqual([]);
    }
  });

  it("assigns each family to exactly one model", () => {
    const all = allModels().flatMap((m) => familiesOwnedBy(m.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
