import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { captureMatchResults } from "@/lib/settlement-runner";
import { legScoresFor } from "@/lib/slip-scores";

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
  let statIds: Set<string>;
  try {
    const body = (await request.json()) as { ids?: unknown; stats?: unknown };
    const valid = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id)))].slice(0, MAX_IDS) : [];
    ids = valid(body.ids);
    // Matches with a corners or shots leg: their counts come back once finished.
    statIds = new Set(valid(body.stats).filter((id) => ids.includes(id)));
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ matches: {} });

  const { scores, finished } = await legScoresFor(ids, statIds);

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

  return NextResponse.json({ matches: scores }, { headers: { "Cache-Control": "no-store" } });
}
