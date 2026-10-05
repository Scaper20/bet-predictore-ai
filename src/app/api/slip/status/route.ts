import { NextResponse, after } from "next/server";
import { getLive, getMatch } from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { supabasePublic } from "@/lib/supabase/public";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { captureMatchResults } from "@/lib/settlement-runner";
import type { Match } from "@/lib/types";
import type { LegScore } from "@/lib/slip-tracker";

export const dynamic = "force-dynamic";

/** One device rarely tracks more than a handful of games at once; this bounds a crafted request. */
const MAX_IDS = 40;
const ID_PATTERN = /^[a-z]+:[\w.-]{1,64}$/i;

/**
 * Current score and status for the matches on a user's tracked slips
 * (components/slip/use-slip-status.ts). Public and unauthenticated, like
 * /api/live: it only ever returns public fixture data.
 *
 * Cheapest source first, because the football feeds are rate limited:
 * 1. match_results — finished games already captured by the live board or
 *    the settlement cron;
 * 2. the live feed, one shared cached call for every id at once;
 * 3. a per-match lookup, cached for a minute, for whatever is left.
 * The client only asks about legs that have kicked off and aren't settled.
 */
export async function POST(request: Request) {
  let ids: string[];
  try {
    const body = (await request.json()) as { ids?: unknown };
    ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id)))].slice(0, MAX_IDS)
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ matches: {} });

  const out: Record<string, LegScore> = {};

  const db = supabasePublic();
  if (db) {
    const { data } = await db
      .from("match_results")
      .select("match_id, status, home_goals, away_goals")
      .in("match_id", ids)
      .eq("status", "finished");
    for (const row of data ?? []) {
      out[row.match_id as string] = {
        status: "finished",
        home: row.home_goals as number | null,
        away: row.away_goals as number | null,
      };
    }
  }

  let remaining = ids.filter((id) => !out[id]);
  if (remaining.length > 0) {
    const live = await cached("slip-status:live", 20_000, getLive).catch(() => [] as Match[]);
    const byId = new Map(live.map((m) => [m.id, m]));
    for (const id of remaining) {
      const m = byId.get(id);
      if (m) out[id] = toScore(m);
    }
    remaining = remaining.filter((id) => !out[id]);
  }

  const finished: Match[] = [];
  const looked = await Promise.all(
    remaining.map((id) => cached(`slip-status:match:${id}`, 60_000, () => getMatch(id)).catch(() => null)),
  );
  for (const [i, m] of looked.entries()) {
    if (!m) continue;
    out[remaining[i]] = toScore(m);
    if (m.status === "finished") finished.push(m);
  }

  // Remember finished games so the next device asking is answered from step 1.
  // Same category of write as /api/live's opportunistic capture: system-owned
  // fixture data this handler just fetched itself, nothing from the request.
  if (finished.length > 0) {
    after(async () => {
      try {
        await captureMatchResults(supabaseAdmin(), finished);
      } catch {
        // Best-effort; the next poll just looks it up again.
      }
    });
  }

  return NextResponse.json({ matches: out }, { headers: { "Cache-Control": "no-store" } });
}

function toScore(m: Match): LegScore {
  return { status: m.status, minute: m.minute ?? null, home: m.score.home, away: m.score.away };
}
