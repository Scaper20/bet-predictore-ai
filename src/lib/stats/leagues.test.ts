import { describe, expect, it } from "vitest";
import { LEAGUES } from "@/lib/leagues";
import { TABLE_LEAGUES, hasTablePage } from "@/lib/stats/leagues";

describe("hasTablePage", () => {
  it("excludes knockout cups and international competitions", () => {
    expect(hasTablePage("coppa-italia")).toBe(false);
    expect(hasTablePage("caf-champions-league")).toBe(false);
    for (const l of LEAGUES) {
      if (l.knockout || l.confederation) expect(hasTablePage(l.code)).toBe(false);
    }
  });

  it("keeps the ordinary leagues", () => {
    expect(TABLE_LEAGUES.length).toBeGreaterThan(5);
    expect(hasTablePage("serie-a")).toBe(true);
  });
});
