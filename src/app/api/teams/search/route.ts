import { NextResponse } from "next/server";
import { searchTeams } from "@/lib/stats/queries";

export const dynamic = "force-dynamic";

/** Clubs and national teams by name, for the head-to-head pickers. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const teams = await searchTeams(q, 8);
    return NextResponse.json({ teams }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ teams: [] }, { status: 503 });
  }
}
