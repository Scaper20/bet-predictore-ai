/**
 * The arithmetic behind the admin dashboards, kept apart from the queries so
 * it can be tested on its own: day buckets on Lagos time, period-over-period
 * change, and turning a referrer or utm_source into a channel a marketer
 * recognises.
 */

const TZ = "Africa/Lagos";
const DAY_MS = 86_400_000;

/** yyyy-mm-dd in Lagos. */
export function lagosDay(at: string | number | Date): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** The last `n` Lagos days, oldest first, ending today. */
export function lastDays(n: number, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(lagosDay(now - i * DAY_MS));
  // Two instants a day apart can land on the same Lagos date around a clock
  // change elsewhere; Lagos has none, but keep the list unique regardless.
  return [...new Set(out)];
}

export interface DayPoint {
  day: string;
  value: number;
  note?: string;
}

/** Sum `value(row)` into each of the last `n` days; days with nothing are zero, rows outside the window are dropped. */
export function byDay<T>(rows: readonly T[], at: (row: T) => string, value: (row: T) => number = () => 1, n = 30, now = Date.now()): DayPoint[] {
  const days = lastDays(n, now);
  const sums = new Map(days.map((d) => [d, 0]));
  for (const r of rows) {
    const d = lagosDay(at(r));
    if (sums.has(d)) sums.set(d, (sums.get(d) ?? 0) + value(r));
  }
  return days.map((day) => ({ day, value: sums.get(day) ?? 0 }));
}

/** Relative change from `before` to `now`: 0.25 is +25%. Null when there is no base to compare with. */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return (now - before) / before;
}

/** Sum of `value(row)` for rows whose `at(row)` falls in [from, to). */
export function sumBetween<T>(rows: readonly T[], at: (row: T) => string, from: number, to: number, value: (row: T) => number = () => 1): number {
  let s = 0;
  for (const r of rows) {
    const t = Date.parse(at(r));
    if (t >= from && t < to) s += value(r);
  }
  return s;
}

/** Wins over graded (wins + losses), pushes and voids left out; null with nothing graded. */
export function hitRate(wins: number, losses: number): number | null {
  return wins + losses > 0 ? wins / (wins + losses) : null;
}

/* ---------------------------------------------------------------- channels */

const HOSTS: [RegExp, string][] = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)bing\.com$|duckduckgo\.com$|search\.yahoo\.com$|yandex\./, "Other search"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$|^com\.twitter\.android$/, "X"],
  [/(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(t\.me|telegram\.org)$/, "Telegram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com)$/, "AI assistants"],
];

const SOURCES: [RegExp, string][] = [
  // ChatGPT and the other assistants tag the links they cite (utm_source=chatgpt.com).
  [/chatgpt|openai|perplexity|claude|gemini|copilot/, "AI assistants"],
  [/^google/, "Google"],
  [/^(x|twitter|tw)$/, "X"],
  [/^(facebook|fb|meta)$/, "Facebook"],
  [/^(instagram|ig)$/, "Instagram"],
  [/^(whatsapp|wa)$/, "WhatsApp"],
  [/^tiktok$/, "TikTok"],
  [/^telegram$/, "Telegram"],
  [/^(email|newsletter|resend)$/, "Email"],
  [/^push$/, "Push"],
];

/**
 * The channel a signup came through, from first-touch attribution: a
 * deliberate utm_source wins (it is what marketing tagged), then the
 * referring host, then "Direct". Partner links are their own channel.
 */
export function channelOf(p: {
  signup_utm_source?: string | null;
  signup_referrer_host?: string | null;
  referred_by_partner?: string | null;
}): string {
  if (p.referred_by_partner) return "Partners";
  const src = p.signup_utm_source?.trim().toLowerCase();
  if (src) {
    for (const [re, label] of SOURCES) if (re.test(src)) return label;
    return src.length > 24 ? `${src.slice(0, 24)}…` : src;
  }
  const host = p.signup_referrer_host?.trim().toLowerCase().replace(/^www\./, "");
  if (host) {
    // Our own hosts, and Google's sign-in page bouncing someone back after
    // "Continue with Google", are not where they came from.
    if (/kiqstat|betrix/.test(host) || /^accounts\.google\./.test(host)) return "Direct";
    for (const [re, label] of HOSTS) if (re.test(host)) return label;
    return host;
  }
  return "Direct";
}

/** Count per key, largest first. */
export function rank<T>(rows: readonly T[], key: (row: T) => string, limit = 10): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

/** Hours between two instants, rounded down. */
export function hoursBetween(from: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(from)) / 3_600_000));
}

/** "14h", "3d 2h". */
export function ageText(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}
