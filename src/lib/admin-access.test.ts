import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS, NAV_SECTIONS, ROLES, ROLE_IDS, can, cleanRoles, dashboardsFor, emailView, leavesNoOwner, navFor, navMatch, permissionsFor,
  type Permission, type Role,
} from "./admin-access";

describe("roles", () => {
  it("gives the owner every permission", () => {
    expect([...permissionsFor(["owner"])].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("keeps money movement, the team and the audit trail with the owner alone", () => {
    const ownerOnly: Permission[] = ["finance.view", "finance.manage", "partners.payout", "team.manage", "audit.view"];
    for (const role of ROLE_IDS.filter((r) => r !== "owner")) {
      for (const p of ownerOnly) expect(can([role], p), `${role} ${p}`).toBe(false);
    }
  });

  it("gives each role what its job needs", () => {
    expect(can(["product"], "model.view")).toBe(true);
    expect(can(["product"], "codehub.manage")).toBe(true);
    expect(can(["product"], "outreach.manage")).toBe(false);
    expect(can(["marketing"], "partners.manage")).toBe(true);
    expect(can(["marketing"], "growth.view")).toBe(true);
    expect(can(["marketing"], "data.manage")).toBe(false);
    expect(can(["support"], "support.reply")).toBe(true);
    expect(can(["support"], "users.gift")).toBe(true);
    expect(can(["support"], "site.maintenance")).toBe(false);
  });

  it("does not show product full email addresses", () => {
    expect(can(["product"], "users.contact")).toBe(false);
  });

  it("unions the permissions of several roles", () => {
    const both = permissionsFor(["marketing", "support"]);
    expect(both.has("outreach.manage")).toBe(true);
    expect(both.has("support.reply")).toBe(true);
    expect(both.has("finance.view")).toBe(false);
  });

  it("names only known permissions in every role", () => {
    for (const role of ROLE_IDS) for (const p of ROLES[role].permissions) expect(ALL_PERMISSIONS).toContain(p);
  });

  it("leaves no permission unused outside the owner", () => {
    const used = new Set(ROLE_IDS.filter((r) => r !== "owner").flatMap((r) => ROLES[r].permissions));
    const ownerOnly = ALL_PERMISSIONS.filter((p) => !used.has(p)).sort();
    expect(ownerOnly).toEqual(["audit.view", "finance.manage", "finance.view", "model.manage", "partners.payout", "team.manage"]);
  });
});

describe("cleanRoles", () => {
  it("drops unknown values and duplicates, in catalogue order", () => {
    expect(cleanRoles(["support", "admin", "owner", "support", 3, null])).toEqual(["owner", "support"]);
  });
  it("never invents a role", () => {
    expect(cleanRoles(null)).toEqual([]);
    expect(cleanRoles([])).toEqual([]);
  });
});

describe("navFor", () => {
  const hrefs = (roles: Role[], hidden?: Set<string>) => navFor(roles, hidden).flatMap((s) => s.items.map((i) => i.href));

  it("shows the owner every page", () => {
    expect(hrefs(["owner"])).toEqual(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
  });

  it("shows every role its dashboard", () => {
    for (const role of ROLE_IDS) expect(hrefs([role])).toContain("/admin");
  });

  it("hides pages a role cannot open, and drops empty sections", () => {
    const marketing = navFor(["marketing"]);
    expect(marketing.map((s) => s.id)).toEqual(["overview", "business", "growth", "customers"]);
    expect(hrefs(["marketing"])).not.toContain("/admin/payments");
    expect(hrefs(["marketing"])).toContain("/admin/partners");
    expect(hrefs(["support"])).not.toContain("/admin/traffic");
  });

  it("drops items hidden for another reason", () => {
    expect(hrefs(["owner"], new Set(["/admin/mail"]))).not.toContain("/admin/mail");
  });
});

describe("navMatch", () => {
  it("matches nested paths to their page", () => {
    expect(navMatch("/admin/partners/abc")?.item.label).toBe("Partners");
    expect(navMatch("/admin/outreach/responses")?.section.label).toBe("Growth");
  });
  it("matches the dashboard only at its own path", () => {
    expect(navMatch("/admin")?.item.label).toBe("Dashboard");
    expect(navMatch("/admin/denied")).toBeNull();
  });
});

describe("dashboardsFor", () => {
  it("lets the owner open every dashboard", () => {
    expect(dashboardsFor(["owner"])).toEqual(["owner", "product", "marketing", "support"]);
  });
  it("gives other staff the dashboards of their roles", () => {
    expect(dashboardsFor(["product"])).toEqual(["product"]);
    expect(dashboardsFor(["marketing", "support"])).toEqual(["marketing", "support"]);
  });
});

describe("emailView", () => {
  it("masks emails for roles without contact access", () => {
    expect(emailView(["product"])("kentclarament25@gmail.com")).toBe("ke•••@gmail.com");
    expect(emailView(["product"])("a@x.com")).toBe("a•••@x.com");
    expect(emailView(["product"])(null)).toBeNull();
  });
  it("shows emails in full to roles with it", () => {
    expect(emailView(["support"])("kentclarament25@gmail.com")).toBe("kentclarament25@gmail.com");
  });
});

describe("leavesNoOwner", () => {
  const staff = [
    { id: "a", roles: ["owner"] as Role[] },
    { id: "b", roles: ["product"] as Role[] },
  ];
  it("refuses removing or demoting the last owner", () => {
    expect(leavesNoOwner(staff, "a", null)).toBe(true);
    expect(leavesNoOwner(staff, "a", ["product"])).toBe(true);
  });
  it("allows it when another owner remains", () => {
    expect(leavesNoOwner([...staff, { id: "c", roles: ["owner", "support"] }], "a", null)).toBe(false);
  });
  it("never blocks changes to someone who isn't an owner", () => {
    expect(leavesNoOwner(staff, "b", null)).toBe(false);
    expect(leavesNoOwner(staff, "b", ["marketing"])).toBe(false);
  });
  it("allows an owner to keep the role while gaining others", () => {
    expect(leavesNoOwner(staff, "a", ["owner", "support"])).toBe(false);
  });
});
