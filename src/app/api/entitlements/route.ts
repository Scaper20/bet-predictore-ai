import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";

/**
 * Client-side entitlement read, for the rare gated widget mounted without a
 * server-rendered parent already holding the tier (see EntitlementProvider).
 * Never cached — this is a per-user authorization check.
 */
export async function GET() {
  const entitlement = await getEntitlement();
  return NextResponse.json(entitlement, { headers: { "Cache-Control": "no-store" } });
}
