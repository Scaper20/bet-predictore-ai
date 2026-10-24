import "server-only";

import { scanCode } from "@/lib/code-scan";
import { cached } from "@/lib/providers/cache";
import { POSTS_PER_DAY, byRank, gradeCode, rankScore, recordOf, type PosterRecord } from "./code-hub-posts-core";

export { posterName, postForViewer } from "./code-hub-posts-core";

/**
 * Community codes on the Code Hub (0070_code_hub_posts.sql): members post a
 * SportyBet code, we read and score it once (code-scan.ts), and the list is
 * ranked by that read (code-hub-posts-core.ts). Graded from match_results by
 * the settlement pass.
 */

export type { CommunityPost, PostGame } from "./code-hub-posts-core";
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

export type PostOutcome = { ok: true; post: CommunityPost } | { ok: false; error: string; status: number };

/** Read, score and post a code for a member. */
export async function postCode(userId: string, authorName: string, code: string): Promise<PostOutcome> {
  const db = await admin();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from("code_hub_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("posted_at", dayAgo);
  if ((count ?? 0) >= POSTS_PER_DAY) {
    return { ok: false, error: `You can post ${POSTS_PER_DAY} codes a day. Come back tomorrow.`, status: 429 };
  }

  const { data: existing } = await db.from("code_hub_posts").select("id").eq("code", code).neq("status", "removed").maybeSingle();
  if (existing) return { ok: false, error: "That code is already up.", status: 409 };

  const scan = await scanCode(code).catch(() => null);
  if (!scan) return { ok: false, error: "SportyBet doesn't recognise that code, or it has expired.", status: 404 };
  if (scan.total < 2) return { ok: false, error: "Post a code with at least 2 games.", status: 400 };
  if (scan.readable < 2) {
    return { ok: false, error: "We could read fewer than 2 games on that code, so we can't rank it.", status: 400 };
  }
  const kickoffs = scan.games.map((g) => g.kickoff).filter((k): k is number => typeof k === "number");
  if (kickoffs.length === 0) return { ok: false, error: "We couldn't read when these games start.", status: 400 };
  const first = Math.min(...kickoffs);
  if (first <= Date.now()) return { ok: false, error: "A game on this code has already started.", status: 400 };

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
    if (error?.code === "23505") return { ok: false, error: "That code is already up.", status: 409 };
    return { ok: false, error: "Couldn't post that just now. Try again.", status: 500 };
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
