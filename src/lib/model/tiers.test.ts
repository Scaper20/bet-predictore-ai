import { describe, expect, it } from "vitest";
import { isStrong, pickTier, STRONG_CONFIDENCE } from "./tiers";
import { summarise, type SettledRow } from "../performance";

describe("pick tiers", () => {
  it("marks 60+ confidence as strong", () => {
    expect(STRONG_CONFIDENCE).toBe(60);
    expect(pickTier(60)).toBe("strong");
    expect(pickTier(59.9)).toBe("standard");
    expect(isStrong({ confidence: 72 })).toBe(true);
    expect(isStrong(null)).toBe(false);
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
