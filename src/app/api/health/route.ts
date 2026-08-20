import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/service";
import { cacheStats } from "@/lib/providers/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...systemStatus(), cache: cacheStats() });
}
