import { NextResponse } from "next/server";
import { liveFeed } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await liveFeed();
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
