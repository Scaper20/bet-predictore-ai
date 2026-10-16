import type { PersonalizedPick } from "@/lib/for-you";
import { quotedPrice } from "@/lib/whatsapp-digest";
import { odds, percent } from "@/lib/format";
import { sportPath } from "@/lib/routes";

/**
 * What the notifications say. Pure — the crons do the fetching and sending —
 * so the wording rules are tested directly.
 *
 * The payload is what public/sw.js reads in its push handler: `url` is the
 * page a tap opens and must be a path on this site; `tag` makes a newer
 * notification of the same kind replace the older one instead of stacking.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Yesterday's settled picks from the track record. Voids are left out. */
export interface DayRecord {
  won: number;
  lost: number;
}

/** Picks named in the body; the rest go into "+N more". */
const PICKS_NAMED = 2;

function pickLine(p: PersonalizedPick): string {
  return `${p.homeTeam} v ${p.awayTeam}: ${p.label} at ${odds(quotedPrice(p).price)}`;
}

function recordLine(r: DayRecord): string {
  const settled = r.won + r.lost;
  return `Yesterday ${r.won} of ${settled} won (${percent(r.won / settled)}).`;
}

/**
 * The morning notification, shaped by what this device asked for.
 *
 * Yesterday's record is reported whatever it was: a notification that only
 * turns up on good days is an advert, not a track record. Null when there is
 * nothing this device wants to hear about.
 */
export function dailyPayload(opts: {
  picks: PersonalizedPick[];
  record: DayRecord | null;
  topics: { picks: boolean; results: boolean };
  /** Pro-league picks held back from a free device (lib/pro-leagues.ts). */
  proHeld?: number;
}): PushPayload | null {
  const record = opts.topics.results && opts.record && opts.record.won + opts.record.lost > 0 ? opts.record : null;
  const picks = opts.topics.picks ? opts.picks : [];

  if (picks.length > 0) {
    const n = picks.length;
    const named = picks.slice(0, PICKS_NAMED).map(pickLine);
    const more = n - named.length;
    const lines = [...named];
    if (more > 0) lines.push(`+${more} more`);
    const held = opts.topics.picks ? (opts.proHeld ?? 0) : 0;
    if (held > 0) lines.push(`🔒 +${held} in Pro leagues for Pro members`);
    if (record) lines.push(recordLine(record));
    return {
      title: n === 1 ? "Today's pick is ready" : `Today's ${n} picks are ready`,
      body: lines.join("\n"),
      url: sportPath("predictions"),
      tag: "daily",
    };
  }

  if (record) {
    return {
      title: "Yesterday's results",
      body: `${record.won} of ${record.won + record.lost} KiqStat picks won (${percent(record.won / (record.won + record.lost))}). Tap for the full track record.`,
      url: sportPath("trackRecord"),
      tag: "daily",
    };
  }

  return null;
}

export const TEST_PAYLOAD: PushPayload = {
  title: "Notifications are on",
  body: "This is how KiqStat will reach you: today's picks each morning and how yesterday's did. Pro members also get Strong pick alerts at kick-off and full time.",
  url: sportPath("predictions"),
  tag: "test",
};

/** A Strong pick from the track record log, as the match-time alerts use it. */
export interface StrongPickEvent {
  matchId: string;
  home: string;
  away: string;
  label: string;
  probability: number;
  kickoff: string;
  result?: "win" | "lose" | "push" | null;
  score?: { home: number | null; away: number | null };
}

const watTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" });

/** Shortly before a Strong pick kicks off. */
export function strongKickoffPayload(e: StrongPickEvent): PushPayload {
  return {
    title: "⭐ Strong pick kicks off soon",
    body: `${e.home} v ${e.away} at ${watTime(e.kickoff)}\n${e.label} · ${percent(e.probability)}`,
    url: `/football/match/${encodeURIComponent(e.matchId)}`,
    tag: `kickoff-${e.matchId}`,
  };
}

/** After a Strong pick is graded. Losses are sent too: a record only reported on good days is an advert. */
export function strongResultPayload(e: StrongPickEvent): PushPayload | null {
  if (e.result !== "win" && e.result !== "lose") return null;
  const score =
    e.score && e.score.home !== null && e.score.away !== null ? ` ${e.score.home}–${e.score.away} ` : " v ";
  return {
    title: e.result === "win" ? "✅ Strong pick won" : "❌ Strong pick lost",
    body: `${e.home}${score}${e.away}\n${e.label}`,
    url: sportPath("trackRecord"),
    tag: `result-${e.matchId}`,
  };
}
