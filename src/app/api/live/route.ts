import { NextResponse, after } from "next/server";
import { liveFeed } from "@/lib/service";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { captureMatchResults, runSettlementPass } from "@/lib/settlement-runner";

export const dynamic = "force-dynamic";

// Best-effort, per-instance throttle — /api/live is polled by every
// visitor's live-board every ~15-20s, so without this every concurrent poll
// would redundantly re-run the same DB sweep. Resets on cold start, which is
// fine: worst case is one extra pass, never a missed one.
const OPPORTUNISTIC_COOLDOWN_MS = 30_000;
let lastOpportunisticRunAt = 0;

function shouldRunOpportunisticPass(): boolean {
  const now = Date.now();
  if (now - lastOpportunisticRunAt < OPPORTUNISTIC_COOLDOWN_MS) return false;
  lastOpportunisticRunAt = now;
  return true;
}

export async function GET() {
  try {
    const data = await liveFeed();

    after(() => {
      if (!shouldRunOpportunisticPass()) return;
      const admin = supabaseAdmin();
      return Promise.allSettled([
        captureMatchResults(admin, data.matches),
        runSettlementPass(admin, { maxAgeHours: 6 }),
      ]);
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Live feed unavailable", detail: message(err), matches: [] },
      { status: 502 },
    );
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
