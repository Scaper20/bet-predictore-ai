import { NextResponse } from "next/server";
import { matchDetail } from "@/lib/service";
import { getEntitlement, meets } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

// Personalised per caller (see below) — must never be shared-cached, or one
// viewer's entitled response could be served to another unentitled request.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const detail = await matchDetail(decodeURIComponent(id));
    if (!detail) {
      return NextResponse.json({ error: "Match not found" }, { status: 404, headers: NO_STORE });
    }

    // Real, server-side enforcement: this used to return matchDetail()
    // wholesale to anyone, unauthenticated — Asian Handicap lines and the
    // full enhanced analysis body were retrievable by a bare curl regardless of
    // tier. Redact based on the caller's actual entitlement instead of
    // relying on the client-side <Gate> to just not render it.
    const entitlement = await getEntitlement();
    // Since the pass became "all of Pro for a window", the full analysis is a
    // pass-level feature too; Pro's difference is that it never runs out.
    const hasPass = meets(entitlement.tier, "pass");

    const body = {
      ...detail,
      prediction: {
        ...detail.prediction,
        asianHandicap: hasPass ? detail.prediction.asianHandicap : [],
        // picks[] carries its own Asian-Handicap-derived entries (see
        // rankPicks() in model/predict.ts) — filtering asianHandicap alone
        // leaves the same data leaking out through this second list.
        picks: hasPass
          ? detail.prediction.picks
          : detail.prediction.picks.filter((p) => p.group !== "Asian Handicap"),
      },
      analysis: {
        ...detail.analysis,
        body: hasPass ? detail.analysis.body : detail.analysis.body.slice(0, 1),
        factors: hasPass ? detail.analysis.factors : [],
      },
      entitlement: { tier: entitlement.tier },
    };

    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not build prediction", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502, headers: NO_STORE },
    );
  }
}
