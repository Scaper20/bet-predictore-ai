import { NextResponse } from "next/server";
import { upcomingFeed } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = clamp(Number(url.searchParams.get("days") ?? 7), 1, 14);
  const league = url.searchParams.get("league") ?? undefined;

  try {
    const data = await upcomingFeed(days, league);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Fixture feed unavailable",
        detail: err instanceof Error ? err.message : "Unknown error",
        matches: [],
      },
      { status: 502 },
    );
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;
}
