import { describe, expect, it } from "vitest";
import { ELSEWHERE, MARKETS, NIGERIA, formatMoney, marketFor, marketPrice, paymentAmount } from "./markets";
import { priceSaving } from "@/lib/pricing";

describe("markets", () => {
  it("finds a market by country and falls back to US dollars", () => {
    expect(marketFor("ng")).toBe(NIGERIA);
    expect(marketFor("KE").currency).toBe("KES");
    expect(marketFor("FR")).toBe(ELSEWHERE);
    expect(marketFor(null)).toBe(ELSEWHERE);
  });

  it("prices every plan and cycle wherever Flutterwave sells, cheaper per month on longer cycles", () => {
    for (const m of MARKETS.filter((x) => x.provider === "flutterwave")) {
      for (const tier of ["pro", "vip"] as const) {
        expect(marketPrice(m, tier, "monthly"), `${m.country} ${tier}`).toBeGreaterThan(0);
        expect(priceSaving(m.prices![tier], "quarterly")?.percent, `${m.country} ${tier} quarterly`).toBeGreaterThan(0);
        expect(priceSaving(m.prices![tier], "yearly")?.percent, `${m.country} ${tier} yearly`).toBeGreaterThan(0);
      }
      expect(marketPrice(m, "vip", "monthly")!).toBeGreaterThan(marketPrice(m, "pro", "monthly")!);
    }
    expect(marketPrice(NIGERIA, "pro", "monthly")).toBeUndefined();
  });

  it("shows a payment in the currency it was paid in", () => {
    expect(paymentAmount({ amount_kobo: 500_000 })).toBe("₦5,000");
    expect(paymentAmount({ amount_kobo: 0, currency: "KES", amount_minor: 50_000 })).toBe(formatMoney(500, "KES"));
    expect(formatMoney(4, "USD")).toBe("$4");
  });
});
