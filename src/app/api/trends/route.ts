import { NextResponse } from "next/server";
import { trends } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await trends(), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Trends unavailable", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
