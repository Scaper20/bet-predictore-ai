import { describe, expect, it } from "vitest";
import { cycleSaving, planById, PLANS, PLAN_MATRIX } from "./pricing";
import { passLength } from "./paystack/pass-window";

describe("plan pricing", () => {
  it("prices the new structure", () => {
    expect(planById("pro").price).toEqual({ monthly: 5000, quarterly: 13500, yearly: 48000 });
    expect(planById("vip").price).toEqual({ monthly: 12000, yearly: 115200 });
  });

  it("computes what a longer cycle saves against monthly", () => {
    expect(cycleSaving(planById("pro"), "quarterly")).toEqual({ amount: 1500, percent: 10 });
    expect(cycleSaving(planById("pro"), "yearly")).toEqual({ amount: 12000, percent: 20 });
    expect(cycleSaving(planById("vip"), "yearly")).toEqual({ amount: 28800, percent: 20 });
    expect(cycleSaving(planById("vip"), "quarterly")).toBeNull();
  });

  it("no longer sells or compares the pass", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro", "vip"]);
    for (const g of PLAN_MATRIX) for (const r of g.rows) expect(Object.keys(r.values)).toEqual(["free", "pro", "vip"]);
  });

  it("still reads the length of a pass bought before the change", () => {
    expect(passLength("day")).toBe("day");
    expect(passLength("fortnight")).toBe("weekend");
    expect(passLength(undefined)).toBe("weekend");
  });
});

describe("plan copy matches the limits the app enforces", () => {
  it("quotes the real Forge and Ask allowances", async () => {
    const { FORGE_FREE_DAILY, FORGE_PAID_DAILY } = await import("./forge");
    const { ASK_FREE_DAILY, ASK_PAID_DAILY, ASK_VIP_DAILY } = await import("./ask/request");
    const row = (label: string) => PLAN_MATRIX.flatMap((g) => g.rows).find((r) => r.label === label)!.values;
    expect(row("Forge slip builder").free).toBe(`${FORGE_FREE_DAILY} a day, 1X2`);
    expect(row("Forge slip builder").pro).toBe(`${FORGE_PAID_DAILY} a day`);
    expect(row("Ask BetriX")).toEqual({ free: `${ASK_FREE_DAILY} a day`, pro: `${ASK_PAID_DAILY} a day`, vip: `${ASK_VIP_DAILY} a day` });
  });
});
