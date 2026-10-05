import { NextResponse } from "next/server";
import { leagueByCode } from "@/lib/leagues";
import { liveLeagueTable } from "@/lib/stats/live-table";

export const dynamic = "force-dynamic";

/** The live table for one competition, polled by the table while its games are on. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!leagueByCode(code)) return NextResponse.json({ error: "Unknown competition" }, { status: 404 });
  try {
    const table = await liveLeagueTable(code);
    return NextResponse.json(table, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch {
    return NextResponse.json({ error: "Table unavailable" }, { status: 503 });
  }
}
