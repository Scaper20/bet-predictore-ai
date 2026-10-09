import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import type { BookableLeg } from "@/lib/odds/booking";
import { bookSlip } from "@/lib/odds/sportybet-booking";

/**
 * Book the user's slip on SportyBet and hand back the share code.
 *
 * Like /api/odds, the slip lives in the browser, so the client sends what it
 * holds and the server resolves each leg to a SportyBet fixture by club and
 * kickoff. Unlike /api/odds this spends metered credits on a write-shaped call,
 * so it is user-triggered only, requires an account, and is throttled per user
 * on top of the selection-set cache inside bookSlip.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** SportyBet's own slip limit is higher; this bounds a hostile payload. */
const MAX_LEGS = 20;

const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 6;
const recent = new Map<string, number[]>();

/** True when this user has booked too often in the last minute. */
function throttled(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < THROTTLE_WINDOW_MS);
  if (hits.length >= THROTTLE_MAX) {
    recent.set(userId, hits);
    return true;
  }
  hits.push(now);
  recent.set(userId, hits);
  if (recent.size > 1000) {
    for (const [id, times] of recent) {
      if (times.every((t) => now - t >= THROTTLE_WINDOW_MS)) recent.delete(id);
    }
  }
  return false;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  if (!entitlement.signedIn || !entitlement.userId) {
    return NextResponse.json(
      { error: "Sign in to get a SportyBet booking code.", locked: true },
      { status: 403, headers: NO_STORE },
    );
  }

  const body = (await request.json().catch(() => null)) as { legs?: unknown[] } | null;
  const incoming = Array.isArray(body?.legs) ? body.legs.slice(0, MAX_LEGS) : [];

  const legs: BookableLeg[] = [];
  for (const raw of incoming) {
    const leg = (raw ?? {}) as Record<string, unknown>;
    const matchId = str(leg.matchId);
    const homeName = str(leg.homeName);
    const awayName = str(leg.awayName);
    const market = str(leg.market);
    const kickoff = Date.parse(str(leg.kickoff) ?? "");
    if (!matchId || !homeName || !awayName || !market || !Number.isFinite(kickoff)) continue;
    legs.push({ matchId, homeName, awayName, market, kickoff });
  }

  if (legs.length === 0) {
    return NextResponse.json(
      { error: "Add a selection to your slip first." },
      { status: 400, headers: NO_STORE },
    );
  }

  if (throttled(entitlement.userId)) {
    return NextResponse.json(
      { error: "Too many booking requests. Try again in a minute." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } },
    );
  }

  const outcome = await bookSlip(legs);

  if (outcome.ok) {
    return NextResponse.json(outcome.booking, { headers: NO_STORE });
  }

  if (outcome.reason === "unconfigured") {
    return NextResponse.json(
      { error: "Booking codes aren't available right now." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (outcome.reason === "nothing-bookable") {
    return NextResponse.json(
      { error: "None of these selections could be found on SportyBet.", skipped: outcome.skipped },
      { status: 422, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { error: "SportyBet didn't return a code. Try again shortly.", skipped: outcome.skipped },
    { status: 502, headers: NO_STORE },
  );
}
