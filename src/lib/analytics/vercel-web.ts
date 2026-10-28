import "server-only";
import { cached } from "@/lib/providers/cache";
import { RANGE_DAYS, settle, type DailyPoint, type Ranked, type SourceResult } from "./types";

/**
 * Vercel Web Analytics, read through Vercel's REST API: the anonymous
 * visitor and pageview counts the <Analytics /> beacon in the root layout
 * collects (production only).
 *
 * Needs VERCEL_ANALYTICS_TOKEN, a Vercel access token with read access to
 * the team. The project and team default to KiqStat's own.
 */

const API = "https://api.vercel.com/v1/query/web-analytics/visits";
const PROJECT_ID = process.env.VERCEL_ANALYTICS_PROJECT_ID || "prj_ewuKTTmXjbWaXwAqEwe3xUGqr3co";
const TEAM_ID = process.env.VERCEL_ANALYTICS_TEAM_ID || "team_J7Ae00VGrZhWW2Jfnth1rrnJ";

export interface VercelTraffic {
  visitors: number;
  pageviews: number;
  prevVisitors: number;
  prevPageviews: number;
  dailyVisitors: DailyPoint[];
  dailyPageviews: DailyPoint[];
  referrers: Ranked[];
  pages: Ranked[];
  countries: Ranked[];
  devices: Ranked[];
}

interface Row {
  timestamp?: string;
  visitors: number;
  pageviews: number;
  [dim: string]: string | number | undefined;
}

async function get<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const qs = new URLSearchParams({ projectId: PROJECT_ID, teamId: TEAM_ID, ...params });
  const res = await fetch(`${API}/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Vercel ${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { data: T }).data;
}

function ranked(rows: Row[], dim: string, blank: string): Ranked[] {
  return rows
    .map((r) => ({ label: String(r[dim] || blank), value: r.visitors }))
    .sort((a, b) => b.value - a.value);
}

async function load(token: string): Promise<VercelTraffic> {
  const now = Date.now();
  const day = 86_400_000;
  const since = new Date(now - RANGE_DAYS * day).toISOString();
  const prevSince = new Date(now - 2 * RANGE_DAYS * day).toISOString();
  const until = new Date(now).toISOString();
  const by = (dim: string, limit = 8) => get<Row[]>("aggregate", { by: dim, since, until, limit: String(limit) }, token);

  const [count, prev, daily, referrers, pages, countries, devices] = await Promise.all([
    get<{ visitors: number; pageviews: number }>("count", { since, until }, token),
    get<{ visitors: number; pageviews: number }>("count", { since: prevSince, until: since }, token),
    by("day", 100),
    by("referrerHostname"),
    by("requestPath"),
    by("country"),
    by("deviceType", 5),
  ]);
  const days = daily.filter((r) => r.timestamp).sort((a, b) => a.timestamp!.localeCompare(b.timestamp!));
  return {
    visitors: count.visitors,
    pageviews: count.pageviews,
    prevVisitors: prev.visitors,
    prevPageviews: prev.pageviews,
    dailyVisitors: days.map((r) => ({ day: r.timestamp!.slice(0, 10), value: r.visitors })),
    dailyPageviews: days.map((r) => ({ day: r.timestamp!.slice(0, 10), value: r.pageviews })),
    referrers: ranked(referrers, "referrerHostname", "Direct / none"),
    pages: ranked(pages, "requestPath", "(unknown)"),
    countries: ranked(countries, "country", "Unknown"),
    devices: ranked(devices, "deviceType", "Unknown"),
  };
}

export async function getVercelTraffic(): Promise<SourceResult<VercelTraffic>> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) return { state: "unconfigured", missing: ["VERCEL_ANALYTICS_TOKEN"] };
  return settle(() => cached("traffic:vercel", 10 * 60_000, () => load(token)));
}
