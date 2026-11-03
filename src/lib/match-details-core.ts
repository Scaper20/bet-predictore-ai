/**
 * What the match page shows from FotMob's match details (migration 0091), in
 * the shapes the components render. Pure: match-details.ts loads the bundle,
 * this turns it into lineups, a timeline, a shot map and team stats.
 *
 * Nothing here trusts the feed: every field is checked, text is capped, and a
 * bundle that is missing or malformed becomes null (the page then shows what
 * it showed before).
 */

export type Side = "home" | "away";

/** How sure the shown lineup is. */
export type LineupStatus = "final" | "confirmed" | "predicted" | "previous" | "none";

export interface DetailPlayer {
  id: string;
  name: string;
  short: string;
  side: Side;
  role: "starter" | "sub" | "unavailable";
  shirt: string | null;
  /** 0-1 across the pitch (left to right as the side attacks upwards). */
  x: number | null;
  /** 0-1 up the pitch from the side's own goal. */
  y: number | null;
  rating: number | null;
  minutes: number | null;
  subIn: number | null;
  subOut: number | null;
  captain: boolean;
  absence: string | null;
  expectedReturn: string | null;
  goals: number;
  assists: number;
  shots: number | null;
  shotsOnTarget: number | null;
  xg: number | null;
  yellow: number;
  red: number;
}

export interface LineupSide {
  formation: string | null;
  coach: string | null;
  rating: number | null;
  avgAge: number | null;
  starters: DetailPlayer[];
  subs: DetailPlayer[];
  unavailable: DetailPlayer[];
}

export interface TimelineEvent {
  minute: number;
  added: number | null;
  type: "goal" | "card" | "sub" | "var" | "missed-penalty" | "half" | "added-time";
  side: Side | null;
  player: string | null;
  related: string | null;
  card: "yellow" | "red" | "second-yellow" | null;
  detail: string | null;
  score: [number, number] | null;
}

export interface ShotPoint {
  side: Side;
  minute: number | null;
  /** 0-100 along the pitch towards the goal being attacked. */
  x: number;
  /** 0-100 across the pitch. */
  y: number;
  xg: number | null;
  goal: boolean;
  onTarget: boolean;
  player: string | null;
  type: string | null;
  situation: string | null;
}

export interface TeamStatRow {
  key: string;
  label: string;
  home: number;
  away: number;
  /** Shown as e.g. "61%"; percentages share a 100 bar. */
  format: "int" | "dec" | "pct";
  /** Higher is better for the bar highlight (fouls and cards are not). */
  higherIsBetter: boolean;
}

export interface MatchDetails {
  finished: boolean;
  lineupStatus: LineupStatus;
  referee: string | null;
  stadium: string | null;
  city: string | null;
  capacity: number | null;
  attendance: number | null;
  hasXg: boolean;
  home: LineupSide | null;
  away: LineupSide | null;
  events: TimelineEvent[];
  shots: ShotPoint[];
  stats: TeamStatRow[];
  /** The best-rated player of a finished game. */
  playerOfMatch: DetailPlayer | null;
}

const MAX = 120;

function str(v: unknown, max = MAX): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function side(v: unknown): Side | null {
  return v === "home" || v === "away" ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** "Bukayo Saka" -> "Saka"; keeps particles ("van Dijk", "De Bruyne"). */
export function shortName(name: string, lastName?: string | null): string {
  if (lastName && lastName.trim()) return lastName.trim().slice(0, 40);
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.slice(0, 40);
  const particles = new Set(["van", "von", "de", "da", "di", "del", "der", "le", "la", "dos", "el", "al", "ter", "ten"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i -= 1;
  return parts.slice(i).join(" ").slice(0, 40);
}

export function lineupStatus(lineupType: string | null, finished: boolean, started: boolean): LineupStatus {
  if (!lineupType) return "none";
  if (lineupType === "standard") return finished || started ? "final" : "confirmed";
  if (lineupType === "predicted") return "predicted";
  if (lineupType === "lastStarting11") return "previous";
  return "none";
}

const EVENT_TYPES: Record<string, TimelineEvent["type"]> = {
  Goal: "goal",
  Card: "card",
  Substitution: "sub",
  VAR: "var",
  MissedPenalty: "missed-penalty",
  Half: "half",
  AddedTime: "added-time",
};

function cardOf(v: unknown): TimelineEvent["card"] {
  if (v === "Yellow") return "yellow";
  if (v === "Red") return "red";
  if (v === "YellowRed") return "second-yellow";
  return null;
}

export function mapEvents(raw: unknown): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const e of arr(raw)) {
    const o = obj(e);
    if (!o) continue;
    const type = EVENT_TYPES[String(o.type)];
    const minute = int(o.minute);
    if (!type || minute === null) continue;
    const hs = int(o.homeScore);
    const as = int(o.awayScore);
    out.push({
      minute,
      added: int(o.added),
      type,
      side: side(o.side),
      player: str(o.player),
      related: str(o.related),
      card: type === "card" ? cardOf(o.card) : null,
      detail: str(o.detail),
      score: type === "goal" && hs !== null && as !== null ? [hs, as] : null,
    });
  }
  return out;
}

export function mapShots(raw: unknown): ShotPoint[] {
  const out: ShotPoint[] = [];
  for (const s of arr(raw)) {
    const o = obj(s);
    const sd = side(o?.side);
    const x = num(o?.x);
    const y = num(o?.y);
    if (!o || !sd || x === null || y === null) continue;
    // FotMob's pitch is 105 x 68 with the attacked goal at x = 105.
    out.push({
      side: sd,
      minute: int(o.minute),
      x: Math.max(0, Math.min(100, (x / 105) * 100)),
      y: Math.max(0, Math.min(100, (y / 68) * 100)),
      xg: num(o.xg),
      goal: o.event === "Goal",
      onTarget: o.onTarget === true,
      player: str(o.player),
      type: str(o.type, 30),
      situation: str(o.situation, 30),
    });
  }
  return out;
}

/** The team stats worth a row, in the order a reader scans them. */
const STAT_ROWS: Array<Omit<TeamStatRow, "home" | "away">> = [
  { key: "possession", label: "Possession", format: "pct", higherIsBetter: true },
  { key: "expected_goals", label: "Expected goals (xG)", format: "dec", higherIsBetter: true },
  { key: "total_shots", label: "Shots", format: "int", higherIsBetter: true },
  { key: "shots_on_target", label: "Shots on target", format: "int", higherIsBetter: true },
  { key: "big_chance", label: "Big chances", format: "int", higherIsBetter: true },
  { key: "shots_inside_box", label: "Shots inside the box", format: "int", higherIsBetter: true },
  { key: "touches_opp_box", label: "Touches in the box", format: "int", higherIsBetter: true },
  { key: "corners", label: "Corners", format: "int", higherIsBetter: true },
  { key: "passes", label: "Passes", format: "int", higherIsBetter: true },
  { key: "accurate_passes_pct", label: "Pass accuracy", format: "pct", higherIsBetter: true },
  { key: "tackles", label: "Tackles", format: "int", higherIsBetter: true },
  { key: "interceptions", label: "Interceptions", format: "int", higherIsBetter: true },
  { key: "keeper_saves", label: "Saves", format: "int", higherIsBetter: true },
  { key: "fouls", label: "Fouls", format: "int", higherIsBetter: false },
  { key: "offsides", label: "Offsides", format: "int", higherIsBetter: false },
  { key: "yellow_cards", label: "Yellow cards", format: "int", higherIsBetter: false },
  { key: "red_cards", label: "Red cards", format: "int", higherIsBetter: false },
];

export function mapTeamStats(raw: unknown): TeamStatRow[] {
  const all = obj(obj(obj(raw)?.stats)?.all);
  if (!all) return [];
  const out: TeamStatRow[] = [];
  for (const row of STAT_ROWS) {
    const pair = arr(all[row.key]);
    const home = num(pair[0]);
    const away = num(pair[1]);
    if (home === null || away === null) continue;
    out.push({ ...row, home, away });
  }
  return out;
}

function player(o: Record<string, unknown>, cards: Map<string, { yellow: number; red: number }>): DetailPlayer | null {
  const id = str(o.id, 40);
  const name = str(o.name);
  const sd = side(o.side);
  const role = o.role === "starter" || o.role === "sub" || o.role === "unavailable" ? o.role : null;
  if (!id || !name || !sd || !role) return null;
  const c = cards.get(`${sd}|${name}`) ?? { yellow: 0, red: 0 };
  const unit = (v: unknown) => {
    const n = num(v);
    return n === null ? null : Math.max(0, Math.min(1, n));
  };
  return {
    id,
    name,
    short: shortName(name, str(o.lastName, 60)),
    side: sd,
    role,
    shirt: str(o.shirt, 4),
    x: unit(o.x),
    y: unit(o.y),
    rating: num(o.rating),
    minutes: int(o.minutes),
    subIn: int(o.subIn),
    subOut: int(o.subOut),
    captain: o.captain === true,
    absence: str(o.absence, 40),
    expectedReturn: str(o.expectedReturn, 80),
    goals: int(o.goals) ?? 0,
    assists: int(o.assists) ?? 0,
    shots: int(o.shots),
    shotsOnTarget: int(o.shotsOnTarget),
    xg: num(o.xg),
    yellow: c.yellow,
    red: c.red,
  };
}

function cardsByPlayer(events: TimelineEvent[]): Map<string, { yellow: number; red: number }> {
  const out = new Map<string, { yellow: number; red: number }>();
  for (const e of events) {
    if (e.type !== "card" || !e.side || !e.player) continue;
    const key = `${e.side}|${e.player}`;
    const c = out.get(key) ?? { yellow: 0, red: 0 };
    if (e.card === "yellow") c.yellow += 1;
    else if (e.card === "red" || e.card === "second-yellow") c.red += 1;
    out.set(key, c);
  }
  return out;
}

/** The match-details bundle (match_details_bundle in 0091) as the page shows it. */
export function mapMatchDetails(bundle: unknown, started = false): MatchDetails | null {
  const b = obj(bundle);
  const d = obj(b?.details);
  if (!b || !d) return null;
  const finished = d.finished === true;
  const events = mapEvents(b.events);
  const cards = cardsByPlayer(events);
  const players = arr(b.players)
    .map((p) => (obj(p) ? player(obj(p)!, cards) : null))
    .filter((p): p is DetailPlayer => p !== null);
  const lineups = new Map<Side, Record<string, unknown>>();
  for (const l of arr(b.lineups)) {
    const o = obj(l);
    const sd = side(o?.side);
    if (o && sd) lineups.set(sd, o);
  }

  const buildSide = (sd: Side): LineupSide | null => {
    const mine = players.filter((p) => p.side === sd);
    const meta = lineups.get(sd);
    if (!meta && mine.length === 0) return null;
    const byShirt = (a: DetailPlayer, b2: DetailPlayer) => (int(a.shirt) ?? 99) - (int(b2.shirt) ?? 99);
    return {
      formation: str(meta?.formation, 20),
      coach: str(meta?.coach),
      rating: num(meta?.rating),
      avgAge: num(meta?.avgAge),
      starters: mine.filter((p) => p.role === "starter"),
      subs: mine.filter((p) => p.role === "sub").sort((a, b2) => (a.subIn ?? 999) - (b2.subIn ?? 999) || byShirt(a, b2)),
      unavailable: mine.filter((p) => p.role === "unavailable"),
    };
  };

  const home = buildSide("home");
  const away = buildSide("away");
  const rated = players.filter((p) => p.rating !== null && p.role !== "unavailable");
  const best = finished && rated.length >= 20 ? rated.reduce((a, b2) => ((b2.rating ?? 0) > (a.rating ?? 0) ? b2 : a)) : null;
  const hasStarters = Boolean(home?.starters.length || away?.starters.length);

  return {
    finished,
    lineupStatus: hasStarters ? lineupStatus(str(d.lineupType, 40), finished, started) : "none",
    referee: str(d.referee),
    stadium: str(d.stadium, 160),
    city: str(d.stadiumCity),
    capacity: int(d.capacity),
    attendance: int(d.attendance),
    hasXg: d.hasXg === true,
    home,
    away,
    events,
    shots: mapShots(b.shots),
    stats: mapTeamStats(b.teamStats),
    playerOfMatch: best,
  };
}

/** Rating colour band: the same thresholds FotMob readers know. */
export function ratingBand(r: number | null): "elite" | "good" | "ok" | "poor" | null {
  if (r === null) return null;
  if (r >= 8) return "elite";
  if (r >= 7) return "good";
  if (r >= 6) return "ok";
  return "poor";
}
