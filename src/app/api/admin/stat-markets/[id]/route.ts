import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { matchDetail } from "@/lib/service";
import { fixtureStatMarkets } from "@/lib/stat-markets-service";

export const dynamic = "force-dynamic";

/**
 * Admin only: the corners / cards / shots / extra goal markets for one
 * fixture, as the model would publish them. Not linked from the site; for
 * checking the numbers before the markets go live (docs/stats-markets.md).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const markets = await fixtureStatMarkets(detail.match, detail.prediction);
  return NextResponse.json(
    { match: { id: detail.match.id, home: detail.match.home.name, away: detail.match.away.name, kickoff: detail.match.kickoff }, ...markets },
    { headers: { "Cache-Control": "no-store" } },
  );
}
