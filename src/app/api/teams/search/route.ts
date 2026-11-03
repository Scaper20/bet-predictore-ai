import { NextResponse } from "next/server";
import { searchTeams } from "@/lib/stats/queries";
import { searchPlayers } from "@/lib/player-page";

export const dynamic = "force-dynamic";

/** Clubs and national teams by name (head-to-head pickers); players too with ?with=players (header search). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const withPlayers = url.searchParams.get("with") === "players";
  try {
    const [teams, players] = await Promise.all([
      searchTeams(q, 8),
      withPlayers ? searchPlayers(q).catch(() => []) : Promise.resolve(undefined),
    ]);
    return NextResponse.json(players ? { teams, players } : { teams }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ teams: [] }, { status: 503 });
  }
}
