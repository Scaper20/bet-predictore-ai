/**
 * What on a dashboard wants someone's attention today, worst first.
 *
 * Pure, so the thresholds are tested (admin-alerts.test.ts) rather than
 * buried in a page. Each rule says why it exists; a rule that fires every day
 * teaches people to ignore the panel, so the thresholds lean towards quiet.
 */

export interface AlertItem {
  tone: "rose" | "amber" | "cyan";
  title: string;
  detail?: string;
  href?: string;
}

export interface AlertInputs {
  tickets?: { open: number; oldestOpenH: number | null };
  ingest?: { failed24h: number; partial24h: number; resultsAgeH: number | null };
  hub?: { name: string; odds: number; target: number; share: number; booked: boolean }[];
  /** How many tiers the Code Hub builds a day; fewer codes than this after the morning build is a gap. */
  hubTiers?: number;
  /** Lagos hour now, 0-23: the morning build runs before 07:00. */
  lagosHour?: number;
  checkout?: { started: number; paid: number };
  maintenance?: boolean;
  minShare?: number;
}

const ORDER = { rose: 0, amber: 1, cyan: 2 } as const;

export function alertsFor(i: AlertInputs): AlertItem[] {
  const out: AlertItem[] = [];

  if (i.maintenance) {
    out.push({ tone: "rose", title: "The public site is in maintenance", detail: "Visitors see the back-soon page.", href: "/admin/maintenance" });
  }

  // A day-old unanswered ticket is a customer who has given up waiting.
  if (i.tickets && i.tickets.open > 0 && (i.tickets.oldestOpenH ?? 0) >= 24) {
    out.push({
      tone: (i.tickets.oldestOpenH ?? 0) >= 72 ? "rose" : "amber",
      title: `${i.tickets.open} open ${i.tickets.open === 1 ? "ticket" : "tickets"}, oldest ${i.tickets.oldestOpenH}h`,
      detail: "Waiting on a reply from us.",
      href: "/admin/tickets",
    });
  }

  if (i.ingest) {
    if (i.ingest.failed24h > 0) {
      out.push({ tone: "rose", title: `${i.ingest.failed24h} failed data ${i.ingest.failed24h === 1 ? "run" : "runs"} in 24h`, detail: "Fixtures, results or tables may be stale.", href: "/admin/data-health" });
    }
    // Results run hourly through the match window and early each morning; a
    // day without one means settlement and the track record stall.
    if (i.ingest.resultsAgeH !== null && i.ingest.resultsAgeH >= 26) {
      out.push({ tone: "rose", title: `No results run for ${i.ingest.resultsAgeH}h`, detail: "Picks can't settle until results land.", href: "/admin/data-health" });
    }
  }

  if (i.hub) {
    const min = i.minShare ?? 0.9;
    // One alert however many codes are short: they share a cause.
    const short = i.hub.filter((c) => c.share < min).sort((a, b) => a.share - b.share);
    const at = (c: (typeof short)[number]) => `${c.name} at ${c.odds.toFixed(2)} (${Math.round(c.share * 100)}%)`;
    if (short.length === 1) {
      out.push({
        tone: "amber",
        title: `${short[0].name} booked at ${short[0].odds.toFixed(2)}, ${Math.round(short[0].share * 100)}% of its odds`,
        detail: "Published short of the price it's named for.",
        href: "/admin/parsebot",
      });
    } else if (short.length > 1) {
      out.push({
        tone: "amber",
        title: `${short.length} of ${i.hub.length} Code Hub codes booked short of their odds`,
        detail: `Worst: ${short.slice(0, 2).map(at).join(", ")}.`,
        href: "/admin/parsebot",
      });
    }
    const unbooked = i.hub.filter((c) => !c.booked).length;
    if (unbooked > 0) out.push({ tone: "amber", title: `${unbooked} of today's codes have no booking code`, href: "/admin/parsebot" });
    if (i.hubTiers && (i.lagosHour ?? 12) >= 8 && i.hub.length < i.hubTiers) {
      out.push({ tone: "cyan", title: `${i.hub.length} of ${i.hubTiers} Code Hub codes built today`, detail: "A tier with no build in reach of its odds is left out.", href: "/admin/parsebot" });
    }
  }

  // Below a third completing, with enough checkouts to mean something.
  if (i.checkout && i.checkout.started >= 10 && i.checkout.paid / i.checkout.started < 1 / 3) {
    out.push({
      tone: "amber",
      title: `${Math.round((i.checkout.paid / i.checkout.started) * 100)}% of checkouts completed (30d)`,
      detail: `${i.checkout.paid} paid of ${i.checkout.started} started.`,
      href: "/admin/payments",
    });
  }

  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}

/** Drop alerts that point at pages this person can't open, so nobody is sent to a 403. */
export function openableAlerts(alerts: AlertItem[], canOpen: (href: string) => boolean): AlertItem[] {
  return alerts.map((a) => (a.href && !canOpen(a.href) ? { ...a, href: undefined } : a));
}
