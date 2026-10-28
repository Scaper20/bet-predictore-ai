/**
 * Who on the team can see and do what in /admin.
 *
 * Shaped like the role-based access of Azure or Microsoft 365: a fixed
 * catalogue of permissions ("resource.action"), built-in roles that bundle
 * them, and people who hold one or more roles. A person's access is the union
 * of their roles. Nothing is granted to a person directly, so "what can the
 * marketing team do" always has one answer, readable on the Team page.
 *
 * The roles live here, in code, rather than in a table: they change with the
 * product (a new page needs a permission), get reviewed in a pull request,
 * and are covered by admin-access.test.ts. The database only records which
 * roles each person holds (admin_users.roles, 0081).
 *
 * Pure on purpose (no server-only import): the shell renders the nav from it
 * on the client, and the tests run it directly. It decides nothing on its own:
 * every page, action and route still checks on the server through
 * requirePermission / checkPermission in lib/admin.ts.
 */

export type Role = "owner" | "product" | "marketing" | "support";

export const ROLE_IDS: readonly Role[] = ["owner", "product", "marketing", "support"];

export type Permission =
  // People
  | "users.view"
  | "users.contact"
  | "users.gift"
  // Money
  | "finance.view"
  | "finance.manage"
  | "partners.view"
  | "partners.manage"
  | "partners.payout"
  // Growth
  | "growth.view"
  | "outreach.manage"
  | "whatsapp.manage"
  | "vip.manage"
  // Customers
  | "support.view"
  | "support.reply"
  | "feedback.view"
  | "mail.send"
  // Product and platform
  | "model.view"
  | "model.manage"
  | "data.view"
  | "data.manage"
  | "codehub.manage"
  | "sportybet.manage"
  | "site.maintenance"
  // Governance
  | "team.manage"
  | "audit.view";

export interface PermissionInfo {
  label: string;
  group: string;
  /** What holding it lets someone do, in one line. */
  detail: string;
}

export const PERMISSIONS: Record<Permission, PermissionInfo> = {
  "users.view": { group: "People", label: "View users", detail: "User list, plans and activity" },
  "users.contact": { group: "People", label: "See contact details", detail: "Full email addresses (others see them masked)" },
  "users.gift": { group: "People", label: "Gift plans", detail: "Grant a free Pro or VIP period" },
  "finance.view": { group: "Money", label: "View revenue", detail: "Payments, revenue and plan income" },
  "finance.manage": { group: "Money", label: "Manage payments", detail: "Expire stale checkouts" },
  "partners.view": { group: "Money", label: "View partners", detail: "Partner list, signups and commission owed" },
  "partners.manage": { group: "Money", label: "Manage partners", detail: "Add, edit, suspend partners, credit signups" },
  "partners.payout": { group: "Money", label: "Pay partners", detail: "Record payouts, reverse commission, export the sheet" },
  "growth.view": { group: "Growth", label: "View traffic", detail: "Channels, campaigns and signup attribution" },
  "outreach.manage": { group: "Growth", label: "Run email campaigns", detail: "Queue and send outreach, read survey answers" },
  "whatsapp.manage": { group: "Growth", label: "WhatsApp digest", detail: "Read and regenerate the daily digest" },
  "vip.manage": { group: "Growth", label: "VIP chat", detail: "Invite link and member list" },
  "support.view": { group: "Customers", label: "View tickets", detail: "Read support conversations" },
  "support.reply": { group: "Customers", label: "Answer tickets", detail: "Reply to and close tickets" },
  "feedback.view": { group: "Customers", label: "View feedback", detail: "Ratings and comments from the site" },
  "mail.send": { group: "Customers", label: "Send mail", detail: "Write from the support inbox (one named account)" },
  "model.view": { group: "Product", label: "Model performance", detail: "Hit rates, calibration and markets" },
  "model.manage": { group: "Product", label: "Headline engine", detail: "Choose which engine publishes the headline" },
  "data.view": { group: "Product", label: "View data health", detail: "Ingest runs, sources and coverage" },
  "data.manage": { group: "Product", label: "Manage data sources", detail: "Data layer switch, turn sources on and off" },
  "codehub.manage": { group: "Product", label: "Code Hub", detail: "Feature switches, parse.bot budget, remove posts" },
  "sportybet.manage": { group: "Product", label: "SportyBet matching", detail: "Link fixtures, sync and verify boards" },
  "site.maintenance": { group: "Product", label: "Maintenance mode", detail: "Take the public site down and back up" },
  "team.manage": { group: "Governance", label: "Manage team", detail: "Add staff, change roles, remove access" },
  "audit.view": { group: "Governance", label: "Audit log", detail: "Every change made in admin, by whom" },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface RoleInfo {
  label: string;
  short: string;
  description: string;
  permissions: readonly Permission[];
}

/*
 * Least privilege. The owner holds everything. The others get what their job
 * needs and no more: money movement, team changes, the audit trail and
 * which engine publishes the headline stay with the owner; product owns the
 * model's numbers, data and operational switches; marketing owns
 * acquisition and the partner programme; support owns the inbox.
 */
export const ROLES: Record<Role, RoleInfo> = {
  owner: {
    label: "Owner",
    short: "OWN",
    description: "Full access, including money, team and the audit trail.",
    permissions: ALL_PERMISSIONS,
  },
  product: {
    label: "Product manager",
    short: "PM",
    description: "Model quality, data pipeline, Code Hub, feature switches and what users say.",
    permissions: [
      "users.view",
      "growth.view",
      "support.view",
      "feedback.view",
      "model.view",
      "data.view",
      "data.manage",
      "codehub.manage",
      "sportybet.manage",
      "site.maintenance",
    ],
  },
  marketing: {
    label: "Marketing",
    short: "MKT",
    description: "Acquisition, campaigns, partners and community channels.",
    permissions: [
      "users.view",
      "users.contact",
      "growth.view",
      "outreach.manage",
      "whatsapp.manage",
      "vip.manage",
      "partners.view",
      "partners.manage",
      "feedback.view",
    ],
  },
  support: {
    label: "Support",
    short: "SUP",
    description: "Tickets, user lookups, goodwill gifts and the VIP chat.",
    permissions: [
      "users.view",
      "users.contact",
      "users.gift",
      "support.view",
      "support.reply",
      "feedback.view",
      "mail.send",
      "vip.manage",
    ],
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);
}

/** Known roles only, de-duplicated, in catalogue order. Unknown strings are dropped, never trusted. */
export function cleanRoles(values: readonly unknown[] | null | undefined): Role[] {
  const held = new Set((values ?? []).filter(isRole));
  return ROLE_IDS.filter((r) => held.has(r));
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLES[role]?.permissions ?? []) out.add(p);
  return out;
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

/** "Owner", "Product manager + Support". */
export function rolesLabel(roles: readonly Role[]): string {
  return roles.length ? roles.map((r) => ROLES[r].label).join(" + ") : "No role";
}

/* --------------------------------------------------------------- navigation */

export type NavIcon =
  | "grid" | "card" | "handshake" | "chart" | "send" | "chat" | "crown" | "users" | "inbox"
  | "star" | "mail" | "target" | "pulse" | "code" | "link" | "power" | "shield" | "log";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Absent for the dashboard, which every staff member has (tailored to their roles). */
  permission?: Permission;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: "grid" }] },
  {
    id: "business",
    label: "Business",
    items: [
      { href: "/admin/payments", label: "Payments", icon: "card", permission: "finance.view" },
      { href: "/admin/partners", label: "Partners", icon: "handshake", permission: "partners.view" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: "/admin/traffic", label: "Traffic", icon: "chart", permission: "growth.view" },
      { href: "/admin/outreach", label: "Outreach", icon: "send", permission: "outreach.manage" },
      { href: "/admin/whatsapp-digest", label: "WhatsApp digest", icon: "chat", permission: "whatsapp.manage" },
      { href: "/admin/vip-chat", label: "VIP chat", icon: "crown", permission: "vip.manage" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { href: "/admin/users", label: "Users", icon: "users", permission: "users.view" },
      { href: "/admin/tickets", label: "Tickets", icon: "inbox", permission: "support.view" },
      { href: "/admin/feedback", label: "Feedback", icon: "star", permission: "feedback.view" },
      { href: "/admin/mail", label: "Mail", icon: "mail", permission: "mail.send" },
    ],
  },
  {
    id: "product",
    label: "Product",
    items: [
      { href: "/admin/model-performance", label: "Model performance", icon: "target", permission: "model.view" },
      { href: "/admin/publishing", label: "Publishing", icon: "power", permission: "model.view" },
      { href: "/admin/data-health", label: "Data health", icon: "pulse", permission: "data.view" },
      { href: "/admin/parsebot", label: "Code Hub & parse.bot", icon: "code", permission: "codehub.manage" },
      { href: "/admin/sportybet", label: "SportyBet matching", icon: "link", permission: "sportybet.manage" },
      { href: "/admin/maintenance", label: "Maintenance", icon: "power", permission: "site.maintenance" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/admin/team", label: "Team & roles", icon: "shield", permission: "team.manage" },
      { href: "/admin/audit-log", label: "Audit log", icon: "log", permission: "audit.view" },
    ],
  },
];

/**
 * The sections and items this person can open, empty sections dropped.
 * `hidden` drops items the roles allow but something else rules out (Mail is
 * also limited to one named account; see lib/admin-mail.ts).
 */
export function navFor(roles: readonly Role[], hidden: ReadonlySet<string> = new Set()): NavSection[] {
  const held = permissionsFor(roles);
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !hidden.has(i.href) && (!i.permission || held.has(i.permission))),
  })).filter((s) => s.items.length > 0);
}

/** The nav entry a path sits under, for the breadcrumb: "/admin/partners/abc" → Partners. */
export function navMatch(pathname: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const hit = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.item.href.length)) best = { section, item };
    }
  }
  return best;
}

/* --------------------------------------------------------------- dashboards */

/** Each role's home view. The owner can open every one of them. */
export type DashboardView = "owner" | "product" | "marketing" | "support";

export const DASHBOARD_LABEL: Record<DashboardView, string> = {
  owner: "Command center",
  product: "Product",
  marketing: "Growth",
  support: "Support desk",
};

/** The dashboards this person can open, their first role's first. */
export function dashboardsFor(roles: readonly Role[]): DashboardView[] {
  if (roles.includes("owner")) return ["owner", "product", "marketing", "support"];
  return roles.filter((r): r is Exclude<Role, "owner"> => r !== "owner");
}

/* ------------------------------------------------------------ contact details */

/** "kentclarament25@gmail.com" → "ke•••@gmail.com". Enough to tell two people apart, not to write to them. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

/** How this person sees an email: in full with users.contact, masked without. */
export function emailView(roles: readonly Role[]): (email: string | null | undefined) => string | null {
  return can(roles, "users.contact") ? (e) => e ?? null : maskEmail;
}

/* ---------------------------------------------------------------- team rules */

/**
 * Whether a change to the team would leave nobody holding the owner role:
 * removing the last owner, or taking the role off them. Refused, because
 * only an owner can manage the team, so nobody could undo it from /admin.
 * `next` is the person's new roles, or null when they are being removed.
 */
export function leavesNoOwner(staff: readonly { id: string; roles: readonly Role[] }[], targetId: string, next: readonly Role[] | null): boolean {
  const owners = staff.filter((s) => s.roles.includes("owner")).map((s) => s.id);
  if (!owners.includes(targetId)) return false;
  if (next && next.includes("owner")) return false;
  return owners.length <= 1;
}
