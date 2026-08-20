import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, cacheStats } from "./cache";

let seq = 0;
const uniqueKey = () => `test:${Date.now()}:${seq++}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("cached", () => {
  it("calls the loader once and reuses the value inside the TTL", async () => {
    const key = uniqueKey();
    const loader = vi.fn(async () => "value");

    expect(await cached(key, 10_000, loader)).toBe("value");
    expect(await cached(key, 10_000, loader)).toBe("value");
    expect(await cached(key, 10_000, loader)).toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent misses into a single upstream call", async () => {
    const key = uniqueKey();
    let resolve: (v: string) => void = () => {};
    const loader = vi.fn(
      () => new Promise<string>((r) => { resolve = r; }),
    );

    // Ten callers hit a cold key at once — the free tiers cannot take ten
    // requests, so exactly one must go upstream.
    const all = Promise.all(Array.from({ length: 10 }, () => cached(key, 10_000, loader)));
    resolve("shared");

    expect(await all).toEqual(Array(10).fill("shared"));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const key = uniqueKey();
    let n = 0;
    const loader = vi.fn(async () => `v${++n}`);

    expect(await cached(key, 5, loader)).toBe("v1");
    await new Promise((r) => setTimeout(r, 20));
    expect(await cached(key, 5, loader)).toBe("v2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("serves the stale value when the loader fails", async () => {
    const key = uniqueKey();
    let shouldFail = false;
    const loader = vi.fn(async () => {
      if (shouldFail) throw new Error("upstream down");
      return "good";
    });

    expect(await cached(key, 5, loader)).toBe("good");
    await new Promise((r) => setTimeout(r, 20));

    shouldFail = true;
    // The page must still render real data rather than an error.
    expect(await cached(key, 5, loader)).toBe("good");
  });

  it("backs off instead of retrying a failing loader on every request", async () => {
    const key = uniqueKey();
    let shouldFail = false;
    const loader = vi.fn(async () => {
      if (shouldFail) throw new Error("upstream down");
      return "good";
    });

    await cached(key, 5, loader);
    await new Promise((r) => setTimeout(r, 20));
    shouldFail = true;

    await cached(key, 5, loader); // one retry, fails, starts the cooldown
    const afterFirstFailure = loader.mock.calls.length;

    // Everything inside the cooldown window is served from the stale entry.
    for (let i = 0; i < 5; i++) {
      expect(await cached(key, 5, loader)).toBe("good");
    }
    expect(loader).toHaveBeenCalledTimes(afterFirstFailure);
  });

  it("propagates the failure when there is nothing stale to fall back on", async () => {
    const key = uniqueKey();
    const loader = vi.fn(async () => {
      throw new Error("upstream down");
    });

    await expect(cached(key, 1000, loader)).rejects.toThrow("upstream down");
  });

  it("clears the in-flight entry after a failure so the next call retries", async () => {
    const key = uniqueKey();
    let attempt = 0;
    const loader = vi.fn(async () => {
      if (++attempt === 1) throw new Error("transient");
      return "recovered";
    });

    await expect(cached(key, 1000, loader)).rejects.toThrow("transient");
    expect(await cached(key, 1000, loader)).toBe("recovered");
  });

  it("reports its own size", async () => {
    await cached(uniqueKey(), 10_000, async () => 1);
    expect(cacheStats().entries).toBeGreaterThan(0);
    expect(cacheStats().inflight).toBe(0);
  });
});
