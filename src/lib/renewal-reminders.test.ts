import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ ok: true }) }));

import { dueReminders, type SubRow } from "./renewal-reminders";

const NOW = new Date("2026-11-20T04:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const sub = (o: Partial<SubRow>): SubRow => ({ user_id: "u1", tier: "pro", status: "active", provider: "paystack_once", current_period_end: day(2), ...o });

describe("dueReminders", () => {
  it("picks a pay-once plan ending within three days", () => {
    expect(dueReminders([sub({})], NOW)).toEqual([{ userId: "u1", tier: "pro", periodEnd: day(2), canAutoRenew: true }]);
  });
  it("says Flutterwave members can't switch to auto-renew", () => {
    expect(dueReminders([sub({ provider: "flutterwave", tier: "vip" })], NOW)[0]).toMatchObject({ tier: "vip", canAutoRenew: false });
  });
  it("leaves out plans ending later, already ended, or with no end", () => {
    expect(dueReminders([sub({ current_period_end: day(5) }), sub({ current_period_end: day(-1) }), sub({ current_period_end: null })], NOW)).toEqual([]);
  });
  it("leaves out card subscriptions, gifts, cancelled and free plans", () => {
    expect(dueReminders([sub({ provider: "paystack" }), sub({ provider: null }), sub({ status: "cancelled" }), sub({ tier: "free" })], NOW)).toEqual([]);
  });
});
