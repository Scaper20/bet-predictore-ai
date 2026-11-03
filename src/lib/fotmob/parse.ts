/**
 * FotMob's matchDetails JSON to plain records: a TypeScript port of
 * `parse_match` in ingestion/betrix_ingest/sources/fotmob.py, so the app can
 * fetch a game itself within minutes (the live lane, src/lib/fotmob/live.ts)
 * and write exactly what the Python job writes. Kept in step by a parity test
 * against the Python parser's own output on saved responses
 * (src/lib/fotmob/parse.test.ts); change both together.
 *
 * Pure: no I/O. FotMob's data is untrusted: text is capped, numbers checked.
 */

import { createHash } from "node:crypto";

export const MAX_TEXT = 120;

/* ------------------------------------------------------------------ helpers */

export function text(value: unknown, limit = MAX_TEXT): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, limit) : null;
}

export function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return value === true ? 1 : value === false ? 0 : null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return value === true ? 1 : value === false ? 0 : null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function parseTime(value: unknown): string | null {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const SPECIAL_KEYS: Record<string, string> = {
  "matchstats.headers.tackles": "tackles",
  BallPossesion: "possession",
  rating_title: "rating",
  big_chance_created_team_title: "big_chances_created",
  big_chance_missed_title: "big_chances_missed",
  owngoal: "own_goals",
};

/** FotMob's stat keys, made stable: snake_case ASCII, no namespaces. */
export function normKey(key: unknown, title: unknown = null): string | null {
  const raw0 = key ? key : title;
  if (!raw0) return null;
  let raw = String(raw0);
  if (raw in SPECIAL_KEYS) return SPECIAL_KEYS[raw];
  raw = raw.split(".").pop() ?? raw;
  raw = raw.replace(/(?<=[a-z0-9])(?=[A-Z])/g, "_");
  raw = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return raw.slice(0, 60) || null;
}

/** The dotted paths missing from data: an early sign FotMob changed its JSON. */
export function checkShape(data: unknown, paths: string[]): string[] {
  const missing: string[] = [];
  for (const path of paths) {
    let cur: unknown = data;
    for (const part of path.split(".")) {
      if (!cur || typeof cur !== "object" || Array.isArray(cur) || !(part in (cur as Record<string, unknown>))) {
        missing.push(path);
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return missing;
}

/** Stable player ids: uuid5(namespace, "fotmob:<id>"), as fotmob_writer.player_uuid. */
const PLAYER_NS = "6b1f3c1e-6f0e-4f0f-9a43-1c3d2f2a9b51";

export function playerUuid(fotmobId: number): string {
  const ns = Buffer.from(PLAYER_NS.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(`fotmob:${Math.trunc(fotmobId)}`).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* -------------------------------------------------------------------- types */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface PlayerRef {
  fotmobId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  usualPosition: number | null;
  fotmobTeamId: number | null;
}

export interface LineupRow {
  fotmobPlayerId: number;
  side: "home" | "away";
  role: "starter" | "sub" | "unavailable";
  shirt: string | null;
  positionId: number | null;
  usualPosition: number | null;
  pitchX: number | null;
  pitchY: number | null;
  rating: number | null;
  minutes: number | null;
  subIn: number | null;
  subOut: number | null;
  isCaptain: boolean;
  age: number | null;
  absenceKind: string | null;
  expectedReturn: string | null;
}

export interface StatRow {
  fotmobPlayerId: number;
  side: "home" | "away";
  isGoalkeeper: boolean;
  columns: Record<string, number | null>;
  stats: Record<string, number>;
}

export interface ShotRow {
  id: number;
  fotmobPlayerId: number | null;
  side: "home" | "away";
  columns: Record<string, unknown>;
}

export interface EventRow {
  seq: number;
  fotmobPlayerId: number | null;
  fotmobRelatedId: number | null;
  columns: Record<string, unknown>;
}

export interface MatchBundle {
  fotmobId: number;
  finished: boolean;
  started: boolean;
  kickoff: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  details: Record<string, unknown>;
  lineups: Partial<Record<"home" | "away", Record<string, unknown>>>;
  players: Map<number, PlayerRef>;
  lineupRows: LineupRow[];
  statRows: StatRow[];
  shots: ShotRow[];
  events: EventRow[];
  teamStats: { columns: Record<string, number | null>; stats: Record<string, Record<string, (number | null)[]>> } | null;
  warnings: string[];
}

const MATCH_PATHS = ["general.matchId", "general.homeTeam.id", "general.awayTeam.id", "content"];

/** Player stats that get their own column (the markets prop sites list). */
const COUNT_COLUMNS: Record<string, string> = {
  goals: "goals", assists: "assists", total_shots: "shots", shots_on_target: "shots_on_target",
  tackles: "tackles", clearances: "clearances", fouls: "fouls_committed", was_fouled: "fouls_won",
  saves: "saves",
};

/** Python's round(x, 4), half to even. */
function round4(x: number): number {
  const m = x * 10_000;
  const f = Math.floor(m);
  const diff = m - f;
  const r = Math.abs(diff - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(m);
  return r / 10_000;
}

/** Every stat a player has, keyed by normKey; fractions as key + key_total. */
export function playerStats(groups: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of arr(groups)) {
    for (const [title, s0] of Object.entries(obj(obj(g).stats))) {
      const s = obj(s0);
      const key = normKey(s.key, title);
      const stat = obj(s.stat);
      if (!key || key === "shotmap" || stat.type === "boolean") continue;
      const value = toFloat(stat.value);
      if (value === null) continue;
      out[key] = Number.isInteger(value) && stat.type !== "double" ? Math.trunc(value) : round4(value);
      const total = toFloat(stat.total);
      if (total !== null) out[`${key}_total`] = Math.trunc(total);
    }
  }
  return out;
}

/**
 * The typed columns. A stat FotMob omits for a player who played is a zero:
 * it only lists what happened.
 */
export function statColumns(stats: Record<string, number>, hasXg: boolean): Record<string, number | null> {
  const played = Object.keys(stats).length > 0;
  const has = (k: string) => k in stats;
  const cols: Record<string, number | null> = {
    minutes: toInt(stats.minutes_played),
    rating: toFloat(stats.rating),
    passes_completed: has("accurate_passes") ? toInt(stats.accurate_passes) : played ? 0 : null,
    passes_attempted: has("accurate_passes_total") ? toInt(stats.accurate_passes_total) : played ? 0 : null,
    xg: has("expected_goals") ? toFloat(stats.expected_goals) : played && hasXg ? 0 : null,
    xa: has("expected_assists") ? toFloat(stats.expected_assists) : played && hasXg ? 0 : null,
  };
  for (const [src, col] of Object.entries(COUNT_COLUMNS)) cols[col] = has(src) ? toInt(stats[src]) : played ? 0 : null;
  return cols;
}

function subMinutes(perf: Obj): [number | null, number | null] {
  let subIn: number | null = null, subOut: number | null = null;
  for (const ev0 of arr(perf.substitutionEvents)) {
    const ev = obj(ev0);
    if (ev.type === "subIn") subIn = toInt(ev.time);
    else if (ev.type === "subOut") subOut = toInt(ev.time);
  }
  return [subIn, subOut];
}

/* --------------------------------------------------------------- one game */

export function parseMatch(data: unknown): MatchBundle | null {
  const missing = checkShape(data, MATCH_PATHS);
  if (missing.includes("general.matchId")) return null;
  const d = obj(data);
  const general = obj(d.general);
  const content = obj(d.content);
  const headerStatus = obj(obj(d.header).status);
  const homeTid = toInt(obj(general.homeTeam).id);
  const awayTid = toInt(obj(general.awayTeam).id);
  const finished = Boolean(general.finished || headerStatus.finished);
  const started = Boolean(general.started || headerStatus.started);
  const fotmobId = toInt(general.matchId);
  if (fotmobId === null) return null;

  const sideOf = (teamId: unknown, isHome?: unknown): "home" | "away" | null => {
    if (isHome !== undefined && isHome !== null) return isHome ? "home" : "away";
    const tid = toInt(teamId);
    if (tid !== null && tid === homeTid) return "home";
    if (tid !== null && tid === awayTid) return "away";
    return null;
  };

  const facts = obj(content.matchFacts);
  const info = obj(facts.infoBox);
  const stadium = obj(info.Stadium);
  const referee = obj(info.Referee);
  const shotsRaw = arr(obj(content.shotmap).shots).map(obj);
  const hasXg = general.coverageLevel === "xG" || shotsRaw.some((s) => s.expectedGoals !== null && s.expectedGoals !== undefined);

  const b: MatchBundle = {
    fotmobId, finished, started,
    kickoff: parseTime(general.matchTimeUTCDate),
    homeTeamId: homeTid, awayTeamId: awayTid,
    details: {
      finished,
      coverage: text(general.coverageLevel, 40),
      referee: text(referee.text),
      referee_country: text(referee.countryCode, 8),
      stadium: text(stadium.name, 160),
      stadium_city: text(stadium.city),
      capacity: toInt(stadium.capacity),
      attendance: toInt(info.Attendance),
    },
    lineups: {}, players: new Map(), lineupRows: [], statRows: [], shots: [], events: [], teamStats: null,
    warnings: missing.map((p) => `match ${fotmobId}: missing ${p}`),
  };

  const ref = (p: Obj, teamId: number | null): number | null => {
    const pid = toInt(p.id);
    const name = text(p.name);
    if (pid === null || !name) return null;
    if (!b.players.has(pid)) {
      b.players.set(pid, {
        fotmobId: pid, name, firstName: text(p.firstName, 80), lastName: text(p.lastName, 80),
        countryCode: text(p.countryCode, 8), usualPosition: toInt(p.usualPlayingPositionId), fotmobTeamId: teamId,
      });
    }
    return pid;
  };

  // Lineups
  const lineup = obj(content.lineup);
  const lineupType = text(lineup.lineupType, 40);
  b.details.lineup_type = lineupType;
  const statsByPlayer = obj(content.playerStats);
  for (const [side, teamKey, teamId] of [["home", "homeTeam", homeTid], ["away", "awayTeam", awayTid]] as const) {
    const t = obj(lineup[teamKey]);
    if (Object.keys(t).length === 0) continue;
    const coach = obj(t.coach);
    b.lineups[side] = {
      formation: text(t.formation, 20),
      coach_name: text(coach.name),
      coach_fotmob_id: toInt(coach.id),
      team_rating: toFloat(t.rating),
      avg_starter_age: toFloat(t.averageStarterAge),
      lineup_type: lineupType,
    };
    const groups: [LineupRow["role"], unknown[]][] = [["starter", arr(t.starters)], ["sub", arr(t.subs)]];
    // Who is out is only true on the day: on an old game FotMob lists today's injuries.
    if (!started) groups.push(["unavailable", arr(t.unavailable)]);
    for (const [role, people] of groups) {
      for (const p0 of people) {
        const p = obj(p0);
        const pid = ref(p, teamId);
        if (pid === null) continue;
        const perf = obj(p.performance);
        const layout = obj(p.verticalLayout);
        const [subIn, subOut] = subMinutes(perf);
        const absence = obj(p.unavailability);
        const st = obj(statsByPlayer[String(pid)]);
        const minutes = Object.keys(st).length ? toInt(playerStats(st.stats).minutes_played) : null;
        b.lineupRows.push({
          fotmobPlayerId: pid, side, role,
          shirt: text(p.shirtNumber, 4),
          positionId: toInt(p.positionId),
          usualPosition: toInt(p.usualPlayingPositionId),
          pitchX: role === "starter" ? toFloat(layout.x) : null,
          pitchY: role === "starter" ? toFloat(layout.y) : null,
          rating: toFloat(perf.rating), minutes,
          subIn, subOut,
          isCaptain: Boolean(p.isCaptain), age: toInt(p.age),
          absenceKind: role === "unavailable" ? text(absence.type, 40) : null,
          expectedReturn: role === "unavailable" ? text(absence.expectedReturn, 80) : null,
        });
      }
    }
  }
  if (finished && Object.keys(b.lineups).length === 2 && !b.lineupRows.some((r) => r.role === "starter")) {
    b.warnings.push(`match ${fotmobId}: finished but no starters`);
  }

  // Player stats
  for (const [pidS, p0] of Object.entries(statsByPlayer)) {
    const p = obj(p0);
    const pid = toInt(p.id || pidS);
    const side = sideOf(p.teamId);
    if (pid === null || side === null) continue;
    ref({ id: pid, name: p.name }, toInt(p.teamId));
    const stats = playerStats(p.stats);
    if (Object.keys(stats).length === 0) continue; // an unused substitute
    b.statRows.push({ fotmobPlayerId: pid, side, isGoalkeeper: Boolean(p.isGoalkeeper), columns: statColumns(stats, hasXg), stats });
  }

  // Shots
  for (const s of shotsRaw) {
    const sid = toInt(s.id);
    const side = sideOf(s.teamId);
    if (sid === null || side === null) continue;
    const pid = toInt(s.playerId);
    if (pid !== null) {
      ref({ id: pid, name: s.playerName || s.fullName, firstName: s.firstName, lastName: s.lastName }, toInt(s.teamId));
    }
    b.shots.push({
      id: sid, fotmobPlayerId: pid, side,
      columns: {
        minute: toInt(s.min), minute_added: toInt(s.minAdded),
        period: text(s.period, 20), x: toFloat(s.x), y: toFloat(s.y),
        xg: toFloat(s.expectedGoals), xgot: toFloat(s.expectedGoalsOnTarget),
        shot_type: text(s.shotType, 30), situation: text(s.situation, 30),
        event_type: text(s.eventType, 30), on_target: Boolean(s.isOnTarget),
        blocked: Boolean(s.isBlocked), inside_box: s.isFromInsideBox ?? null,
        own_goal: Boolean(s.isOwnGoal), goal_y: toFloat(s.goalCrossedY),
        goal_z: toFloat(s.goalCrossedZ),
      },
    });
  }
  b.details.has_shotmap = b.shots.length > 0;
  b.details.has_xg = Boolean(hasXg);

  // Events
  let seq = 0;
  for (const e0 of arr(obj(facts.events).events)) {
    const e = obj(e0);
    const etype = text(e.type, 30);
    if (!etype || etype === "Comment") continue;
    seq++;
    const player = obj(e.player);
    let pid: number | null = toInt(e.playerId || player.id) || null;
    let name = text(e.nameStr || e.fullName || player.name);
    let relatedId: number | null = null;
    let related: string | null = null;
    let detail: string | null = null;
    if (etype === "Goal") {
      relatedId = toInt(e.assistPlayerId);
      related = text(String(e.assistInput || e.assistStr || "").replace(/^assist by\s+/i, ""));
      detail = e.ownGoal ? "own goal" : text(e.goalDescription || e.suffix);
    } else if (etype === "Substitution") {
      const swap = arr(e.swap).map(obj);
      if (swap.length >= 2) {
        pid = toInt(swap[0].id);
        name = text(swap[0].name);
        relatedId = toInt(swap[1].id);
        related = text(swap[1].name);
      }
      detail = e.injuredPlayerOut ? "injury" : null;
    } else if (etype === "VAR") {
      const decision = arr(obj(obj(e.VAR).decision).value);
      detail = decision.length ? text(decision.map(String).join(", ")) : null;
    } else if (etype === "AddedTime") {
      detail = text(e.minutesAddedInput, 10);
    } else if (etype === "Half") {
      detail = text(e.halfStrShort, 10);
    }
    const newScore = Array.isArray(e.newScore) ? e.newScore : null;
    b.events.push({
      seq, fotmobPlayerId: pid, fotmobRelatedId: relatedId,
      columns: {
        minute: toInt(e.time), minute_added: toInt(e.overloadTime),
        type: etype, side: e.isHome !== undefined && e.isHome !== null ? sideOf(null, e.isHome) : null,
        player_name: name, related_name: related,
        card: text(e.card, 20), detail,
        home_score: newScore ? toInt(newScore[0]) : toInt(e.homeScore),
        away_score: newScore ? toInt(newScore[1]) : toInt(e.awayScore),
      },
    });
  }

  // Team stats
  const periods = obj(obj(content.stats).Periods);
  if (Object.keys(periods).length) b.teamStats = parseTeamStats(periods);

  b.details.has_lineups = b.lineupRows.some((r) => r.role === "starter");
  b.details.has_player_stats = b.statRows.length >= 20;
  return b;
}

/* -------------------------------------------------------------- team stats */

/** '405 (85%)' -> [405, 85]; '0.89' -> [0.89, null]; 61 -> [61, null]. */
function pairValue(v: unknown): [number | null, number | null] {
  if (typeof v === "number") return [v, null];
  const s = String(v ?? "");
  const nums = s.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (nums.length === 0) return [null, null];
  return [Number(nums[0]), nums.length > 1 && s.includes("%") ? Number(nums[1]) : null];
}

const TEAM_COLUMNS: Record<string, string> = {
  expected_goals: "xg", possession: "possession", total_shots: "shots",
  shots_on_target: "shots_on_target", big_chance: "big_chances", corners: "corners",
};

export function parseTeamStats(periods: Obj): NonNullable<MatchBundle["teamStats"]> {
  const names: Record<string, string> = { All: "all", FirstHalf: "first_half", SecondHalf: "second_half" };
  const out: Record<string, Record<string, (number | null)[]>> = {};
  for (const [period, label] of Object.entries(names)) {
    const flat: Record<string, (number | null)[]> = {};
    for (const g of arr(obj(periods[period]).stats)) {
      for (const s0 of arr(obj(g).stats)) {
        const s = obj(s0);
        const key = normKey(s.key, s.title);
        const vals = s.stats;
        if (!key || !Array.isArray(vals) || vals.length !== 2) continue;
        const [h, hp] = pairValue(vals[0]);
        const [a, ap] = pairValue(vals[1]);
        if (h === null && a === null) continue;
        flat[key] = [h, a];
        if (hp !== null || ap !== null) flat[`${key}_pct`] = [hp, ap];
      }
    }
    if (Object.keys(flat).length) out[label] = flat;
  }
  const cols: Record<string, number | null> = {};
  const every = out.all ?? {};
  for (const [key, col] of Object.entries(TEAM_COLUMNS)) {
    const pair = every[key];
    if (!pair) continue;
    const cast = col === "xg" ? toFloat : toInt;
    cols[`home_${col}`] = cast(pair[0]);
    cols[`away_${col}`] = cast(pair[1]);
  }
  return { columns: cols, stats: out };
}
