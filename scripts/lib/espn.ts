/**
 * ESPN's public soccer scoreboard, for the offline labs: final scores with
 * shots and shots on target per team, cached on disk one file per league.
 *
 * One request per match date. Each season's calendar (the dates with games)
 * comes back with any scoreboard response, so only those dates are asked
 * for. Date ranges are not supported by the endpoint.
 */

import fs from "node:fs";
import path from "node:path";
import { CACHE } from "./football-data-uk";

export interface EspnGame {
  slug: string;
  date: number;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hsot?: number;
  asot?: number;
  hs?: number;
  as?: number;
}

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

interface CalendarEntry {
  value?: string;
  startDate?: string;
  endDate?: string;
  /** Cups: the season's stages, each a date range rather than match dates. */
  entries?: CalendarEntry[];
}

interface Scoreboard {
  events?: { date: string; competitions?: { status?: { type?: { completed?: boolean } }; competitors: Competitor[] }[] }[];
  leagues?: { calendar?: (string | CalendarEntry)[] }[];
}

interface Competitor {
  homeAway: "home" | "away";
  score?: string;
  team: { displayName: string };
  statistics?: { name: string; displayValue?: string }[];
}

async function get(url: string): Promise<Scoreboard | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return (await r.json()) as Scoreboard;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

function parse(slug: string, data: Scoreboard | null): EspnGame[] {
  const out: EspnGame[] = [];
  for (const e of data?.events ?? []) {
    const c = e.competitions?.[0];
    if (!c || c.status?.type?.completed !== true) continue;
    const comps = c.competitors;
    const h = comps.find((x) => x.homeAway === "home");
    const a = comps.find((x) => x.homeAway === "away");
    if (!h || !a) continue;
    const stat = (x: Competitor, n: string) => {
      const v = Number(x.statistics?.find((s) => s.name === n)?.displayValue);
      return Number.isFinite(v) ? v : undefined;
    };
    const hg = Number(h.score), ag = Number(a.score);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    out.push({
      slug,
      date: Date.parse(e.date),
      home: h.team.displayName,
      away: a.team.displayName,
      hg,
      ag,
      hsot: stat(h, "shotsOnTarget"),
      asot: stat(a, "shotsOnTarget"),
      hs: stat(h, "totalShots"),
      as: stat(a, "totalShots"),
    });
  }
  return out;
}

/** Every finished game in the league over the last `days`, from cache or ESPN. */
export async function espnGames(slug: string, days = 900): Promise<EspnGame[]> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `espn-${slug}.json`);
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 86_400_000;
  if (fresh) return JSON.parse(fs.readFileSync(file, "utf8")) as EspnGame[];

  const from = Date.now() - days * 86_400_000;
  // Probe a date in each year to collect the season calendars.
  const dates = new Set<string>();
  const now = new Date();
  for (let y = now.getUTCFullYear() - 3; y <= now.getUTCFullYear(); y++) {
    for (const md of ["0301", "0901"]) {
      const data = await get(`${BASE}/${slug}/scoreboard?dates=${y}${md}`);
      for (const l of data?.leagues ?? []) {
        for (const c of l.calendar ?? []) {
          if (typeof c === "string") {
            const t = Date.parse(c);
            if (Number.isFinite(t) && t >= from && t <= Date.now()) dates.add(ymd(new Date(t)));
            continue;
          }
          // A cup lists stages with date ranges: every day inside them.
          for (const stage of c.entries ?? [c]) {
            const a = Math.max(Date.parse(stage.startDate ?? ""), from);
            const b = Math.min(Date.parse(stage.endDate ?? ""), Date.now());
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            for (let t = a; t <= b; t += 86_400_000) dates.add(ymd(new Date(t)));
          }
        }
      }
    }
  }
  const list = [...dates].sort();
  const games: EspnGame[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = await Promise.all(list.slice(i, i + CONCURRENCY).map((d) => get(`${BASE}/${slug}/scoreboard?dates=${d}`)));
    for (const data of batch) games.push(...parse(slug, data));
  }
  // The same game can come back under two neighbouring dates (UTC vs local).
  const seen = new Set<string>();
  const unique = games
    .filter((g) => {
      const k = `${g.home}|${g.away}|${Math.round(g.date / 3_600_000)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date - b.date);
  fs.writeFileSync(file, JSON.stringify(unique));
  return unique;
}
