import { describe, expect, it } from "vitest";
import { allPages } from "./pages";

describe("allPages", () => {
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const page = async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
  it("reads past the 1,000-row cap", async () => {
    expect(await allPages(page)).toEqual(rows);
  });
  it("stops at max and surfaces errors", async () => {
    expect((await allPages(page, { max: 1000 })).length).toBe(1000);
    await expect(allPages(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});

describe("public track record reads", () => {
  it("page through every settled pick instead of one capped read", async () => {
    // In Nov 2026 one read of predictions_log stopped at 1,000 rows and the track
    // record sat at 999 picks (70.4%) while the log held 2,024 (73.1%).
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/performance-store.ts", "utf8");
    const records = src.slice(src.indexOf("export async function settledRecords"), src.indexOf("export async function lastMatchday"));
    expect(records).toContain("allPages");
    expect(records).not.toMatch(/\.limit\(\s*\d{4,}/);
  });
});
