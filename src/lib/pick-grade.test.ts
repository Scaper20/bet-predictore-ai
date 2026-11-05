import { describe, expect, it } from "vitest";
import { gradePick } from "./pick-grade";
import { SELECTIONS } from "@/lib/model/selections";

const market = (label: string) => SELECTIONS.find((s) => s.label === label)!.market;
const firstHalf = market("1st half over 0.5");
const secondHalf = market("2nd half over 0.5");
const bothHalves = market("Both halves over 0.5");
const bounds14 = market("Goal bounds 1-4");
const bounds03 = market("Goal bounds 0-3");

describe("gradePick", () => {
  it("grades our own markets as before", () => {
    expect(gradePick("dc:home-draw", 1, 1)).toBe("win");
    expect(gradePick("ou:over:2.5", 1, 1)).toBe("lose");
    expect(gradePick("btts:yes", 2, 1)).toBe("win");
  });

  it("grades 1st half over 0.5 from the half-time score", () => {
    expect(gradePick(firstHalf, 2, 0, { home: 1, away: 0 })).toBe("win");
    expect(gradePick(firstHalf, 2, 0, { home: 0, away: 0 })).toBe("lose");
  });

  it("grades 2nd half over 0.5 from the goals after the break", () => {
    expect(gradePick(secondHalf, 1, 0, { home: 0, away: 0 })).toBe("win");
    expect(gradePick(secondHalf, 1, 0, { home: 1, away: 0 })).toBe("lose");
  });

  it("grades both halves over 0.5: a goal in each half", () => {
    expect(gradePick(bothHalves, 2, 0, { home: 1, away: 0 })).toBe("win");
    expect(gradePick(bothHalves, 1, 0, { home: 1, away: 0 })).toBe("lose");
    expect(gradePick(bothHalves, 1, 0, { home: 0, away: 0 })).toBe("lose");
  });

  it("waits, rather than guesses, when a halves market has no half-time score", () => {
    expect(gradePick(firstHalf, 2, 0, null)).toBeNull();
    expect(gradePick(secondHalf, 2, 0)).toBeNull();
    expect(gradePick(bothHalves, 2, 0, undefined)).toBeNull();
  });

  it("grades the goal bounds from the final score alone", () => {
    expect(gradePick(bounds14, 0, 0)).toBe("lose");
    expect(gradePick(bounds14, 2, 1)).toBe("win");
    expect(gradePick(bounds14, 3, 2)).toBe("lose");
    expect(gradePick(bounds03, 4, 0)).toBe("lose");
    expect(gradePick(bounds03, 1, 1)).toBe("win");
  });
});
