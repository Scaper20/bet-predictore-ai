import { describe, expect, it } from "vitest";
import { ELSEWHERE, MARKETS, NIGERIA, REFERENCE_RATES, formatMoney, marketFor, marketPrice, paymentAmount } from "./markets";
import { planById, priceSaving, type BillingCycle } from "@/lib/pricing";

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

  it("prices every market above Nigeria, and US dollars above every market", () => {
    const inUsd = (amount: number, currency: string) => amount / REFERENCE_RATES[currency];
    for (const tier of ["pro", "vip"] as const) {
      for (const cycle of ["monthly", "quarterly", "yearly"] as BillingCycle[]) {
        const nigeria = inUsd(planById(tier).price[cycle]!, "NGN");
        const dollars = marketPrice(ELSEWHERE, tier, cycle)!;
        expect(dollars, `${tier} ${cycle} in USD`).toBeGreaterThan(nigeria * 2);
        for (const m of MARKETS.filter((x) => x.provider === "flutterwave" && x !== ELSEWHERE)) {
          expect(REFERENCE_RATES[m.currency], m.currency).toBeGreaterThan(0);
          const local = inUsd(marketPrice(m, tier, cycle)!, m.currency);
          // A clear margin both ways, so an ordinary currency swing doesn't flip the order.
          expect(local, `${m.country} ${tier} ${cycle} vs Nigeria`).toBeGreaterThan(nigeria * 1.4);
          expect(local, `${m.country} ${tier} ${cycle} vs USD`).toBeLessThan(dollars * 0.85);
        }
      }
    }
  });

  it("shows a payment in the currency it was paid in", () => {
    expect(paymentAmount({ amount_kobo: 500_000 })).toBe("₦5,000");
    expect(paymentAmount({ amount_kobo: 0, currency: "KES", amount_minor: 50_000 })).toBe(formatMoney(500, "KES"));
    expect(formatMoney(10, "USD")).toBe("$10");
  });
});
