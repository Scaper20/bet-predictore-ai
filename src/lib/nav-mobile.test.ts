import { describe, expect, it } from "vitest";
import { drawerMenus } from "./nav";

describe("mobile menu sections", () => {
  const menus = drawerMenus("football");

  it("drops Predictions, leads with Matches and gives Insights its own tab", () => {
    expect(menus.map((m) => m.label)).toEqual(["Matches", "Insights", "Tools", "More"]);
    expect(menus[0].columns.flatMap((c) => c.links).map((l) => l.label)).toContain("Results");
    expect(menus[1].columns.flatMap((c) => c.links).map((l) => l.label)).toContain("Trends");
  });

  it("groups the Code Hub pages, Forge and My combos under Tools", () => {
    const tools = menus.find((m) => m.id === "tools")!;
    expect(tools.columns.flatMap((c) => c.links).map((l) => l.label)).toEqual(["Code Hub", "Code editor", "Code community", "Forge", "My combos"]);
  });
});
