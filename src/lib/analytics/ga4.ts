import "server-only";
import { createSign } from "node:crypto";
import { cached } from "@/lib/providers/cache";
import { RANGE_DAYS, settle, type DailyPoint, type Ranked, type SourceResult } from "./types";

/**
 * Google Analytics 4, read through the GA4 Data API with a service account
 * (the gtag in the root layout collects; this reads it back).
 *
 * Needs GA4_PROPERTY_ID (the numeric property id, not the G- measurement
 * id), GA4_SERVICE_ACCOUNT_EMAIL and GA4_SERVICE_ACCOUNT_KEY (the PEM
 * private key from the account's JSON key; "\n" escapes are accepted). The
 * account needs Viewer access on the property.
 */

export interface GoogleTraffic {
  users: number;
  sessions: number;
  views: number;
  engagementRate: number;
  prevUsers: number;
  prevSessions: number;
  dailyUsers: DailyPoint[];
  channels: Ranked[];
  sources: Ranked[];
  landingPages: Ranked[];
  countries: Ranked[];
}

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A one-hour OAuth access token from a signed service-account JWT. */
async function accessToken(email: string, key: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claims}.${b64url(signature)}`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google sign-in ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

interface Report {
  rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[];
}

const range = { startDate: `${RANGE_DAYS - 1}daysAgo`, endDate: "today" };
const prevRange = { startDate: `${2 * RANGE_DAYS - 1}daysAgo`, endDate: `${RANGE_DAYS}daysAgo` };

function top(dimension: string, metric: string, limit = 8) {
  return {
    dateRanges: [range],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit: String(limit),
  };
}

const rankedRows = (r: Report): Ranked[] =>
  (r.rows ?? []).map((row) => ({ label: row.dimensionValues?.[0]?.value || "(not set)", value: Number(row.metricValues[0].value) }));

async function load(property: string, email: string, key: string): Promise<GoogleTraffic> {
  const token = await accessToken(email, key);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // batchRunReports takes at most five.
      requests: [
        {
          dateRanges: [range, prevRange],
          metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "engagementRate" }],
        },
        {
          dateRanges: [range],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
        top("sessionDefaultChannelGroup", "sessions"),
        top("sessionSource", "sessions"),
        top("landingPage", "sessions"),
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const [totals, daily, channels, sources, landing] = ((await res.json()) as { reports: Report[] }).reports;

  // With two date ranges every row carries a dateRange dimension: date_range_0 is the current period.
  const period = (name: string) => totals.rows?.find((r) => r.dimensionValues?.[0]?.value === name)?.metricValues.map((m) => Number(m.value)) ?? [0, 0, 0, 0];
  const [users, sessions, views, engagementRate] = period("date_range_0");
  const [prevUsers, prevSessions] = period("date_range_1");

  const countries = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(top("country", "activeUsers")),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).then(async (r) => (r.ok ? ((await r.json()) as Report) : {}));

  return {
    users,
    sessions,
    views,
    engagementRate,
    prevUsers,
    prevSessions,
    dailyUsers: (daily.rows ?? []).map((r) => {
      const d = r.dimensionValues![0].value; // yyyymmdd
      return { day: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, value: Number(r.metricValues[0].value) };
    }),
    channels: rankedRows(channels),
    sources: rankedRows(sources),
    landingPages: rankedRows(landing),
    countries: rankedRows(countries),
  };
}

export async function getGoogleTraffic(): Promise<SourceResult<GoogleTraffic>> {
  const env = {
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
    GA4_SERVICE_ACCOUNT_EMAIL: process.env.GA4_SERVICE_ACCOUNT_EMAIL,
    GA4_SERVICE_ACCOUNT_KEY: process.env.GA4_SERVICE_ACCOUNT_KEY,
  };
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { state: "unconfigured", missing };
  return settle(() =>
    cached("traffic:ga4", 10 * 60_000, () => load(env.GA4_PROPERTY_ID!, env.GA4_SERVICE_ACCOUNT_EMAIL!, env.GA4_SERVICE_ACCOUNT_KEY!)),
  );
}
