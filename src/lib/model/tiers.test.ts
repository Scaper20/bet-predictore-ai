import { describe, expect, it } from "vitest";
import { isStrong, pickTier, STRONG_CONFIDENCE } from "./tiers";
import { summarise, type SettledRow } from "../performance";

describe("pick tiers", () => {
  it("marks 63+ confidence as strong in the tested divisions", () => {
    expect(STRONG_CONFIDENCE).toBe(63);
    expect(pickTier(63, "premier-league")).toBe("strong");
    expect(pickTier(62.9, "premier-league")).toBe("standard");
    expect(isStrong({ confidence: 72 }, "league-one")).toBe(true);
    expect(isStrong(null, "premier-league")).toBe(false);
  });

  it("never marks a pick strong outside the tested divisions", () => {
    expect(pickTier(80, "mls")).toBe("standard");
    expect(pickTier(80, "champions-league")).toBe("standard");
    expect(isStrong({ confidence: 72 }, null)).toBe(false);
  });

  it("counts only rows stamped strong at logging time in the Strong record", () => {
    const row = (result: SettledRow["result"], pick_tier: string | null): SettledRow => ({
      league_code: "premier-league", market: "1x2:home", model_id: "goals-v2", result, pick_tier,
    });
    const s = summarise([row("win", "strong"), row("lose", "standard"), row("win", null), row("lose", "strong"), row("win", "strong")]);
    expect(s.overall).toMatchObject({ wins: 3, losses: 2 });
    expect(s.strong).toMatchObject({ wins: 2, losses: 1, sample: 3 });
  });
});
