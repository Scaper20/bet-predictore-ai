import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase/public";
import { computeCalibration, isMarketFamily, type GradedPick } from "@/lib/calibration";

/**
 * Bucketed calibration data for the Track Record page's Tier-2 chart panel.
 * The Tier-1 badge computes its own aggregate score directly in the Track
 * Record Server Component (same computeCalibration(), no self-fetch) — this
 * route exists for the interactive panel's initial load and market-filter
 * refetches, and is the only place raw prediction rows get aggregated before
 * ever reaching the browser (PRD requirement: never ship raw rows client-side).
 */
export async function GET(request: Request) {
  const supabase = supabasePublic();
  if (!supabase) {
    return NextResponse.json({ available: false, reason: "not_configured" });
  }

  const marketParam = new URL(request.url).searchParams.get("market");
  const market = marketParam && isMarketFamily(marketParam) ? marketParam : null;

  const { data, error } = await supabase
    .from("predictions_log")
    .select("probability, result, market")
    .not("settled_at", "is", null);

  if (error) {
    return NextResponse.json(
      { available: false, reason: "error", detail: error.message },
      { status: 502 },
    );
  }

  const rows = (market
    ? (data ?? []).filter((row) => row.market.split(":")[0] === market)
    : data ?? []) as GradedPick[];

  const result = computeCalibration(rows);
  if (result.score === null) {
    return NextResponse.json(
      { available: false, reason: "insufficient_data", n: result.n },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  }

  return NextResponse.json(
    { available: true, market, ...result },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
