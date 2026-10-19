import { describe, expect, it } from "vitest";
import {
  balances,
  buildCommission,
  commissionMinor,
  estimateFeeMinor,
  inCommissionWindow,
  minPayout,
  netMinor,
  partnerLink,
  payoutCsv,
  slugify,
  standing,
  validSlug,
} from "./partners";

const partner = { id: "p1", rateBps: 2000 };
const paidAt = new Date("2026-10-20T10:00:00Z");
const pay = (over: Partial<Parameters<typeof buildCommission>[0]["payment"]> = {}) => ({
  reference: "ref-1",
  provider: "paystack",
  plan: "pro",
  currency: "NGN",
  grossMinor: 500_000,
  status: "success",
  paidAt,
  ...over,
});

describe("what a payment earns", () => {
  it("pays 20% of the net on each plan, to the figures in the plan", () => {
    // Pro monthly ₦5,000: fee 1.5% + ₦100 = ₦175, net ₦4,825, partner ₦965.
    const r = buildCommission({ partner, userId: "u1", payment: pay(), firstPaidAt: paidAt });
    expect(r).toMatchObject({ ok: true, row: { fee_minor: 17_500, net_minor: 482_500, amount_minor: 96_500 } });
    const net = (gross: number) => netMinor(gross, estimateFeeMinor("paystack", "NGN", gross));
    expect(commissionMinor(net(1_350_000), 2000)).toBe(263_950); // Pro 3 months
    expect(commissionMinor(net(4_800_000), 2000)).toBe(943_600); // Pro yearly
    expect(commissionMinor(net(1_200_000), 2000)).toBe(234_400); // VIP monthly
    expect(commissionMinor(net(11_520_000), 2000)).toBe(2_267_440); // VIP yearly
  });

  it("uses the processor's real fee when it is known", () => {
    const r = buildCommission({ partner, userId: "u1", payment: pay({ feeMinor: 5_000 }), firstPaidAt: paidAt });
    expect(r).toMatchObject({ ok: true, row: { fee_minor: 5_000, net_minor: 495_000, amount_minor: 99_000 } });
  });

  it("holds a commission for the refund window", () => {
    const r = buildCommission({ partner, userId: "u1", payment: pay(), firstPaidAt: paidAt });
    expect(r.ok && r.row.payable_at).toBe("2026-11-03T10:00:00.000Z");
  });

  it("pays nothing on a failed payment or a free one", () => {
    expect(buildCommission({ partner, userId: "u1", payment: pay({ status: "failed" }), firstPaidAt: paidAt })).toEqual({ ok: false, reason: "payment_not_successful" });
    expect(buildCommission({ partner, userId: "u1", payment: pay({ grossMinor: 0 }), firstPaidAt: paidAt })).toEqual({ ok: false, reason: "nothing_to_pay" });
  });

  it("stops after the user's first 12 months as a payer", () => {
    const first = new Date("2026-01-15T00:00:00Z");
    expect(inCommissionWindow(first, new Date("2026-12-31T00:00:00Z"))).toBe(true);
    expect(inCommissionWindow(first, new Date("2027-01-15T00:00:00Z"))).toBe(false);
    expect(buildCommission({ partner, userId: "u1", payment: pay({ paidAt: new Date("2027-03-01T00:00:00Z") }), firstPaidAt: first })).toEqual({ ok: false, reason: "outside_window" });
  });

  it("estimates fees the way the processors charge them", () => {
    expect(estimateFeeMinor("paystack", "NGN", 200_000)).toBe(3_000); // under ₦2,500: no flat ₦100
    expect(estimateFeeMinor("paystack", "NGN", 11_520_000)).toBe(182_800); // 1.5% + ₦100
    expect(estimateFeeMinor("paystack", "NGN", 90_000_000)).toBe(200_000); // capped at ₦2,000
    expect(estimateFeeMinor("flutterwave", "GHS", 10_000)).toBe(380);
  });
});

describe("the link", () => {
  it("cleans a name into a code and checks one", () => {
    expect(slugify("Ada Tips!")).toBe("ada-tips");
    expect(slugify("  Émile  &  Co  ")).toBe("emile-co");
    expect(validSlug("ada-tips")).toBe(true);
    for (const bad of ["a", "-ada", "ada-", "Ada", "ada tips", "ada--tips", "x".repeat(40)]) expect(validSlug(bad)).toBe(false);
  });
  it("puts the code on the home page", () => {
    expect(partnerLink("https://www.kiqstat.app/", "ada-tips")).toBe("https://www.kiqstat.app/?ref=ada-tips");
  });
});

describe("balances and payouts", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const row = (status: "pending" | "paid" | "reversed", amount: number, payable: string, currency = "NGN") => ({ status, currency, amount_minor: amount, payable_at: payable });

  it("separates held, payable and paid", () => {
    expect(standing(row("pending", 1, "2026-11-12T00:00:00Z"), now)).toBe("held");
    expect(standing(row("pending", 1, "2026-11-09T00:00:00Z"), now)).toBe("payable");
    const [b] = balances([row("pending", 500_000, "2026-11-12T00:00:00Z"), row("pending", 700_000, "2026-11-01T00:00:00Z"), row("paid", 300_000, "2026-10-01T00:00:00Z"), row("reversed", 900_000, "2026-11-01T00:00:00Z")], now);
    expect(b).toMatchObject({ currency: "NGN", held: 500_000, payable: 700_000, paid: 300_000, payoutDue: false });
  });

  it("is due once payable reaches the minimum, with a clawback taken off", () => {
    expect(minPayout("NGN")).toBe(1_000_000);
    expect(balances([row("pending", 1_200_000, "2026-11-01T00:00:00Z")], now)[0].payoutDue).toBe(true);
    expect(balances([row("pending", 1_200_000, "2026-11-01T00:00:00Z"), row("pending", -300_000, "2026-11-05T00:00:00Z")], now)[0]).toMatchObject({ payable: 900_000, payoutDue: false });
  });

  it("keeps currencies apart, naira first", () => {
    const out = balances([row("pending", 100, "2026-11-01T00:00:00Z", "GHS"), row("pending", 100, "2026-11-01T00:00:00Z", "NGN")], now);
    expect(out.map((b) => b.currency)).toEqual(["NGN", "GHS"]);
  });

  it("writes the transfer sheet, defusing spreadsheet formulas", () => {
    const csv = payoutCsv([{ partner: '=Ada "Tips"', slug: "ada", bankName: "GTBank", accountNumber: "0123456789", accountName: "Ada O.", currency: "NGN", amountMinor: 1_234_500 }]);
    expect(csv.split("\n")[1]).toBe(`"'=Ada ""Tips""",ada,GTBank,0123456789,Ada O.,NGN,12345.00`);
  });
});
