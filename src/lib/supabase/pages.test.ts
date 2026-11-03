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
