import { describe, expect, it } from "vitest";
import { shortPickLabel } from "./pick-label";

describe("shortPickLabel", () => {
  it("shortens shots on target and leaves everything else", () => {
    expect(shortPickLabel("Home under 5.5 shots on target")).toBe("Home under 5.5 SOT");
    expect(shortPickLabel("Away +3.5 shots on target handicap")).toBe("Away +3.5 SOT handicap");
    expect(shortPickLabel("Under 12.5 corners")).toBe("Under 12.5 corners");
    expect(shortPickLabel("Over 1.5 Goals")).toBe("Over 1.5 Goals");
    expect(shortPickLabel("Home or Draw")).toBe("Home or Draw");
  });
});
