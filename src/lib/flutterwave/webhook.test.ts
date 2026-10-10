import { beforeEach, describe, expect, it, vi } from "vitest";

const grant = vi.fn(async (_ref: string) => "granted");
vi.mock("@/lib/flutterwave/grant", () => ({ grantFlutterwavePayment: (ref: string) => grant(ref) }));

const HASH = "test-secret-hash";

function delivery(body: unknown, hash?: string) {
  return new Request("https://betrix.test/api/billing/flutterwave/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(hash ? { "verif-hash": hash } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.FLUTTERWAVE_WEBHOOK_HASH = HASH;
  grant.mockClear();
});

describe("Flutterwave webhook", () => {
  const completed = { event: "charge.completed", data: { tx_ref: "betrix_fw_user-1_abc", status: "successful" } };

  it("refuses a delivery without the secret hash, or with the wrong one", async () => {
    const { POST } = await import("@/app/api/billing/flutterwave/webhook/route");
    expect((await POST(delivery(completed))).status).toBe(401);
    expect((await POST(delivery(completed, "wrong"))).status).toBe(401);
    expect(grant).not.toHaveBeenCalled();
  });

  it("hands a completed charge of ours to the grant", async () => {
    const { POST } = await import("@/app/api/billing/flutterwave/webhook/route");
    const res = await POST(delivery(completed, HASH));
    expect(res.status).toBe(200);
    expect(grant).toHaveBeenCalledWith("betrix_fw_user-1_abc");
  });

  it("reads the legacy webhook format too", async () => {
    const { POST } = await import("@/app/api/billing/flutterwave/webhook/route");
    await POST(delivery({ "event.type": "MOBILEMONEYGH_TRANSACTION", txRef: "betrix_fw_user-2_def" }, HASH));
    expect(grant).toHaveBeenCalledWith("betrix_fw_user-2_def");
  });

  it("acknowledges, but ignores, references BetriX didn't issue", async () => {
    const { POST } = await import("@/app/api/billing/flutterwave/webhook/route");
    expect((await POST(delivery({ event: "charge.completed", data: { tx_ref: "dashboard-link-1" } }, HASH))).status).toBe(200);
    expect((await POST(delivery({ event: "transfer.completed", data: { reference: "payout-1" } }, HASH))).status).toBe(200);
    expect(grant).not.toHaveBeenCalled();
  });
});
