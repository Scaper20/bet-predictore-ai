import "server-only";

import { SCAN_FAILURE, scanCodeOrWhy, type CodeScan } from "@/lib/code-scan";
import { bookingCodeFor } from "@/lib/odds/booking-code";
import type { BookingLeg } from "@/lib/odds/booking";
import { fetchEventMarkets } from "@/lib/odds/sportybet-direct";
import { cached } from "@/lib/providers/cache";
import { POSTS_PER_DAY, byRank, gradeCode, postProblems, rankScore, recordOf, type PostProblem, type PosterRecord } from "./code-hub-posts-core";

export { posterName, postForViewer } from "./code-hub-posts-core";

/**
 * Community codes on the Code Hub (0070_code_hub_posts.sql): members post a
 * SportyBet code, we read and score it once (code-scan.ts), and the list is
 * ranked by that read (code-hub-posts-core.ts). Graded from match_results by
 * the settlement pass.
 */

export type { CommunityPost, PostGame, PostProblem } from "./code-hub-posts-core";
import type { CommunityPost, PostGame } from "./code-hub-posts-core";

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

const COLUMNS =
  "id, code, user_id, author_name, posted_at, games, readable, odds, chance, fairness, score, first_kickoff, last_kickoff, status, result";

type Row = {
  id: number;
  code: string;
  user_id: string;
  author_name: string;
  posted_at: string;
  games: PostGame[];
  readable: number;
  odds: number | null;
  chance: number | null;
  fairness: number | null;
  score: number;
  first_kickoff: string;
  last_kickoff: string;
  status: CommunityPost["status"];
  result: CommunityPost["result"];
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function fromRow(r: Row, record: PosterRecord): CommunityPost {
  return {
    id: r.id,
    code: r.code,
    authorName: r.author_name,
    record,
    postedAt: r.posted_at,
    games: r.games,
    readable: r.readable,
    odds: num(r.odds),
    chance: num(r.chance),
    fairness: num(r.fairness),
    score: Number(r.score),
    firstKickoff: r.first_kickoff,
    lastKickoff: r.last_kickoff,
    status: r.status,
    result: r.result,
  };
}

/** Each poster's landed / missed from their settled posts. */
async function records(userIds: readonly string[]): Promise<Map<string, PosterRecord>> {
  const out = new Map<string, PosterRecord>();
  if (userIds.length === 0) return out;
  const { data } = await (await admin())
    .from("code_hub_posts")
    .select("user_id, result")
    .in("user_id", [...new Set(userIds)])
    .eq("status", "settled");
  const by = new Map<string, (string | null)[]>();
  for (const r of data ?? []) by.set(r.user_id as string, [...(by.get(r.user_id as string) ?? []), r.result as string | null]);
  for (const id of userIds) out.set(id, recordOf(by.get(id) ?? []));
  return out;
}

/**
 * The list: codes still to start, best first, then codes in play and the last
 * day's settled ones (so a poster sees how theirs went). Cached a minute.
 */
export function communityPosts(): Promise<{ open: CommunityPost[]; recent: CommunityPost[] }> {
  return cached("code-hub:posts", 60_000, async () => {
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { data, error } = await (await admin())
        .from("code_hub_posts")
        .select(COLUMNS)
        .neq("status", "removed")
        .gte("last_kickoff", since)
        .order("posted_at", { ascending: false })
        .limit(200);
      if (error || !data) return { open: [], recent: [] };
      const rows = data as Row[];
      const recs = await records(rows.map((r) => r.user_id));
      const posts = rows.map((r) => fromRow(r, recs.get(r.user_id) ?? { landed: 0, missed: 0 }));
      const now = Date.now();
      const open = posts.filter((p) => p.status === "live" && Date.parse(p.firstKickoff) > now).sort(byRank);
      const recent = posts.filter((p) => !open.includes(p)).slice(0, 20);
      return { open, recent };
    } catch {
      return { open: [], recent: [] };
    }
  });
}

export type PostOutcome =
  | { ok: true; post: CommunityPost; /** Set when the games that couldn't go up were left off and the rest booked afresh. */ rebooked?: { from: string; left: PostProblem[] } }
  | {
      ok: false;
      error: string;
      status: number;
      /** The games that kept the code from going up, by name. */
      problems?: PostProblem[];
      /** Whether leaving them off would still leave a code worth posting (2 games or more). */
      canFix?: boolean;
      /** When the poster's next daily slot opens, epoch ms. */
      nextAt?: number;
    };

/** Fewest games a posted code may have. */
const MIN_GAMES = 2;

/**
 * Read, score and post a code for a member.
 *
 * A code with games that can't go up (started, about to, gone from
 * SportyBet, unreadable) is not just refused: the games are named, and when
 * the poster says to leave them off (`drop`, their SportyBet event ids) the
 * rest are booked as a fresh code with the same picks and that is posted.
 */
export async function postCode(userId: string, authorName: string, code: string, drop: readonly string[] = []): Promise<PostOutcome> {
  const db = await admin();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: today } = await db
    .from("code_hub_posts")
    .select("posted_at")
    .eq("user_id", userId)
    .gte("posted_at", dayAgo)
    .order("posted_at", { ascending: true });
  if ((today?.length ?? 0) >= POSTS_PER_DAY) {
    const nextAt = Date.parse(today![0].posted_at as string) + 86_400_000;
    return { ok: false, error: `You've posted ${POSTS_PER_DAY} codes in the last 24 hours.`, status: 429, nextAt };
  }

  const already = await alreadyUp(db, code, userId);
  if (already) return already;

  const read = await scanCodeOrWhy(code).catch(() => ({ why: "unreachable" as const }));
  if (!("scan" in read)) return { ok: false, ...SCAN_FAILURE[read.why] };
  const scan = read.scan;
  if (scan.total < MIN_GAMES) return { ok: false, error: `A posted code needs at least ${MIN_GAMES} games; this one has ${scan.total}.`, status: 400 };

  const problems = postProblems(scan.games);
  if (problems.length > 0) {
    const fixable = scan.total - problems.length >= MIN_GAMES;
    const dropping = new Set(drop);
    // Asked to leave them off, and every game that needs it is among those named.
    if (fixable && problems.every((p) => dropping.has(p.eventId))) {
      return repost(userId, authorName, scan, dropping, problems);
    }
    const n = problems.length;
    return {
      ok: false,
      error: fixable
        ? `${n === 1 ? "One game" : `${n} games`} on this code can't go up. Leave ${n === 1 ? "it" : "them"} off and we'll post the rest as a new code.`
        : `Only ${scan.total - n} of the ${scan.total} games on this code can go up, and a posted code needs at least ${MIN_GAMES}.`,
      status: 422,
      problems,
      canFix: fixable,
    };
  }
  return insertPost(db, userId, authorName, scan);
}

/** The code already up: by this poster, or by someone else. */
async function alreadyUp(db: Awaited<ReturnType<typeof admin>>, code: string, userId: string): Promise<PostOutcome | null> {
  const { data: existing } = await db.from("code_hub_posts").select("id, user_id").eq("code", code).neq("status", "removed").maybeSingle();
  if (!existing) return null;
  return {
    ok: false,
    error: existing.user_id === userId ? "You've already posted this code: it's in the list." : "Someone has already posted this code: it's in the list.",
    status: 409,
  };
}

/**
 * The code's other games, booked afresh with exactly the picks they had
 * (SportyBet's own selections, Bet Builders included), and posted.
 */
async function repost(
  userId: string,
  authorName: string,
  scan: CodeScan,
  drop: ReadonlySet<string>,
  left: PostProblem[],
): Promise<PostOutcome> {
  const keep = scan.games.filter((g) => !drop.has(g.eventId));
  const legs: BookingLeg[] = [];
  for (const g of keep) {
    if (!g.market || g.kickoff === null) {
      return { ok: false, error: `We couldn't rebook ${g.homeName ?? "a game"} v ${g.awayName ?? "?"}. Try posting the code again.`, status: 422 };
    }
    // A Bet Builder is priced from the event's markets when booked.
    const markets = g.builder ? ((await fetchEventMarkets(g.eventId).catch(() => null)) ?? undefined) : undefined;
    legs.push({ market: g.market, eventId: g.eventId, kickoff: g.kickoff, ...(markets ? { markets } : {}) });
  }
  const booked = await bookingCodeFor(legs).catch(() => null);
  if (!booked || (!booked.ok && booked.reason === "unavailable")) {
    return { ok: false, error: "SportyBet isn't taking new codes right now, so we couldn't post the rest. Try again in a minute.", status: 503 };
  }
  if (!booked.ok) {
    // A pick SportyBet won't book any more: name its game, so it can be left off too.
    const refused = booked.problems.flatMap((p) => ("index" in p ? [keep[p.index]] : [])).filter((g, i, all) => g && all.indexOf(g) === i);
    const more: PostProblem[] = refused.map((g) => ({
      eventId: g.eventId,
      homeName: g.homeName,
      awayName: g.awayName,
      kickoff: g.kickoff,
      label: g.label,
      issue: "unlisted",
      why: "SportyBet won't book this pick any more.",
    }));
    const all = [...left, ...more];
    return {
      ok: false,
      error: more.length ? "SportyBet won't book some of the other picks either. Leave them off too?" : "SportyBet wouldn't book the rest just now. Try again shortly.",
      status: 422,
      problems: all,
      canFix: scan.total - all.length >= MIN_GAMES,
    };
  }
  const fresh = await scanCodeOrWhy(booked.bookingCode).catch(() => ({ why: "unreachable" as const }));
  if (!("scan" in fresh)) return { ok: false, ...SCAN_FAILURE[fresh.why] };
  const db = await admin();
  const already = await alreadyUp(db, fresh.scan.code, userId);
  if (already) return already;
  const out = await insertPost(db, userId, authorName, fresh.scan);
  return out.ok ? { ...out, rebooked: { from: scan.code, left } } : out;
}

async function insertPost(db: Awaited<ReturnType<typeof admin>>, userId: string, authorName: string, scan: CodeScan): Promise<PostOutcome> {
  if (scan.readable < MIN_GAMES) {
    return { ok: false, error: `We could read only ${scan.readable} of the games on that code, so we can't rank it.`, status: 400 };
  }
  const kickoffs = scan.games.map((g) => g.kickoff).filter((k): k is number => typeof k === "number");
  if (kickoffs.length === 0) return { ok: false, error: "We couldn't read when these games start.", status: 400 };
  const first = Math.min(...kickoffs);

  const games: PostGame[] = scan.games.map((g) => ({
    matchId: g.matchId,
    leagueCode: g.leagueCode,
    market: g.market,
    label: g.label,
    homeName: g.homeName,
    awayName: g.awayName,
    kickoff: g.kickoff,
    probability: g.probability,
    verdict: g.verdict,
    ...(g.source && g.source !== "model" ? { source: g.source } : {}),
  }));
  const { data, error } = await db
    .from("code_hub_posts")
    .insert({
      code: scan.code.toUpperCase(),
      user_id: userId,
      author_name: authorName,
      games,
      games_count: scan.total,
      readable: scan.readable,
      odds: scan.odds,
      chance: scan.chance,
      fairness: scan.fairness,
      score: rankScore(scan.chance, scan.fairness),
      first_kickoff: new Date(first).toISOString(),
      last_kickoff: new Date(Math.max(...kickoffs)).toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    // The unique index: someone posted it a moment ago.
    if (error?.code === "23505") return { ok: false, error: "Someone has just posted this code: it's in the list.", status: 409 };
    return { ok: false, error: "Couldn't save your post just now. Try again.", status: 500 };
  }
  const recs = await records([userId]);
  return { ok: true, post: fromRow(data as Row, recs.get(userId) ?? { landed: 0, missed: 0 }) };
}

/**
 * Grades live posts whose games have kicked off, from match_results only:
 * the predictions settlement has already cached most of these scores.
 */
export async function settleCommunityPosts(): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("code_hub_posts")
    .select("id, games, last_kickoff")
    .eq("status", "live")
    .lt("first_kickoff", new Date().toISOString())
    .limit(300);
  if (!data || data.length === 0) return 0;
  const ids = [...new Set(data.flatMap((r) => (r.games as PostGame[]).map((g) => g.matchId).filter((m): m is string => !!m)))];
  const scores = new Map<string, { home: number; away: number; ht?: { home: number; away: number } | null }>();
  if (ids.length > 0) {
    const { data: results } = await db
      .from("match_results")
      .select("match_id, home_goals, away_goals")
      .in("match_id", ids)
      .eq("status", "finished");
    for (const r of results ?? []) {
      if (typeof r.home_goals === "number" && typeof r.away_goals === "number") {
        scores.set(r.match_id as string, { home: r.home_goals, away: r.away_goals });
      }
    }
    // Half-time scores, for picks settled on the halves (half-time/full-time, 2nd-half lines).
    const uuids = [...scores.keys()].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (uuids.length > 0) {
      const { data: halves } = await db.from("matches").select("id, ht_home, ht_away").in("id", uuids);
      for (const m of halves ?? []) {
        const s = scores.get(m.id as string);
        if (s && typeof m.ht_home === "number" && typeof m.ht_away === "number") s.ht = { home: m.ht_home, away: m.ht_away };
      }
    }
  }
  let n = 0;
  for (const row of data) {
    const result = gradeCode(row.games as PostGame[], scores);
    // A game we can't grade would hold a post open for ever; after three days it is closed without a result.
    const stale = Date.parse(row.last_kickoff as string) < Date.now() - 3 * 86_400_000;
    if (!result && !stale) continue;
    const { error } = await db
      .from("code_hub_posts")
      .update({ status: "settled", result, settled_at: new Date().toISOString() })
      .eq("id", row.id as number);
    if (!error) n++;
  }
  return n;
}

/** For the admin list: every post from the last two days, newest first. */
export async function recentPostsForAdmin(): Promise<(CommunityPost & { userId: string })[]> {
  const { data } = await (await admin())
    .from("code_hub_posts")
    .select(COLUMNS)
    .gte("posted_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("posted_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as Row[]).map((r) => ({ ...fromRow(r, { landed: 0, missed: 0 }), userId: r.user_id }));
}
