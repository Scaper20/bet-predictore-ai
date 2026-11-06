import { describe, expect, it } from "vitest";
import { earnsAfterTermination, inPilot, inspectionDue, isTerminated, planRateChange, planTermination } from "./partner-terms";

const now = new Date("2026-11-10T09:00:00Z");
const d = (s: string) => new Date(s);

describe("planRateChange", () => {
  const base = { currentBps: 2000, now, agreedInWriting: false };
  it("needs 30 days' notice without the partner's agreement", () => {
    const r = planRateChange({ ...base, newBps: 1500 });
    expect(r).toEqual({ ok: true, effectiveAt: d("2026-12-10T09:00:00Z") });
    const early = planRateChange({ ...base, newBps: 1500, requestedEffectiveAt: d("2026-11-20T00:00:00Z") });
    expect(early.ok).toBe(false);
  });
  it("starts at once when the partner has agreed in writing", () => {
    expect(planRateChange({ ...base, newBps: 2500, agreedInWriting: true })).toEqual({ ok: true, effectiveAt: now });
    expect(planRateChange({ ...base, newBps: 2500, agreedInWriting: true, requestedEffectiveAt: d("2026-11-01T00:00:00Z") })).toEqual({ ok: true, effectiveAt: now });
  });
  it("refuses a rate above the ceiling, a negative rate and no change", () => {
    expect(planRateChange({ ...base, newBps: 3500, agreedInWriting: true }).ok).toBe(false);
    expect(planRateChange({ ...base, newBps: -1 }).ok).toBe(false);
    expect(planRateChange({ ...base, newBps: 2000 }).ok).toBe(false);
    expect(planRateChange({ ...base, newBps: 3000, agreedInWriting: true }).ok).toBe(true);
  });
});

describe("pilot and inspection", () => {
  it("covers 90 days after activation and falls due on day 14", () => {
    expect(inPilot(d("2026-11-01T00:00:00Z"), now)).toBe(true);
    expect(inPilot(d("2026-07-01T00:00:00Z"), now)).toBe(false);
    expect(inPilot(null, now)).toBe(false);
    expect(inspectionDue(d("2026-11-01T00:00:00Z"))).toEqual(d("2026-11-15T00:00:00Z"));
    expect(inspectionDue(null)).toBeNull();
  });
});

describe("planTermination", () => {
  it("gives 30 days' notice, or 7 in the pilot, without cause", () => {
    expect(planTermination({ now, activatedAt: d("2026-01-01T00:00:00Z"), forCause: false, reason: "wind down" })).toMatchObject({ ok: true, noticeDays: 30, effectiveAt: d("2026-12-10T09:00:00Z") });
    expect(planTermination({ now, activatedAt: d("2026-11-01T00:00:00Z"), forCause: false, reason: "not a fit" })).toMatchObject({ ok: true, noticeDays: 7, effectiveAt: d("2026-11-17T09:00:00Z") });
  });
  it("takes effect at once for cause, and always needs a reason", () => {
    expect(planTermination({ now, activatedAt: null, forCause: true, reason: "fraud" })).toMatchObject({ ok: true, noticeDays: 0, effectiveAt: now });
    expect(planTermination({ now, activatedAt: null, forCause: false, reason: "  " }).ok).toBe(false);
  });
});

describe("after termination", () => {
  const term = d("2026-12-01T00:00:00Z");
  it("is not terminated until the date arrives", () => {
    expect(isTerminated(term, d("2026-11-30T00:00:00Z"))).toBe(false);
    expect(isTerminated(term, d("2026-12-01T00:00:00Z"))).toBe(true);
    expect(isTerminated(null, now)).toBe(false);
  });
  it("keeps only customers who had already paid, to the end of their own year", () => {
    const first = d("2026-10-15T00:00:00Z");
    expect(earnsAfterTermination({ terminatedAt: term, firstPaidAt: first, paidAt: d("2026-11-20T00:00:00Z") })).toBe(true);
    expect(earnsAfterTermination({ terminatedAt: term, firstPaidAt: first, paidAt: d("2027-01-15T00:00:00Z") })).toBe(true);
    expect(earnsAfterTermination({ terminatedAt: term, firstPaidAt: d("2026-12-05T00:00:00Z"), paidAt: d("2026-12-05T00:00:00Z") })).toBe(false);
    expect(earnsAfterTermination({ terminatedAt: null, firstPaidAt: d("2026-12-05T00:00:00Z"), paidAt: d("2026-12-05T00:00:00Z") })).toBe(true);
  });
});
