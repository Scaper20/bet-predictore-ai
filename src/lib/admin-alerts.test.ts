import { describe, expect, it } from "vitest";
import { alertsFor, openableAlerts } from "./admin-alerts";

const hub = (name: string, odds: number, target: number, booked = true) => ({ name, odds, target, share: odds / target, booked });

describe("alertsFor", () => {
  it("is quiet when nothing is wrong", () => {
    expect(
      alertsFor({
        tickets: { open: 2, oldestOpenH: 5 },
        ingest: { failed24h: 0, partial24h: 3, resultsAgeH: 2 },
        hub: [hub("Steady 2", 2.05, 2)],
        hubTiers: 1,
        lagosHour: 10,
        checkout: { started: 20, paid: 12 },
      }),
    ).toEqual([]);
  });

  it("flags a Code Hub code booked short of its name", () => {
    const a = alertsFor({ hub: [hub("Stretch 10", 6.22, 10), hub("Steady 2", 1.95, 2)] });
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe("Stretch 10 booked at 6.22, 62% of its odds");
  });

  it("folds several short codes into one alert, worst named first", () => {
    const a = alertsFor({ hub: [hub("Steady 2", 1.6, 2), hub("Stretch 10", 6.22, 10), hub("Long shot 20", 10.19, 20)] });
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe("3 of 3 Code Hub codes booked short of their odds");
    expect(a[0].detail).toBe("Worst: Long shot 20 at 10.19 (51%), Stretch 10 at 6.22 (62%).");
  });

  it("flags old tickets, worse after three days", () => {
    expect(alertsFor({ tickets: { open: 1, oldestOpenH: 30 } })[0].tone).toBe("amber");
    expect(alertsFor({ tickets: { open: 3, oldestOpenH: 80 } })[0].tone).toBe("rose");
  });

  it("flags stalled results and failed runs", () => {
    const a = alertsFor({ ingest: { failed24h: 2, partial24h: 0, resultsAgeH: 30 } });
    expect(a.map((x) => x.tone)).toEqual(["rose", "rose"]);
  });

  it("flags a low checkout completion only with enough checkouts", () => {
    expect(alertsFor({ checkout: { started: 6, paid: 1 } })).toEqual([]);
    expect(alertsFor({ checkout: { started: 60, paid: 12 } })[0].title).toBe("20% of checkouts completed (30d)");
  });

  it("notes missing codes only after the morning build", () => {
    expect(alertsFor({ hub: [hub("Steady 2", 2, 2)], hubTiers: 5, lagosHour: 6 })).toEqual([]);
    expect(alertsFor({ hub: [hub("Steady 2", 2, 2)], hubTiers: 5, lagosHour: 9 })[0].title).toBe("1 of 5 Code Hub codes built today");
  });

  it("puts the worst first", () => {
    const a = alertsFor({ hub: [hub("Stretch 10", 6, 10)], maintenance: true });
    expect(a[0].tone).toBe("rose");
  });
});

describe("openableAlerts", () => {
  it("keeps the alert but drops a link the viewer can't open", () => {
    const [a] = openableAlerts([{ tone: "amber", title: "x", href: "/admin/payments" }], () => false);
    expect(a).toEqual({ tone: "amber", title: "x", href: undefined });
  });
});
