import { NextResponse } from "next/server";
import { matchDetail } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const detail = await matchDetail(decodeURIComponent(id));
    if (!detail) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not build prediction", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
