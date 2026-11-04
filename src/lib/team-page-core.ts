/**
 * Pure pieces of a club's page: its URL, which league it mainly plays in, and
 * its FotMob profile (squad, transfers, honours) and season leaders checked
 * and shaped for rendering. team-page.ts does the loading.
 */

import type { LeagueDef } from "@/lib/leagues";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Paris Saint-Germain" -> "paris-saint-germain"; ASCII, short, never empty. */
export function teamSlug(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "club";
}

/** The URL segment for a club: readable, but always resolved by its id. */
export function teamSegment(id: string, name: string): string {
  return `${teamSlug(name)}--${id}`;
}

/** The club id in a URL segment ("arsenal--<uuid>" or a bare uuid), or null. */
export function parseTeamSegment(segment: string): { id: string; slug: string | null } | null {
  const s = decodeURIComponent(segment).trim();
  if (UUID.test(s)) return { id: s.toLowerCase(), slug: null };
  const i = s.lastIndexOf("--");
  if (i < 0) return null;
  const id = s.slice(i + 2);
  const slug = s.slice(0, i);
  if (!UUID.test(id) || !/^[a-z0-9-]{0,80}$/.test(slug)) return null;
  return { id: id.toLowerCase(), slug };
}

/** The domestic league a club plays most of its games in (else its most played competition). */
export function primaryLeague(codes: string[], byCode: (code: string) => LeagueDef | undefined): LeagueDef | null {
  const counts = new Map<string, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const defs = ranked.map(([c]) => byCode(c)).filter((d): d is LeagueDef => Boolean(d));
  const domestic = defs.find((d) => !d.knockout && !d.confederation && !["europe", "africa", "world", "south america", "north america"].includes(d.country.toLowerCase()));
  return domestic ?? defs[0] ?? null;
}

/** 1 July (UTC) of the season a date falls in: European seasons run July to June. */
export function seasonStart(now = new Date()): Date {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 6, 1));
}

// --------------------------------------------------------------- profile

export type SquadGroup = "keepers" | "defenders" | "midfielders" | "attackers";

export interface SquadMember {
  id: number;
  name: string;
  group: SquadGroup;
  shirt: number | null;
  position: string | null;
  country: string | null;
  age: number | null;
  rating: number | null;
  goals: number;
  assists: number;
  injured: boolean;
  injury: string | null;
}

export interface Transfer {
  direction: "in" | "out";
  name: string;
  date: string | null;
  club: string | null;
  fee: string | null;
  onLoan: boolean;
  position: string | null;
}

export interface Honour {
  name: string;
  won: number;
  latest: string | null;
}

export interface TeamProfile {
  coach: string | null;
  venue: string | null;
  city: string | null;
  capacity: number | null;
  squad: Record<SquadGroup, SquadMember[]>;
  injured: SquadMember[];
  transfers: Transfer[];
  honours: Honour[];
}

const GROUPS: SquadGroup[] = ["keepers", "defenders", "midfielders", "attackers"];

function str(v: unknown, max = 120): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(rec).filter((x): x is Record<string, unknown> => x !== null) : [];
}

export function mapProfile(raw: unknown): TeamProfile | null {
  const p = rec(raw);
  if (!p) return null;
  const squad: Record<SquadGroup, SquadMember[]> = { keepers: [], defenders: [], midfielders: [], attackers: [] };
  for (const m of list(p.squad)) {
    const id = num(m.id);
    const name = str(m.name);
    const group = GROUPS.find((g) => g === m.group);
    if (id === null || !name || !group) continue;
    squad[group].push({
      id,
      name,
      group,
      shirt: num(m.shirt),
      position: str(m.position, 20),
      country: str(m.country, 60),
      age: num(m.age),
      rating: num(m.rating),
      goals: num(m.goals) ?? 0,
      assists: num(m.assists) ?? 0,
      injured: m.injured === true,
      injury: str(m.injury, 80),
    });
  }
  for (const g of GROUPS) squad[g].sort((a, b) => (a.shirt ?? 999) - (b.shirt ?? 999) || a.name.localeCompare(b.name));

  const transfers: Transfer[] = [];
  for (const t of list(p.transfers)) {
    const name = str(t.name);
    const direction = t.direction === "in" || t.direction === "out" ? t.direction : null;
    if (!name || !direction) continue;
    transfers.push({
      direction,
      name,
      date: str(t.date, 30),
      club: str(direction === "in" ? t.from : t.to),
      fee: str(t.fee, 40),
      onLoan: t.onLoan === true,
      position: str(t.position, 10),
    });
  }
  transfers.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const honours: Honour[] = list(p.honours)
    .map((h) => {
      const seasons = Array.isArray(h.seasons) ? h.seasons.map((s) => str(s, 12)).filter((s): s is string => Boolean(s)) : [];
      return { name: str(h.name) ?? "", won: num(h.won) ?? 0, latest: seasons[0] ?? null };
    })
    .filter((h) => h.name && h.won > 0)
    .sort((a, b) => b.won - a.won);

  const all = GROUPS.flatMap((g) => squad[g]);
  return {
    coach: str(p.coach),
    venue: str(p.venue, 160),
    city: str(p.city),
    capacity: num(p.capacity),
    squad,
    injured: all.filter((m) => m.injured),
    transfers: transfers.slice(0, 30),
    honours: honours.slice(0, 12),
  };
}

// --------------------------------------------------------------- leaders

export interface Leader {
  playerId: string;
  name: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  xa: number;
  rating: number | null;
  yellow: number;
  red: number;
}

export function mapLeaders(raw: unknown): Leader[] {
  const out: Leader[] = [];
  for (const r of list(raw)) {
    const playerId = str(r.player_id, 40);
    const name = str(r.name);
    if (!playerId || !name) continue;
    out.push({
      playerId,
      name,
      apps: num(r.apps) ?? 0,
      starts: num(r.starts) ?? 0,
      minutes: num(r.minutes) ?? 0,
      goals: num(r.goals) ?? 0,
      assists: num(r.assists) ?? 0,
      shots: num(r.shots) ?? 0,
      shotsOnTarget: num(r.shots_on_target) ?? 0,
      xg: num(r.xg) ?? 0,
      xa: num(r.xa) ?? 0,
      rating: num(r.avg_rating),
      yellow: num(r.yellow) ?? 0,
      red: num(r.red) ?? 0,
    });
  }
  return out;
}

/** Top N by a stat, ignoring zeros; ties go to fewer minutes (more efficient). */
export function topBy(leaders: Leader[], pick: (l: Leader) => number, n = 5, minApps = 0): Leader[] {
  return leaders
    .filter((l) => pick(l) > 0 && l.apps >= minApps)
    .sort((a, b) => pick(b) - pick(a) || a.minutes - b.minutes)
    .slice(0, n);
}
