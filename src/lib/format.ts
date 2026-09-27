/** Presentation helpers shared across server and client components. */

import type { Match } from "@/lib/types";

/** Nigeria runs on WAT (UTC+1) year round, with no daylight saving. */
export const APP_TIMEZONE = "Africa/Lagos";

export function kickoffTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP_TIMEZONE,
  });
}

export function kickoffDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  });
}

/** "Today" / "Tomorrow" / "Sat 23 Aug", in Lagos time. */
export function relativeDay(iso: string, now = new Date()): string {
  const dayKey = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
  const target = dayKey(new Date(iso));
  if (target === dayKey(now)) return "Today";
  if (target === dayKey(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return kickoffDay(iso);
}

export function percent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function odds(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

/** Naira, with no decimals — nobody prices a subscription in kobo. */
export function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function isLive(m: Match): boolean {
  return m.status === "live" || m.status === "halftime";
}

export function statusLabel(m: Match): string {
  switch (m.status) {
    case "live":
      return m.minute ? `${m.minute}'` : "LIVE";
    case "halftime":
      return "HT";
    case "finished":
      return "FT";
    case "postponed":
      return "PP";
    case "cancelled":
      return "CANC";
    default:
      return kickoffTime(m.kickoff);
  }
}

/**
 * Group fixtures under a date heading.
 *
 * This used to preserve the incoming order, which comes from compareMatches —
 * and that ranks league importance above kickoff time, so a Premier League tie
 * three days out sorted ahead of everything today and the page rendered
 * "Tomorrow" above "Today". A date heading is a calendar, not a ranking, so
 * order the groups chronologically and order within each group the same way,
 * with live games pinned to the top of the day they actually belong to rather
 * than hoisted out of it.
 */
export function groupByDay(matches: Match[]): { day: string; matches: Match[] }[] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = relativeDay(m.kickoff);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  return [...groups.entries()]
    .map(([day, list]) => ({
      day,
      matches: [...list].sort(
        (a, b) =>
          (isLive(a) ? 0 : 1) - (isLive(b) ? 0 : 1) ||
          Date.parse(a.kickoff) - Date.parse(b.kickoff),
      ),
    }))
    .sort((a, b) => earliestKickoff(a.matches) - earliestKickoff(b.matches));
}

function earliestKickoff(matches: Match[]): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const m of matches) {
    const t = Date.parse(m.kickoff);
    if (Number.isFinite(t) && t < earliest) earliest = t;
  }
  return earliest;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
