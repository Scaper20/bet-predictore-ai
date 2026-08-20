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

/** Group fixtures under a date heading, preserving the incoming order. */
export function groupByDay(matches: Match[]): { day: string; matches: Match[] }[] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = relativeDay(m.kickoff);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, matches: list }));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
