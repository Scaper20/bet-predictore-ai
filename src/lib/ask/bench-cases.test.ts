import { describe, expect, it } from "vitest";
import { BENCH_CASES, fillCase } from "./bench-cases";

describe("BENCH_CASES", () => {
  it("has 40 uniquely named questions across every kind", () => {
    expect(BENCH_CASES).toHaveLength(40);
    expect(new Set(BENCH_CASES.map((c) => c.id)).size).toBe(40);
    expect(new Set(BENCH_CASES.map((c) => c.category)).size).toBe(7);
  });
  it("fills every placeholder from the slate", () => {
    const slate = Array.from({ length: 10 }, (_, i) => ({ home: `Home${i}`, away: `Away${i}`, league: `League${i}` }));
    for (const [i, c] of BENCH_CASES.entries()) expect(fillCase(c, slate, i)).not.toMatch(/\{|\}/);
    expect(fillCase(BENCH_CASES[0], slate, 3)).toBe("Who wins Home3 v Away3?");
  });
  it("still produces a question with no slate", () => {
    expect(fillCase(BENCH_CASES[0], [], 0)).toBe("Who wins Arsenal v Chelsea?");
  });
});
