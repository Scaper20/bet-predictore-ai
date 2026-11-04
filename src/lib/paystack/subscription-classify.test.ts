import { describe, expect, it } from "vitest";
import { classifySubscription, type ClassifyInput } from "./subscription-classify";

const now = new Date("2026-11-05T04:00:00Z");
const input = (o: Partial<ClassifyInput> & { end?: string | null; ps?: string; next?: string | null; ourStatus?: string } = {}): ClassifyInput => ({
  ours: { userId: "u1", tier: "vip", status: o.ourStatus ?? "active", periodEnd: o.end === null ? null : new Date(o.end ?? "2026-10-24T13:04:00Z") },
  paystack: { status: o.ps ?? "active", nextPaymentDate: o.next === undefined ? "2026-11-24T13:04:00Z" : o.next, planAmount: 1_200_000 },
  charges: o.charges ?? [],
  knownReferences: o.knownReferences ?? new Set(),
  now,
});
const charge = (reference: string, amount = 1_200_000) => ({ reference, amount, status: "success", paid_at: "2026-10-24T13:05:00Z" });

describe("classifySubscription", () => {
  it("finds a renewal Paystack took that we never recorded", () => {
    const f = classifySubscription(input({ charges: [charge("r-oct")] }));
    expect(f.kind).toBe("missed_renewal");
    expect(f.unseen.map((c) => c.reference)).toEqual(["r-oct"]);
  });

  it("ignores charges we already hold and charges of another amount (a pass, a pay-once month)", () => {
    const f = classifySubscription(input({ charges: [charge("r-known"), charge("r-pass", 50_000)], knownReferences: new Set(["r-known"]), ps: "attention" }));
    expect(f.kind).toBe("payment_failing");
  });

  it("reports a lapsed period Paystack has ended, and is quiet once we say cancelled too", () => {
    expect(classifySubscription(input({ ps: "non-renewing" })).kind).toBe("ended");
    expect(classifySubscription(input({ ps: "cancelled", ourStatus: "cancelled" })).kind).toBe("ok");
  });

  it("flags a lapsed period with no charge while Paystack still says active", () => {
    expect(classifySubscription(input({ ps: "active" })).kind).toBe("lapsed_unexplained");
  });

  it("is quiet for a paid-up plan whose dates agree, and flags drift or a missed cancellation", () => {
    const paid = { end: "2026-11-24T13:04:00Z" };
    expect(classifySubscription(input({ ...paid })).kind).toBe("ok");
    expect(classifySubscription(input({ ...paid, next: "2026-12-24T13:04:00Z" })).kind).toBe("date_drift");
    expect(classifySubscription(input({ ...paid, ps: "non-renewing" })).kind).toBe("will_not_renew");
  });
});
