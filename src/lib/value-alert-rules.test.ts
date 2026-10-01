import { describe, expect, it } from "vitest";
import { scanDue, STALE_AFTER_MS, SCAN_LOCK_MS, valueHit } from "./value-alert-rules";

const verdict = (rating: string, vsFair = 0.04) =>
  ({ rating, vsFair, vsBest: 0, vsSharp: null, reason: "r" }) as never;
const model = (rating: string, edge = 0.06) =>
  ({ rating, edge, breakEven: 1.8, reason: "m" }) as never;

describe("valueHit", () => {
  it("fires on a market-rated value price, using the market edge", () => {
    expect(valueHit({ local: 2.1, priceVerdict: verdict("value", 0.031), modelVerdict: null })).toEqual({
      benchmark: "market", edge: 0.031, reason: "r", price: 2.1,
    });
  });

  it("lets the market veto the model wherever a consensus exists", () => {
    // The model may love it, but the books say the price is merely the best on offer.
    expect(valueHit({ local: 2.1, priceVerdict: verdict("best"), modelVerdict: model("value") })).toBeNull();
  });

  it("falls back to the model only where there is no consensus", () => {
    expect(valueHit({ local: 2.1, priceVerdict: null, modelVerdict: model("value", 0.07) })?.benchmark).toBe("model");
    expect(valueHit({ local: 2.1, priceVerdict: null, modelVerdict: model("thin") })).toBeNull();
  });

  it("never fires without a real local price", () => {
    expect(valueHit({ local: null, priceVerdict: verdict("value"), modelVerdict: null })).toBeNull();
  });
});

describe("scanDue", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("scans when nothing has ever run", () => {
    expect(scanDue(null, now)).toBe(true);
  });

  it("waits while the newest scan is fresh", () => {
    expect(scanDue({ startedAt: ago(60_000), finishedAt: ago(30_000), fixtures: 10 }, now)).toBe(false);
  });

  it("rescans once stale", () => {
    expect(scanDue({ startedAt: ago(STALE_AFTER_MS + 1), finishedAt: ago(STALE_AFTER_MS), fixtures: 10 }, now)).toBe(true);
  });

  it("does not pile a second scan on one still running", () => {
    expect(scanDue({ startedAt: ago(SCAN_LOCK_MS - 1000), finishedAt: null, fixtures: null }, now)).toBe(false);
  });

  it("treats a scan stuck past the lock as dead", () => {
    expect(scanDue({ startedAt: ago(STALE_AFTER_MS + 1), finishedAt: null, fixtures: null }, now)).toBe(true);
  });
});
