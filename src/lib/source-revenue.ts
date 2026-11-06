import { classifySignup } from "@/lib/signup-quality";

/**
 * Where the money came from (CTO checklist 4.2): each paid order joined to the
 * first-touch source on its customer's profile, so a source is judged by what
 * it paid, not by how many signed up. Pure, so the grouping is tested; the
 * traffic page feeds it the profiles and successful payments.
 *
 * A profile carries its source from the first visit (referrer host plus UTM
 * tags). Accounts created before capture worked (to 26 Oct 2026) have none and
 * are their own row, "No data", so they never pass as direct traffic.
 */

export const NO_DATA = "No data (before capture)";
export const DIRECT = "Direct (no referrer)";

export interface SourceProfile {
  id: string;
  email: string | null;
  signupLandingPage: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
}

export interface PaidOrder {
  userId: string | null;
  /** Naira. */
  naira: number;
}

export interface SourceRow {
  source: string;
  signups: number;
  payers: number;
  orders: number;
  naira: number;
  /** payers / signups, 0 when there are no signups. */
  conversion: number;
}

export function sourceLabel(p: SourceProfile): string {
  if (!p.signupLandingPage && !p.referrerHost && !p.utmSource) return NO_DATA;
  if (p.utmSource) return p.utmMedium ? `${p.utmSource} / ${p.utmMedium}` : p.utmSource;
  return p.referrerHost ?? DIRECT;
}

export function revenueBySource(profiles: SourceProfile[], orders: PaidOrder[]): SourceRow[] {
  const people = profiles.filter((p) => classifySignup(p.email) === "real");
  const labelOf = new Map(people.map((p) => [p.id, sourceLabel(p)]));
  const rows = new Map<string, { signups: number; payers: Set<string>; orders: number; naira: number }>();
  const row = (label: string) => {
    let r = rows.get(label);
    if (!r) rows.set(label, (r = { signups: 0, payers: new Set(), orders: 0, naira: 0 }));
    return r;
  };
  for (const p of people) row(sourceLabel(p)).signups++;
  for (const o of orders) {
    const label = o.userId ? labelOf.get(o.userId) : undefined;
    if (!label) continue; // an internal or unknown account's order is not a customer source
    const r = row(label);
    r.payers.add(o.userId!);
    r.orders++;
    r.naira += o.naira;
  }
  return [...rows.entries()]
    .map(([source, r]) => ({
      source,
      signups: r.signups,
      payers: r.payers.size,
      orders: r.orders,
      naira: Math.round(r.naira),
      conversion: r.signups ? r.payers.size / r.signups : 0,
    }))
    .sort((a, b) => b.naira - a.naira || b.signups - a.signups);
}
