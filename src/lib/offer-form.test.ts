import { describe, expect, it } from "vitest";
import { parseOfferForm, toLagosInput } from "./offer-form";

function form(over: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base = {
    slug: "vip-day",
    name: "Day pass",
    audience: "new_visitors",
    tier: "vip",
    hours: "24",
    price: "₦500",
    compare: "12,000",
    window: "24",
    max: "1",
    starts: "",
    ends: "",
    headline: "VIP for 24 hours",
    subline: "",
    cta: "",
    perks: "One\n\n Two \nThree",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}

describe("parseOfferForm", () => {
  it("reads a good form, cleaning numbers and perks", () => {
    const r = parseOfferForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.priceNaira).toBe(500);
    expect(r.offer.compareNaira).toBe(12000);
    expect(r.offer.perks).toEqual(["One", "Two", "Three"]);
    expect(r.offer.cta).toBe("Get it");
    expect(r.offer.subline).toBeNull();
  });
  it("refuses bad slugs, prices and windows", () => {
    expect(parseOfferForm(form({ slug: "Bad Slug" })).ok).toBe(false);
    expect(parseOfferForm(form({ price: "20" })).ok).toBe(false);
    expect(parseOfferForm(form({ window: "" })).ok).toBe(false);
    expect(parseOfferForm(form({ audience: "email", window: "" })).ok).toBe(true);
    expect(parseOfferForm(form({ hours: "1.5" })).ok).toBe(false);
  });
  it("reads dates as Lagos time and wants the end after the start", () => {
    const r = parseOfferForm(form({ starts: "2026-11-01T09:00", ends: "2026-11-02T09:00" }));
    expect(r.ok && r.offer.startsAt).toBe("2026-11-01T08:00:00.000Z");
    expect(parseOfferForm(form({ starts: "2026-11-02T09:00", ends: "2026-11-01T09:00" })).ok).toBe(false);
    expect(toLagosInput("2026-11-01T08:00:00.000Z")).toBe("2026-11-01T09:00");
  });
});
