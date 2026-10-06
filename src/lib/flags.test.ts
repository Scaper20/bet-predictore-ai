import { describe, expect, it } from "vitest";
import { flagCode, flagUrl } from "./flags";

describe("national team flags", () => {
  it("maps country names, home nations and age-group sides", () => {
    expect(flagCode("Belarus")).toBe("by");
    expect(flagCode("Finland")).toBe("fi");
    expect(flagCode("England")).toBe("gb-eng");
    expect(flagCode("Nigeria U20")).toBe("ng");
    expect(flagCode("France Women")).toBe("fr");
    expect(flagCode("Côte d'Ivoire")).toBe("ci");
  });

  it("leaves clubs alone", () => {
    expect(flagCode("Arsenal")).toBeNull();
    expect(flagUrl("Enyimba")).toBeNull();
  });

  it("builds a flagcdn url", () => {
    expect(flagUrl("Belarus")).toBe("https://flagcdn.com/w80/by.png");
  });
});
