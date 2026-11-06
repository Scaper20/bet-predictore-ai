import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/pricing";
import { pricingJsonLd } from "./pricing-jsonld";

describe("pricingJsonLd", () => {
  const ld = pricingJsonLd(PLANS, "https://x.test", "https://x.test/pricing");
  const offers = ld.offers as { name: string; price: string; priceCurrency: string }[];
  it("lists the free plan and every paid cycle in naira", () => {
    expect(offers[0]).toMatchObject({ name: "Free", price: "0" });
    expect(offers.every((o) => o.priceCurrency === "NGN")).toBe(true);
    const pro = PLANS.find((p) => p.id === "pro")!;
    expect(offers.find((o) => o.name === "Pro, monthly")?.price).toBe(String(pro.price.monthly));
  });
  it("never lists an unpriced plan as a paid offer", () => {
    expect(offers.filter((o) => o.price === "0")).toHaveLength(1);
  });
});
