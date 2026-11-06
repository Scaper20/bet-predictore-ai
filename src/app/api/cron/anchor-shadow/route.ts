import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { anchorShadow } from "@/lib/service";
import { boardPrices } from "@/lib/odds/anchor-shadow";

export const runtime = "nodejs";
export const maxDuration = 120;

const WEIGHT = 0.5;

/**
 * Anchoring shadow run (docs/model-audit-teams-2026-11.md, L5). Daily: for each
 * game kicking off in the next three days that has a SportyBet price and no row
 * yet, store the model's 1X2 and over 2.5 chances as served, the same chances
 * anchored halfway to the price, and the price. The first price seen is kept
 * (early-week, the one anchoring would use). Nothing published reads this;
 * score it after the games finish with scripts/sql/anchor-shadow-score.sql.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const now = new Date();
  const { data: hist, error } = await db
    .from("sportybet_price_history")
    .select("match_id, kickoff, captured_at, prices")
    .gte("kickoff", now.toISOString())
    .lt("kickoff", new Date(now.getTime() + 3 * 86_400_000).toISOString())
    .order("captured_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The first usable price for each game.
  const first = new Map<string, { kickoff: string; at: string; prices: NonNullable<ReturnType<typeof boardPrices>> }>();
  for (const r of hist ?? []) {
    const id = r.match_id as string | null;
    if (!id || first.has(id)) continue;
    const prices = boardPrices(r.prices);
    if (prices) first.set(id, { kickoff: r.kickoff as string, at: r.captured_at as string, prices });
  }
  const ids = [...first.keys()];
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("anchor_shadow").select("match_id").in("match_id", ids.slice(i, i + 200));
    for (const d of data ?? []) done.add(d.match_id as string);
  }

  let stored = 0;
  let failed = 0;
  for (const id of ids.filter((x) => !done.has(x)).slice(0, 40)) {
    const f = first.get(id)!;
    try {
      const s = await anchorShadow(id, f.prices, WEIGHT);
      if (!s) continue;
      const fair = (xs: number[]) => {
        const t = xs.reduce((a, x) => a + 1 / x, 0);
        return xs.map((x) => 1 / x / t);
      };
      const [h, d, a] = fair([f.prices.oneXTwo.home, f.prices.oneXTwo.draw, f.prices.oneXTwo.away]);
      const [o] = fair([f.prices.overUnder.over, f.prices.overUnder.under]);
      const { error: werr } = await db.from("anchor_shadow").upsert(
        {
          match_id: id, league_code: s.league, kickoff: f.kickoff, price_captured_at: f.at, weight: WEIGHT,
          plain: s.plain, anchored: s.anchored, market: { home: h, draw: d, away: a, o25: o },
        },
        { onConflict: "match_id", ignoreDuplicates: true },
      );
      if (werr) failed++;
      else stored++;
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ candidates: ids.length, alreadyStored: done.size, stored, failed });
}
