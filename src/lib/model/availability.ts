/**
 * Who a side is missing, and how much of its attack they carry.
 *
 * Point in time: everything comes from the side's own games before this one
 * (team_player_usage, migration 0092), and the lineup or absences known before
 * kickoff. Used by the match page's paid team-news read and by the lineup
 * backtest (scripts/lineup-backtest.ts), so both compute the same thing.
 *
 * A "regular" started at least REGULAR_SHARE of the games looked at (and at
 * least MIN_GAMES were looked at). A regular is missing when we know the XI
 * and they are not in it, or (before the XI is out) when they are listed as
 * injured or suspended.
 */

export const REGULAR_SHARE = 0.5;
export const MIN_GAMES = 3;

export interface PlayerUsage {
  playerId: string;
  name: string;
  /** FotMob's usual position id: 0 keeper, 1 defender, 2 midfielder, 3 attacker. */
  usualPosition: number | null;
  games: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  teamGames: number;
  teamXg: number;
  teamXa: number;
}

export interface MissingPlayer {
  playerId: string;
  name: string;
  role: "keeper" | "defender" | "midfielder" | "attacker" | "unknown";
  startShare: number;
  /** This player's share of the side's xG + xA over the games looked at. */
  attackShare: number;
  reason: "not-in-xi" | "injured" | "suspended" | "out";
}

export interface SideAvailability {
  gamesLookedAt: number;
  regulars: number;
  missing: MissingPlayer[];
  /** Sum of the missing regulars' attack shares (0-1). */
  attackLoss: number;
  /** Missing regular defenders and keeper, weighted by how often they start. */
  defenceLoss: number;
  keeperMissing: boolean;
  /** "xi": judged against the named eleven; "absences": against the injury list only. */
  basis: "xi" | "absences";
}

const ROLE: Record<number, MissingPlayer["role"]> = { 0: "keeper", 1: "defender", 2: "midfielder", 3: "attacker" };

export function mapUsage(rows: unknown): PlayerUsage[] {
  if (!Array.isArray(rows)) return [];
  const n = (v: unknown) => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.player_id === "string" && typeof r.name === "string")
    .map((r) => ({
      playerId: r.player_id as string,
      name: String(r.name).slice(0, 120),
      usualPosition: r.usual_position === null || r.usual_position === undefined ? null : n(r.usual_position),
      games: n(r.games),
      starts: n(r.starts),
      minutes: n(r.minutes),
      goals: n(r.goals),
      assists: n(r.assists),
      xg: n(r.xg),
      xa: n(r.xa),
      teamGames: n(r.team_games),
      teamXg: n(r.team_xg),
      teamXa: n(r.team_xa),
    }));
}

/**
 * The side's missing regulars.
 *
 * `xi`: the starting eleven's player ids when known (confirmed or played),
 * else null. `absent`: players listed as out, with why.
 */
export function sideAvailability(
  usage: PlayerUsage[],
  xi: string[] | null,
  absent: { playerId: string; kind: string | null }[] = [],
): SideAvailability | null {
  const teamGames = usage[0]?.teamGames ?? 0;
  if (teamGames < MIN_GAMES) return null;
  const teamOutput = (usage[0]?.teamXg ?? 0) + (usage[0]?.teamXa ?? 0);
  const regulars = usage.filter((u) => u.starts / teamGames >= REGULAR_SHARE);
  const inXi = xi ? new Set(xi) : null;
  const outKind = new Map(absent.map((a) => [a.playerId, a.kind]));

  const missing: MissingPlayer[] = [];
  for (const r of regulars) {
    let reason: MissingPlayer["reason"] | null = null;
    if (inXi) {
      if (!inXi.has(r.playerId)) {
        const k = outKind.get(r.playerId);
        reason = k === "injury" ? "injured" : k === "suspension" ? "suspended" : "not-in-xi";
      }
    } else if (outKind.has(r.playerId)) {
      const k = outKind.get(r.playerId);
      reason = k === "injury" ? "injured" : k === "suspension" ? "suspended" : "out";
    }
    if (!reason) continue;
    missing.push({
      playerId: r.playerId,
      name: r.name,
      role: r.usualPosition === null ? "unknown" : (ROLE[r.usualPosition] ?? "unknown"),
      startShare: r.starts / teamGames,
      attackShare: teamOutput > 0 ? (r.xg + r.xa) / teamOutput : 0,
      reason,
    });
  }
  missing.sort((a, b) => b.attackShare - a.attackShare || b.startShare - a.startShare);
  const defenders = missing.filter((m) => m.role === "defender" || m.role === "keeper");
  return {
    gamesLookedAt: teamGames,
    regulars: regulars.length,
    missing,
    attackLoss: Math.min(1, missing.reduce((s, m) => s + m.attackShare, 0)),
    defenceLoss: defenders.reduce((s, m) => s + m.startShare, 0),
    keeperMissing: missing.some((m) => m.role === "keeper"),
    basis: inXi ? "xi" : "absences",
  };
}

/**
 * Expected-goals rates moved by who is missing. `alpha` scales how much of a
 * side's own rate goes with its missing attack; `beta` how much the opponent
 * gains per missing regular defender (keeper counted double). Clamped so a
 * bad input can never move a rate by more than a quarter either way.
 */
export function adjustRates(
  rates: { home: number; away: number },
  home: SideAvailability | null,
  away: SideAvailability | null,
  alpha: number,
  beta: number,
): { home: number; away: number } {
  const clamp = (x: number) => Math.max(0.75, Math.min(1.25, x));
  const defence = (s: SideAvailability | null) => (s ? s.defenceLoss + (s.keeperMissing ? 1 : 0) : 0);
  const hAtt = clamp(1 - alpha * (home?.attackLoss ?? 0));
  const aAtt = clamp(1 - alpha * (away?.attackLoss ?? 0));
  const hDef = clamp(1 + beta * defence(home));
  const aDef = clamp(1 + beta * defence(away));
  return { home: rates.home * hAtt * aDef, away: rates.away * aAtt * hDef };
}
