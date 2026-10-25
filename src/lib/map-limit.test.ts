import { describe, expect, it } from "vitest";
import { mapLimit } from "./map-limit";

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("handles an empty list and a rejection like Promise.all", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
    await expect(mapLimit([1, 2], 2, async (n) => { if (n === 2) throw new Error("no"); return n; })).rejects.toThrow("no");
  });
});
