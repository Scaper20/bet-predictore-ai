import { describe, expect, it } from "vitest";
import { utmUrl } from "./utm";

describe("utmUrl", () => {
  it("tags our own links and keeps the path and query", () => {
    expect(utmUrl("https://www.kiqstat.app/football/predictions?league=npfl", { source: "whatsapp", medium: "digest", campaign: "daily" })).toBe(
      "https://www.kiqstat.app/football/predictions?league=npfl&utm_source=whatsapp&utm_medium=digest&utm_campaign=daily",
    );
  });
  it("tags a bare origin", () => {
    expect(utmUrl("https://www.kiqstat.app", { source: "share", medium: "combo" })).toBe("https://www.kiqstat.app/?utm_source=share&utm_medium=combo");
  });
  it("never overwrites a tag already there", () => {
    expect(utmUrl("https://www.kiqstat.app/?utm_source=chatgpt.com", { source: "email", medium: "email" })).toContain("utm_source=chatgpt.com");
  });
  it("leaves other sites alone", () => {
    expect(utmUrl("https://example.com/x", { source: "a", medium: "b" })).toBe("https://example.com/x");
  });
});
