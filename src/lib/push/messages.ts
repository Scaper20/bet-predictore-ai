import type { PersonalizedPick } from "@/lib/for-you";
import { quotedPrice } from "@/lib/whatsapp-digest";
import { odds, percent } from "@/lib/format";
import { sportPath } from "@/lib/routes";
import type { LegResult, TrackedLeg } from "@/lib/slip-tracker";

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
  body: "This is how KiqStat will reach you: today's codes the moment they're ready, community codes, your tracked slips as each game finishes, and the morning picks. Pro members also get Strong pick alerts.",
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

/* --------------------------------------------------------------- codes */

/** A daily Code Hub code that has just become available, as the notification names it. */
export interface HubCodeNote {
  /** The tier's id ("2", "3", "5"…). */
  tier: string;
  /** "Steady 2", "Solid 3"… */
  name: string;
}

/**
 * Today's codes are ready. A free device is told about the one code free
 * accounts get in full (and how many more Pro has); a code only Pro opens
 * is not announced to it again and again. Null when this device has nothing
 * to hear. `proMore` is how many other live codes today are Pro-only.
 */
export function hubCodesPayload(opts: { codes: HubCodeNote[]; paid: boolean; freeTier: string; proMore: number }): PushPayload | null {
  const url = sportPath("codeHub");
  if (opts.paid) {
    const n = opts.codes.length;
    if (n === 0) return null;
    return {
      title: n === 1 ? `New code: ${opts.codes[0].name}` : `Today's ${n} codes are ready`,
      body: `${opts.codes.map((c) => c.name).join(" · ")}\nTap to load ${n === 1 ? "it" : "them"} on SportyBet.`,
      url,
      tag: "hub-codes",
    };
  }
  const free = opts.codes.find((c) => c.tier === opts.freeTier);
  if (!free) return null;
  return {
    title: "Today's free code is ready",
    body: `${free.name}\nTap to load it on SportyBet.${opts.proMore > 0 ? `\n🔒 ${opts.proMore} more for Pro members.` : ""}`,
    url,
    tag: "hub-codes",
  };
}

/* ------------------------------------------------------------ community */

/** A community post, as far as a notification may say. */
export interface CommunityNote {
  author: string;
  games: number;
  /** The code's price on SportyBet, when we could read it. */
  odds: number | null;
}

/** A member posted a code, or several did in the same few minutes. */
export function communityPayload(posts: CommunityNote[]): PushPayload | null {
  const url = sportPath("codeHub");
  if (posts.length === 0) return null;
  if (posts.length === 1) {
    const p = posts[0];
    return {
      title: "New community code",
      body: `${p.author} posted a ${p.games}-game code${p.odds ? ` at ${odds(p.odds)} odds` : ""}.\nSee how we rate it.`,
      url,
      tag: "community",
    };
  }
  const authors = [...new Set(posts.map((p) => p.author))];
  const named = authors.slice(0, 2).join(", ");
  return {
    title: `${posts.length} new community codes`,
    body: `From ${named}${authors.length > 2 ? ` and ${authors.length - 2} more` : ""}.\nSee them ranked by our read.`,
    url,
    tag: "community",
  };
}

/* ---------------------------------------------------------------- slips */

/** What changed on a tracked slip since the device was last told. */
export interface SlipNote {
  slipId: string;
  legs: TrackedLeg[];
  /** Every settled leg so far, by match id (includes the fresh ones). */
  results: Record<string, LegResult>;
  /** The legs that settled since the last notification. */
  fresh: string[];
}

function legLine(leg: TrackedLeg, r: LegResult): string {
  const verb = r.grade === "win" ? "won" : r.grade === "lose" ? "lost" : r.abandoned ? "was called off" : "was refunded";
  const score = r.abandoned ? " v " : ` ${r.home}–${r.away} `;
  return `${leg.homeName}${score}${leg.awayName}: ${leg.label} ${verb}`;
}

/**
 * The notification for a tracked slip after one or more of its games
 * finished. A lost leg ends the slip on the spot, whatever is still to play;
 * the last game in tells a landed slip; anything between is progress. All
 * the same tag, so a phone shows one notification per slip that updates in
 * place. Null when nothing fresh settled.
 */
export function slipPayload(note: SlipNote): PushPayload | null {
  const fresh = note.legs.filter((l) => note.fresh.includes(l.matchId) && note.results[l.matchId]);
  if (fresh.length === 0) return null;
  const total = note.legs.length;
  const settled = note.legs.filter((l) => note.results[l.matchId]);
  const won = settled.filter((l) => note.results[l.matchId].grade === "win").length;
  const voided = settled.filter((l) => note.results[l.matchId].grade === "void").length;
  const lostLeg = fresh.find((l) => note.results[l.matchId].grade === "lose");
  const base = { url: sportPath("trackedSlips"), tag: `slip-${note.slipId}` };
  const slip = total === 1 ? "Your slip" : `Your ${total}-leg slip`;

  if (lostLeg) {
    const left = total - settled.length;
    return {
      ...base,
      title: "❌ Slip out",
      body: `${legLine(lostLeg, note.results[lostLeg.matchId])}\n${slip} is out${won > 0 ? ` after ${won} ${won === 1 ? "win" : "wins"}` : ""}.${left > 0 ? ` ${left === 1 ? "1 game" : `${left} games`} still to play can't change that.` : ""}`,
    };
  }

  if (settled.length === total) {
    if (won === 0) {
      return { ...base, title: "↩️ Slip void", body: `Every game on ${slip.toLowerCase()} was called off or refunded. Nothing to settle.` };
    }
    return {
      ...base,
      title: "🎉 Slip landed",
      body: `${legLine(fresh[fresh.length - 1], note.results[fresh[fresh.length - 1].matchId])}\n${slip} landed: all ${total} legs${voided > 0 ? ` (${voided} refunded)` : " won"}.`,
    };
  }

  const left = total - settled.length;
  const lines = fresh.slice(0, 2).map((l) => legLine(l, note.results[l.matchId]));
  if (fresh.length > 2) lines.push(`+${fresh.length - 2} more in`);
  return {
    ...base,
    title: `✅ ${settled.length} of ${total} in`,
    body: `${lines.join("\n")}\n${left} ${left === 1 ? "game" : "games"} to play.`,
  };
}
