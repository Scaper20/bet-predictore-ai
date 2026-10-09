import { describe, expect, it } from "vitest";
import { mobileMenus, navFor } from "./nav";

describe("mobile menu sections", () => {
  const menus = mobileMenus(navFor("football").tabs.flatMap((t) => (t.kind === "menu" ? [t.menu] : [])));

  it("drops Predictions, leads with Matches and gives Insights its own tab", () => {
    expect(menus.map((m) => m.label)).toEqual(["Matches", "Insights", "Tools", "More"]);
    expect(menus[0].columns.flatMap((c) => c.links).map((l) => l.label)).toContain("Results");
    expect(menus[1].columns.flatMap((c) => c.links).map((l) => l.label)).toContain("Trends");
  });

  it("keeps Value Alerts reachable, under Tools", () => {
    const tools = menus.find((m) => m.id === "tools")!;
    expect(tools.columns.flatMap((c) => c.links).map((l) => l.label)).toContain("Value Alerts");
  });
});
