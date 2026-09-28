import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { leagueByProviderName } from "@/lib/leagues";
import { sportyBetSelectionAddress } from "@/lib/odds/sportybet";
import { getSportyBetBookingCode, type BookingLeg } from "@/lib/booking/sportybet-booking";

/**
 * A real SportyBet booking code for the user's current slip.
 *
 * Gated behind sign-in, unlike /api/odds's read-only price lookup: this
 * triggers an actual automated browser session against SportyBet's own site
 * (see src/lib/booking/sportybet-booking.ts), which is a materially more
 * expensive and riskier action than reading a cached price, so it gets the
 * account wall plus a tighter leg cap.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** One booking is one browser session touching every leg in turn — kept well below the slip UI's own warning threshold. */
const MAX_LEGS = 8;

interface IncomingLeg {
  homeName?: unknown;
  awayName?: unknown;
  kickoff?: unknown;
  league?: unknown;
  market?: unknown;
  label?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

interface Resolved {
  fixture: string;
  label: string;
  address: BookingLeg | undefined;
}

async function resolveLeg(leg: IncomingLeg): Promise<Resolved> {
  const homeName = str(leg.homeName);
  const awayName = str(leg.awayName);
  const market = str(leg.market);
  const kickoff = str(leg.kickoff);
  const label = str(leg.label) ?? market ?? "selection";
  const fixture = homeName && awayName ? `${homeName} v ${awayName}` : "a selection";

  if (!homeName || !awayName || !market || !kickoff) return { fixture, label, address: undefined };

  const at = Date.parse(kickoff);
  if (!Number.isFinite(at)) return { fixture, label, address: undefined };

  const tournamentId = leagueByProviderName(str(leg.league) ?? "")?.ids.sportyBet;
  const address = await sportyBetSelectionAddress({ homeName, awayName, kickoff: at }, market, tournamentId).catch(
    () => undefined,
  );

  return { fixture, label, address: address ? { ...address, label } : undefined };
}

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  if (!entitlement.signedIn) {
    return NextResponse.json({ code: null, reason: "sign_in_required" }, { status: 403, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as { legs?: IncomingLeg[] } | null;
  const incoming = Array.isArray(body?.legs) ? body.legs.slice(0, MAX_LEGS) : [];
  if (incoming.length === 0) {
    return NextResponse.json({ code: null, reason: "no_legs" }, { headers: NO_STORE });
  }

  const resolved = await Promise.all(incoming.map(resolveLeg));

  // A slip missing a leg the user believes is included is worse than no slip
  // at all — the same bias match-fixture.ts applies to prices applies here to
  // whole selections, so any unresolved leg refuses the entire booking rather
  // than silently dropping it.
  const unavailable = resolved.filter((r) => !r.address).map((r) => r.fixture);
  if (unavailable.length > 0) {
    return NextResponse.json(
      { code: null, reason: "unavailable_on_sportybet", unavailable },
      { headers: NO_STORE },
    );
  }

  const legs = resolved.map((r) => r.address as BookingLeg);
  const result = await getSportyBetBookingCode(legs);
  return NextResponse.json(result, { headers: NO_STORE });
}
