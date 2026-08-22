import { NextResponse } from "next/server";
import { liveWinProbability } from "@/lib/service";
import { getEntitlement, meets } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

// Personalised (entitlement-gated) and stale within seconds either way —
// never shared-cacheable.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const entitlement = await getEntitlement();
  if (!meets(entitlement.tier, "vip")) {
    return NextResponse.json({ error: "This is a VIP feature.", locked: true }, { status: 403, headers: NO_STORE });
  }

  try {
    const live = await liveWinProbability(decodeURIComponent(id));
    if (!live) {
      return NextResponse.json({ error: "Match is not live" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(live, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not compute live probability", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502, headers: NO_STORE },
    );
  }
}
