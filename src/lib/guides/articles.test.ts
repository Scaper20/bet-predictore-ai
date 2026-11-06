import { describe, expect, it } from "vitest";
import { ARTICLES } from "./articles";

describe("guide articles", () => {
  it("have unique slugs and meta descriptions that fit a result", () => {
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
    for (const a of ARTICLES) expect(a.description.length, a.slug).toBeLessThanOrEqual(160);
  });
  it("make no promise of winning", () => {
    const text = JSON.stringify(ARTICLES).toLowerCase();
    for (const bad of ["guaranteed", "sure win", "banker", "cannot lose", "can't lose"]) expect(text).not.toContain(bad);
  });
  it("quote no hit-rate percentage the track page owns", () => {
    const a = ARTICLES.find((x) => x.slug === "how-accurate-are-football-predictions")!;
    expect(JSON.stringify(a)).not.toMatch(/hit rate of \d|\d+% hit rate/);
  });
  it("state the arithmetic they use", () => {
    expect((0.7 ** 5 * 100).toFixed(0)).toBe("17");
    expect((0.7 ** 10 * 100).toFixed(0)).toBe("3");
    expect(Math.round(100 / 1.5)).toBe(67);
  });
});
