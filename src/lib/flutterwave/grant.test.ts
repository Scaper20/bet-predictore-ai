import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * A stand-in for the service-role client, just the calls grant.ts makes:
 * one payments row and one subscriptions row, with the conditional update
 * (`.neq("status", "success")`) that makes a payment claimable only once.
 */
type Row = Record<string, unknown>;
const db: { payment: Row | null; subscription: Row | null; upserts: Row[] } = {
  payment: null,
  subscription: null,
  upserts: [],
};

function from(table: string) {
  const q: { op: "select" | "update"; value?: Row; returning: boolean; guarded: boolean } = {
    op: "select",
    returning: false,
    guarded: false,
  };
  const run = () => {
    if (q.op === "update" && table === "payments" && db.payment) {
      if (q.guarded && db.payment.status === "success") return { data: [] };
      db.payment = { ...db.payment, ...q.value };
      return { data: q.returning ? [{ id: db.payment.id }] : null };
    }
    return { data: null };
  };
  const b = {
    select() {
      if (q.op === "update") q.returning = true;
      return b;
    },
    update(value: Row) {
      q.op = "update";
      q.value = value;
      return b;
    },
    upsert(value: Row) {
      db.upserts.push(value);
      db.subscription = value;
      return Promise.resolve({ error: null });
    },
    eq() {
      return b;
    },
    neq(column: string, value: unknown) {
      if (column === "status" && value === "success") q.guarded = true;
      return b;
    },
    maybeSingle() {
      return Promise.resolve({ data: table === "payments" ? db.payment : db.subscription });
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return b;
}

const verifyByReference = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/flutterwave/client", () => ({ verifyByReference: (ref: string) => verifyByReference(ref) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => undefined), emailLayout: (html: string) => html }));

const REF = "betrix_fw_user-1_abc";
const paid = { id: 1, tx_ref: REF, status: "successful", amount: 500, currency: "KES", customer: { email: "a@b.co" } };

beforeEach(() => {
  db.payment = { id: "p1", user_id: "user-1", plan: "pro:monthly", status: "pending", currency: "KES", amount_minor: 50000, provider: "flutterwave" };
  db.subscription = null;
  db.upserts = [];
  verifyByReference.mockReset();
});

describe("grantFlutterwavePayment", () => {
  it("grants a verified payment once, however many times it is called", async () => {
    const { grantFlutterwavePayment } = await import("./grant");
    verifyByReference.mockResolvedValue(paid);
    expect(await grantFlutterwavePayment(REF)).toBe("granted");
    expect(await grantFlutterwavePayment(REF)).toBe("already");
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ user_id: "user-1", tier: "pro", status: "active", provider: "flutterwave" });
    expect(db.payment?.status).toBe("success");
  });

  it("grants nothing for a payment short of the price or in another currency", async () => {
    const { grantFlutterwavePayment } = await import("./grant");
    verifyByReference.mockResolvedValue({ ...paid, amount: 50 });
    expect(await grantFlutterwavePayment(REF)).toBe("failed");
    db.payment = { ...db.payment, status: "pending" };
    verifyByReference.mockResolvedValue({ ...paid, currency: "UGX" });
    expect(await grantFlutterwavePayment(REF)).toBe("failed");
    expect(db.upserts).toHaveLength(0);
  });

  it("waits while Flutterwave hasn't settled, and ignores references it didn't issue", async () => {
    const { grantFlutterwavePayment } = await import("./grant");
    verifyByReference.mockResolvedValue({ ...paid, status: "pending" });
    expect(await grantFlutterwavePayment(REF)).toBe("pending");
    verifyByReference.mockRejectedValue(new Error("unreachable"));
    expect(await grantFlutterwavePayment(REF)).toBe("pending");
    db.payment = null;
    expect(await grantFlutterwavePayment("betrix_fw_someone_else")).toBe("unknown");
    expect(db.upserts).toHaveLength(0);
  });

  it("adds a renewal to the end of the running period", async () => {
    const { grantFlutterwavePayment } = await import("./grant");
    const end = new Date(Date.now() + 10 * 86_400_000);
    db.subscription = { tier: "pro", status: "active", current_period_end: end.toISOString() };
    verifyByReference.mockResolvedValue(paid);
    expect(await grantFlutterwavePayment(REF)).toBe("granted");
    const until = new Date(String(db.upserts[0].current_period_end));
    expect(until.getTime() - end.getTime()).toBeGreaterThan(27 * 86_400_000);
  });
});
