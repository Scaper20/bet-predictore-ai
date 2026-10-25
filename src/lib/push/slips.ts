import { legsToPoll, settleLeg, slipSettled, type LegResult, type LegScore, type TrackedLeg } from "@/lib/slip-tracker";
import { statKindOf } from "@/lib/settlement";

/**
 * A tracked slip as a device hands it to the server (api/push/slips), and the
 * checks it passes on the way in. Pure, shared by the route and its tests.
 *
 * Everything in a slip is something the device's own user typed or tapped,
 * and it only ever comes back to that same device in a notification, but it
 * is still bounded: lengths, counts, shapes. Nothing here is trusted to be a
 * real fixture; grading uses the match ids against our own score sources.
 */

/** As long as the longest code we book (odds/booking.ts MAX_LEGS); 0080 holds the table to the same. */
export const MAX_SLIP_LEGS = 50;
/** Slips the server keeps per device; the oldest give way. */
export const MAX_SLIPS_PER_DEVICE = 30;

const MATCH_ID = /^[a-z]+:[\w.-]{1,64}$/i;
const MARKET = /^[\w:.+-]{1,200}$/;
const SLIP_ID = /^[\w-]{1,64}$/;
const GRADES = new Set(["win", "lose", "void"]);

export interface ParsedSlip {
  slipId: string;
  legs: TrackedLeg[];
  /** What the device already shows as settled, so it is not announced again. */
  results: Record<string, LegResult>;
  firstKickoff: string;
  lastKickoff: string;
  /** A corners or shots leg waits for counts the matches table never carries. */
  needsPoll: boolean;
}

const text = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseLeg(value: unknown): TrackedLeg | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const matchId = typeof v.matchId === "string" && MATCH_ID.test(v.matchId) ? v.matchId : null;
  const market = typeof v.market === "string" && MARKET.test(v.market) ? v.market : null;
  const homeName = text(v.homeName);
  const awayName = text(v.awayName) ?? "";
  const label = text(v.label);
  const kickoff = typeof v.kickoff === "string" && Number.isFinite(Date.parse(v.kickoff)) ? new Date(v.kickoff).toISOString() : null;
  if (!matchId || !market || !homeName || !label || !kickoff) return null;
  return {
    matchId,
    fixture: text(v.fixture) ?? `${homeName} v ${awayName}`,
    homeName,
    awayName,
    league: text(v.league) ?? "",
    kickoff,
    market,
    label,
    probability: num(v.probability) ?? 0,
    fairOdds: num(v.fairOdds) ?? 0,
  };
}

function parseResults(value: unknown, legs: TrackedLeg[]): Record<string, LegResult> {
  const out: Record<string, LegResult> = {};
  if (!value || typeof value !== "object") return out;
  const ids = new Set(legs.map((l) => l.matchId));
  for (const [matchId, r] of Object.entries(value as Record<string, unknown>)) {
    if (!ids.has(matchId) || !r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const home = num(v.home);
    const away = num(v.away);
    if (typeof v.grade !== "string" || !GRADES.has(v.grade) || home === null || away === null) continue;
    out[matchId] = {
      home,
      away,
      grade: v.grade as LegResult["grade"],
      ...(v.abandoned === "postponed" || v.abandoned === "cancelled" ? { abandoned: v.abandoned } : {}),
    };
  }
  return out;
}

/** A slip from a request body, or null if anything is off about it. */
export function parseSlip(value: unknown): ParsedSlip | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { id?: unknown; legs?: unknown; results?: unknown };
  const slipId = typeof v.id === "string" && SLIP_ID.test(v.id) ? v.id : null;
  if (!slipId || !Array.isArray(v.legs) || v.legs.length < 1 || v.legs.length > MAX_SLIP_LEGS) return null;
  const legs: TrackedLeg[] = [];
  for (const raw of v.legs) {
    const leg = parseLeg(raw);
    if (!leg) return null;
    legs.push(leg);
  }
  const kicks = legs.map((l) => Date.parse(l.kickoff)).sort((a, b) => a - b);
  return {
    slipId,
    legs,
    results: parseResults(v.results, legs),
    firstKickoff: new Date(kicks[0]).toISOString(),
    lastKickoff: new Date(kicks[kicks.length - 1]).toISOString(),
    needsPoll: legs.some((l) => statKindOf(l.market) !== null),
  };
}

/** A slip not decided this long after its last kickoff is let go (counts that never arrived void a leg after three days). */
export const SLIP_EXPIRES_MS = 4 * 86_400_000;

export interface GradedSlip {
  /** Every settled leg, old and new. */
  results: Record<string, LegResult>;
  /** The legs that settled in this pass: what the device has yet to hear. */
  fresh: string[];
  /** Nothing more to say: a leg lost, every leg in, or too old to wait for. */
  done: boolean;
}

/**
 * One pass over a stored slip: settles the legs that have kicked off and
 * finished, with the same grading as the Tracked slips page (settleLeg), and
 * says what is new. `scores` is what the feed says about each match id.
 */
export function gradeSlip(
  slip: { legs: TrackedLeg[]; results: Record<string, LegResult>; lastKickoff: string },
  scores: Record<string, LegScore>,
  now: number,
): GradedSlip {
  const results = { ...slip.results };
  const fresh: string[] = [];
  for (const leg of legsToPoll(slip.legs, slip.results, now)) {
    const score = scores[leg.matchId];
    const result = score ? settleLeg(leg, score, now) : null;
    if (!result) continue;
    results[leg.matchId] = result;
    fresh.push(leg.matchId);
  }
  const expired = Date.parse(slip.lastKickoff) < now - SLIP_EXPIRES_MS;
  return { results, fresh, done: slipSettled(slip.legs, results) || expired };
}
