import { describe, expect, it } from "vitest";
import { evaluatePick } from "./settlement";

describe("evaluatePick", () => {
  it("grades 1x2", () => {
    expect(evaluatePick("1x2:home", 2, 1)).toBe("win");
    expect(evaluatePick("1x2:home", 1, 1)).toBe("lose");
    expect(evaluatePick("1x2:home", 0, 2)).toBe("lose");

    expect(evaluatePick("1x2:draw", 1, 1)).toBe("win");
    expect(evaluatePick("1x2:draw", 2, 1)).toBe("lose");

    expect(evaluatePick("1x2:away", 0, 2)).toBe("win");
    expect(evaluatePick("1x2:away", 1, 1)).toBe("lose");
  });

  it("grades double chance", () => {
    expect(evaluatePick("dc:home-draw", 1, 1)).toBe("win");
    expect(evaluatePick("dc:home-draw", 2, 1)).toBe("win");
    expect(evaluatePick("dc:home-draw", 0, 1)).toBe("lose");

    expect(evaluatePick("dc:away-draw", 1, 1)).toBe("win");
    expect(evaluatePick("dc:away-draw", 0, 2)).toBe("win");
    expect(evaluatePick("dc:away-draw", 2, 0)).toBe("lose");

    expect(evaluatePick("dc:home-away", 2, 1)).toBe("win");
    expect(evaluatePick("dc:home-away", 1, 1)).toBe("lose");
  });

  it("grades BTTS", () => {
    expect(evaluatePick("btts:yes", 1, 1)).toBe("win");
    expect(evaluatePick("btts:yes", 1, 0)).toBe("lose");
    expect(evaluatePick("btts:no", 1, 0)).toBe("win");
    expect(evaluatePick("btts:no", 1, 1)).toBe("lose");
  });

  it("grades over/under with a push on the exact line", () => {
    expect(evaluatePick("ou:over:2.5", 2, 1)).toBe("win");
    expect(evaluatePick("ou:over:2.5", 1, 1)).toBe("lose");
    expect(evaluatePick("ou:under:2.5", 1, 1)).toBe("win");
    expect(evaluatePick("ou:under:2.5", 2, 1)).toBe("lose");

    // Whole-number lines can push; half lines (the only ones this app ever
    // publishes) never do, but the grader is written to handle both.
    expect(evaluatePick("ou:over:3", 2, 1)).toBe("push");
    expect(evaluatePick("ou:under:3", 2, 1)).toBe("push");
  });

  it("grades correct score", () => {
    expect(evaluatePick("cs:2-1", 2, 1)).toBe("win");
    expect(evaluatePick("cs:2-1", 1, 2)).toBe("lose");
  });

  it("returns null for markets it does not grade, e.g. Asian Handicap", () => {
    expect(evaluatePick("ah:home:-1", 2, 1)).toBeNull();
    expect(evaluatePick("something:unknown", 2, 1)).toBeNull();
  });
});
