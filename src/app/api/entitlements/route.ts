import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Client-side entitlement read, for the rare gated widget mounted without a
 * server-rendered parent already holding the tier (see EntitlementProvider).
 * Never cached — this is a per-user authorization check.
 */
export async function GET() {
  const entitlement = await getEntitlement();
  return NextResponse.json(entitlement, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

