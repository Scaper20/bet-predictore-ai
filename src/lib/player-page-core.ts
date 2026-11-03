/**
 * Pure pieces of a player's page: the header from player_page, the game log,
 * season totals and per-90 rates by competition, percentiles against position
 * peers, the season shot map, and recent hit rates per prop market (facts:
 * "over 1.5 shots in 6 of the last 8"). player-page.ts does the loading.
 *
 * Every field from the database is checked; FotMob text is capped.
 */

import type { ShotPoint } from "./match-details-core";

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
function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(rec).filter((x): x is Record<string, unknown> => x !== null) : [];
}

/* ----------------------------------------------------------------- header */

export type PositionGroup = "keeper" | "defender" | "midfielder" | "attacker";
const GROUP: Record<number, PositionGroup> = { 0: "keeper", 1: "defender", 2: "midfielder", 3: "attacker" };
export const GROUP_LABEL: Record<PositionGroup, string> = { keeper: "Goalkeeper", defender: "Defender", midfielder: "Midfielder", attacker: "Forward" };

export interface CareerSpell {
  team: string;
  start: string | null;
  end: string | null;
  active: boolean;
  apps: number | null;
  goals: number | null;
  assists: number | null;
}

export interface PlayerHeader {
  id: string;
  name: string;
  short: string;
  initials: string;
  group: PositionGroup | null;
  usualPosition: number | null;
  position: string | null;
  positionShort: string | null;
  otherPositions: string[];
  shirt: number | null;
  height: number | null;
  foot: string | null;
  country: string | null;
  countryCode: string | null;
  birthDate: string | null;
  age: number | null;
  marketValue: number | null;
  contractEnd: string | null;
  onLoan: boolean;
  injury: { name: string | null; expectedReturn: string | null } | null;
  team: { id: string; name: string; crest: string | null } | null;
  teamName: string | null;
  career: { club: CareerSpell[]; national: CareerSpell[] };
  trophies: { name: string; team: string | null; won: number; latest: string | null }[];
  hasProfile: boolean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ageOn(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null;
  const [y, m, d] = birthDate.slice(0, 10).split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age >= 14 && age <= 50 ? age : null;
}

function spells(v: unknown): CareerSpell[] {
  return list(v)
    .map((e) => ({
      team: str(e.team) ?? "",
      start: str(e.start, 10),
      end: str(e.end, 10),
      active: e.active === true,
      apps: num(e.apps),
      goals: num(e.goals),
      assists: num(e.assists),
    }))
    .filter((e) => e.team);
}

export function mapHeader(raw: unknown, now = new Date()): PlayerHeader | null {
  const p = rec(raw);
  const id = str(p?.id, 40);
  const name = str(p?.name);
  if (!p || !id || !name) return null;
  const prof = rec(p.profile);
  const team = rec(p.team);
  const usual = num(p.usualPosition);
  const career = rec(prof?.career);
  const injury = rec(prof?.injury);
  const lastName = str(p.lastName, 60);
  const birthDate = str(prof?.birthDate, 10);
  return {
    id,
    name,
    short: lastName ?? name.split(/\s+/).slice(-1)[0],
    initials: initials(name),
    group: usual === null ? null : (GROUP[usual] ?? null),
    usualPosition: usual,
    position: str(prof?.position, 40),
    positionShort: str(prof?.positionShort, 8),
    otherPositions: Array.isArray(prof?.otherPositions) ? (prof!.otherPositions as unknown[]).map((x) => str(x, 8)).filter((x): x is string => Boolean(x)) : [],
    shirt: num(prof?.shirt),
    height: num(prof?.height),
    foot: str(prof?.foot, 10),
    country: str(prof?.country, 60),
    countryCode: str(p.countryCode, 8),
    birthDate,
    age: ageOn(birthDate, now),
    marketValue: num(prof?.marketValue),
    contractEnd: str(prof?.contractEnd, 10),
    onLoan: prof?.onLoan === true,
    injury: injury && (str(injury.name) || str(injury.expectedReturn)) ? { name: str(injury.name, 80), expectedReturn: str(injury.expectedReturn, 80) } : null,
    team: team && str(team.id, 40) && str(team.name) ? { id: str(team.id, 40)!, name: str(team.name)!, crest: str(team.crest, 300) } : null,
    teamName: str(prof?.teamName),
    career: { club: spells(career?.club), national: spells(career?.national) },
    trophies: list(prof?.trophies)
      .map((t) => ({ name: str(t.name) ?? "", team: str(t.team), won: num(t.won) ?? 0, latest: str(t.latest, 12) }))
      .filter((t) => t.name && t.won > 0),
    hasProfile: Boolean(prof),
  };
}

/* --------------------------------------------------------------- game log */

/** The ten prop markets, in the order they are shown. */
export const PROP_MARKETS = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "goalsAssists", label: "Goals + assists" },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "tackles", label: "Tackles" },
  { key: "fouls", label: "Fouls" },
  { key: "clearances", label: "Clearances" },
  { key: "passes", label: "Passing attempts" },
  { key: "saves", label: "Saves" },
] as const;
export type PropMarket = (typeof PROP_MARKETS)[number]["key"];

export interface GameRow {
  matchId: string;
  sourceIds: Record<string, string>;
  kickoff: string;
  leagueCode: string;
  isHome: boolean;
  opponentId: string | null;
  opponentName: string;
  opponentCrest: string | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  started: boolean;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number | null;
  xa: number | null;
  tackles: number;
  clearances: number;
  fouls: number;
  foulsWon: number;
  passes: number;
  passesCompleted: number;
  saves: number;
  keeper: boolean;
  yellow: number;
  red: number;
}

export function mapGameLog(raw: unknown): GameRow[] {
  const out: GameRow[] = [];
  for (const r of list(raw)) {
    const matchId = str(r.match_id, 40);
    const kickoff = str(r.kickoff, 40);
    if (!matchId || !kickoff) continue;
    const ids = rec(r.source_ids) ?? {};
    const n0 = (v: unknown) => num(v) ?? 0;
    out.push({
      matchId,
      sourceIds: Object.fromEntries(Object.entries(ids).filter(([, v]) => typeof v === "string")) as Record<string, string>,
      kickoff,
      leagueCode: str(r.league_code, 60) ?? "",
      isHome: r.side === "home",
      opponentId: str(r.opponent_id, 40),
      opponentName: str(r.opponent_name) ?? "",
      opponentCrest: str(r.opponent_crest, 300),
      goalsFor: num(r.goals_for),
      goalsAgainst: num(r.goals_against),
      started: r.role === "starter",
      minutes: n0(r.minutes),
      rating: num(r.rating),
      goals: n0(r.goals),
      assists: n0(r.assists),
      shots: n0(r.shots),
      shotsOnTarget: n0(r.shots_on_target),
      xg: num(r.xg),
      xa: num(r.xa),
      tackles: n0(r.tackles),
      clearances: n0(r.clearances),
      fouls: n0(r.fouls_committed),
      foulsWon: n0(r.fouls_won),
      passes: n0(r.passes_attempted),
      passesCompleted: n0(r.passes_completed),
      saves: n0(r.saves),
      keeper: r.is_goalkeeper === true,
      yellow: n0(r.yellow),
      red: n0(r.red),
    });
  }
  return out.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
}

export function statOf(g: GameRow, m: PropMarket): number {
  switch (m) {
    case "goals": return g.goals;
    case "assists": return g.assists;
    case "goalsAssists": return g.goals + g.assists;
    case "shots": return g.shots;
    case "shotsOnTarget": return g.shotsOnTarget;
    case "tackles": return g.tackles;
    case "fouls": return g.fouls;
    case "clearances": return g.clearances;
    case "passes": return g.passes;
    case "saves": return g.saves;
  }
}

/* -------------------------------------------------------- season summary */

export interface SeasonLine {
  leagueCode: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  shots: number;
  shotsOnTarget: number;
  tackles: number;
  clearances: number;
  fouls: number;
  passes: number;
  saves: number;
  yellow: number;
  red: number;
  rating: number | null;
}

/** Totals for games since `since` (games actually played), one line per competition plus "all". */
export function seasonLines(games: GameRow[], since: Date): SeasonLine[] {
  const played = games.filter((g) => g.minutes > 0 && Date.parse(g.kickoff) >= since.getTime());
  const groups = new Map<string, GameRow[]>([["all", played]]);
  for (const g of played) groups.set(g.leagueCode, [...(groups.get(g.leagueCode) ?? []), g]);
  const lines: SeasonLine[] = [];
  for (const [code, gs] of groups) {
    if (gs.length === 0) continue;
    const sum = (f: (g: GameRow) => number) => gs.reduce((a, g) => a + f(g), 0);
    const rated = gs.filter((g) => g.rating !== null);
    lines.push({
      leagueCode: code,
      apps: gs.length,
      starts: gs.filter((g) => g.started).length,
      minutes: sum((g) => g.minutes),
      goals: sum((g) => g.goals),
      assists: sum((g) => g.assists),
      xg: sum((g) => g.xg ?? 0),
      xa: sum((g) => g.xa ?? 0),
      shots: sum((g) => g.shots),
      shotsOnTarget: sum((g) => g.shotsOnTarget),
      tackles: sum((g) => g.tackles),
      clearances: sum((g) => g.clearances),
      fouls: sum((g) => g.fouls),
      passes: sum((g) => g.passes),
      saves: sum((g) => g.saves),
      yellow: sum((g) => g.yellow),
      red: sum((g) => g.red),
      rating: rated.length ? rated.reduce((a, g) => a + (g.rating ?? 0), 0) / rated.length : null,
    });
  }
  return lines.sort((a, b) => (a.leagueCode === "all" ? -1 : b.leagueCode === "all" ? 1 : b.minutes - a.minutes));
}

export function per90(total: number, minutes: number): number | null {
  return minutes >= 90 ? (90 * total) / minutes : null;
}

/* ------------------------------------------------------------ percentiles */

export interface PeerRate {
  playerId: string;
  minutes: number;
  rates: Record<string, number>;
}

export const PERCENTILE_STATS: Record<PositionGroup, { key: string; label: string }[]> = {
  attacker: [
    { key: "goals", label: "Goals" }, { key: "xg", label: "xG" }, { key: "shots", label: "Shots" },
    { key: "shots_on_target", label: "Shots on target" }, { key: "assists", label: "Assists" }, { key: "xa", label: "xA" },
    { key: "fouls_won", label: "Fouls won" }, { key: "rating", label: "Rating" },
  ],
  midfielder: [
    { key: "passes", label: "Passes" }, { key: "xa", label: "xA" }, { key: "assists", label: "Assists" },
    { key: "shots", label: "Shots" }, { key: "tackles", label: "Tackles" }, { key: "goals", label: "Goals" },
    { key: "fouls_won", label: "Fouls won" }, { key: "rating", label: "Rating" },
  ],
  defender: [
    { key: "tackles", label: "Tackles" }, { key: "clearances", label: "Clearances" }, { key: "passes", label: "Passes" },
    { key: "xa", label: "xA" }, { key: "goals", label: "Goals" }, { key: "fouls_committed", label: "Fouls" },
    { key: "rating", label: "Rating" },
  ],
  keeper: [{ key: "saves", label: "Saves" }, { key: "passes", label: "Passes" }, { key: "rating", label: "Rating" }],
};

export function mapPeers(raw: unknown): PeerRate[] {
  const keys = ["goals", "assists", "xg", "xa", "shots", "shots_on_target", "tackles", "clearances", "fouls_committed", "fouls_won", "passes", "saves", "rating"];
  return list(raw)
    .map((r) => ({
      playerId: str(r.player_id, 40) ?? "",
      minutes: num(r.minutes) ?? 0,
      rates: Object.fromEntries(keys.map((k) => [k, num(r[k]) ?? 0])),
    }))
    .filter((r) => r.playerId);
}

/** Share of peers (0-100) at or below this player's value; null when they are not in the pool. */
export function percentiles(playerId: string, peers: PeerRate[], keys: string[]): Record<string, number> | null {
  const me = peers.find((p) => p.playerId === playerId);
  if (!me || peers.length < 10) return null;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = me.rates[k] ?? 0;
    const below = peers.filter((p) => (p.rates[k] ?? 0) < v).length;
    const equal = peers.filter((p) => (p.rates[k] ?? 0) === v).length;
    out[k] = Math.round((100 * (below + equal / 2)) / peers.length);
  }
  return out;
}

/* ------------------------------------------------------------ hit rates */

export interface HitRate {
  market: PropMarket;
  line: number;
  hits: number;
  games: number;
  values: number[];
}

/** Lines worth showing for a market given a player's recent numbers: around their median. */
export function hitLines(values: number[], market: PropMarket): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const step = market === "passes" ? 5 : 1;
  const centre = market === "passes" ? Math.round(median / 5) * 5 - 0.5 : Math.max(0, Math.floor(median)) + 0.5;
  const lines = [centre - step, centre, centre + step].filter((l) => l > 0);
  return [...new Set(lines)];
}

/**
 * How often a player cleared each line in their last `n` games where they
 * started: facts, open to everyone. Keepers get saves only; outfielders
 * everything else.
 */
export function hitRates(games: GameRow[], n = 10): HitRate[] {
  const starts = games.filter((g) => g.started && g.minutes > 0).slice(0, n);
  if (starts.length < 3) return [];
  const keeper = starts.filter((g) => g.keeper).length > starts.length / 2;
  const out: HitRate[] = [];
  for (const { key } of PROP_MARKETS) {
    if (keeper !== (key === "saves")) continue;
    const values = starts.map((g) => statOf(g, key));
    if (values.every((v) => v === 0) && key !== "goals") continue;
    for (const line of hitLines(values, key)) {
      out.push({ market: key, line, hits: values.filter((v) => v > line).length, games: values.length, values });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- shots */

export function mapPlayerShots(raw: unknown, playerName: string): ShotPoint[] {
  const out: ShotPoint[] = [];
  for (const s of list(raw)) {
    const x = num(s.x);
    const y = num(s.y);
    if (x === null || y === null) continue;
    out.push({
      side: "home",
      minute: num(s.minute),
      x: Math.max(0, Math.min(100, (x / 105) * 100)),
      y: Math.max(0, Math.min(100, (y / 68) * 100)),
      xg: num(s.xg),
      goal: s.event_type === "Goal",
      onTarget: s.on_target === true,
      player: playerName,
      type: str(s.shot_type, 30),
      situation: str(s.situation, 30),
    });
  }
  return out;
}

export interface ShotSplit {
  label: string;
  shots: number;
  goals: number;
  xg: number;
}

export function shotSplits(shots: ShotPoint[], by: "type" | "situation"): ShotSplit[] {
  const names: Record<string, string> = {
    RightFoot: "Right foot", LeftFoot: "Left foot", Header: "Header", OtherBodyParts: "Other",
    RegularPlay: "Open play", FastBreak: "Counter", FromCorner: "Corner", SetPiece: "Set piece",
    FreeKick: "Free kick", Penalty: "Penalty", ThrowInSetPiece: "Throw-in", IndividualPlay: "Individual play",
  };
  const m = new Map<string, ShotSplit>();
  for (const s of shots) {
    const k = (by === "type" ? s.type : s.situation) ?? "Other";
    const e = m.get(k) ?? { label: names[k] ?? k, shots: 0, goals: 0, xg: 0 };
    e.shots += 1;
    if (s.goal) e.goals += 1;
    e.xg += s.xg ?? 0;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.shots - a.shots);
}
