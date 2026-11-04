import { describe, expect, it } from "vitest";
import { buildRenewalsView, planKind, type PayRow, type SubRow } from "./renewals-view";

const now = new Date("2026-11-05T09:00:00Z");
const sub = (o: Partial<SubRow> & { userId: string }): SubRow => ({
  email: `${o.userId}@x.com`, tier: "vip", status: "active", provider: null, subscriptionCode: "SUB_1", periodEnd: "2026-11-20T00:00:00Z", ...o,
});
const pay = (o: Partial<PayRow> & { userId: string; plan: string }): PayRow => ({
  amountKobo: 1_200_000, createdAt: "2026-10-20T00:00:00Z", reference: `ref-${o.userId}-${o.createdAt ?? "a"}`, ...o,
});

describe("planKind", () => {
  it("tells card, pay-once and manual plans apart", () => {
    expect(planKind({ provider: null, subscriptionCode: "SUB_1" })).toBe("card");
    expect(planKind({ provider: "paystack_once", subscriptionCode: null })).toBe("pay-once");
    expect(planKind({ provider: null, subscriptionCode: null })).toBe("manual");
  });
});

describe("buildRenewalsView", () => {
  it("lists card renewals due in the next 14 days with what should be charged", () => {
    const v = buildRenewalsView({ now, subs: [sub({ userId: "a", periodEnd: "2026-11-08T00:00:00Z" }), sub({ userId: "b", periodEnd: "2026-12-30T00:00:00Z" })], payments: [pay({ userId: "a", plan: "vip:monthly" })] });
    expect(v.dueSoon.map((i) => i.userId)).toEqual(["a"]);
    expect(v.dueSoon[0]).toMatchObject({ cycle: "monthly", amountKobo: 1_200_000, daysLeft: 2 });
    expect(v.dueSoonKobo).toBe(1_200_000);
  });

  it("flags a lapsed period the plan still calls active: the 24 Oct case", () => {
    const v = buildRenewalsView({ now, subs: [sub({ userId: "a", periodEnd: "2026-10-24T13:04:00Z" })], payments: [pay({ userId: "a", plan: "vip:monthly", createdAt: "2026-09-24T13:03:38Z" })] });
    expect(v.needsAttention).toHaveLength(1);
    expect(v.needsAttention[0].reasons[0]).toMatch(/ended 12 day\(s\) ago and no renewal is recorded/);
  });

  it("flags past-due plans, missing dates and renewals recorded without a cycle", () => {
    const v = buildRenewalsView({
      now,
      subs: [sub({ userId: "a", status: "past_due" }), sub({ userId: "b", periodEnd: null }), sub({ userId: "c" })],
      payments: [pay({ userId: "c", plan: "renewal" })],
    });
    const by = Object.fromEntries(v.needsAttention.map((n) => [n.item.userId, n.reasons.join(" ")]));
    expect(by.a).toMatch(/retrying/);
    expect(by.b).toMatch(/No paid-through date/);
    expect(by.c).toMatch(/could not be worked out/);
  });

  it("leaves cancelled plans and healthy ones alone", () => {
    const v = buildRenewalsView({ now, subs: [sub({ userId: "a", status: "cancelled", periodEnd: "2026-10-01T00:00:00Z" }), sub({ userId: "b" })], payments: [] });
    expect(v.needsAttention).toEqual([]);
    expect(v.cardActive).toBe(1);
  });

  it("shows pay-once plans about to lapse, apart from card renewals", () => {
    const v = buildRenewalsView({ now, subs: [sub({ userId: "a", provider: "paystack_once", subscriptionCode: null, periodEnd: "2026-11-09T00:00:00Z" })], payments: [] });
    expect(v.lapsingOnce.map((i) => i.userId)).toEqual(["a"]);
    expect(v.dueSoon).toEqual([]);
  });

  it("counts a card payment after the first as a renewal, newest first, within 30 days", () => {
    const v = buildRenewalsView({
      now,
      subs: [sub({ userId: "a" })],
      payments: [
        pay({ userId: "a", plan: "vip:monthly", createdAt: "2026-08-24T00:00:00Z", reference: "first" }),
        pay({ userId: "a", plan: "vip:monthly", createdAt: "2026-09-24T00:00:00Z", reference: "old" }),
        pay({ userId: "a", plan: "vip:monthly", createdAt: "2026-10-24T00:00:00Z", reference: "r1" }),
      ],
    });
    expect(v.recent.map((r) => r.reference)).toEqual(["r1"]);
  });
});
