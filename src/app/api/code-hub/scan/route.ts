import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { viewerForTier } from "@/lib/viewer";
import { scanCode, scanForViewer } from "@/lib/code-scan";

/**
 * Reads any SportyBet code and returns the model's read of every game in it
 * (src/lib/code-scan.ts). Free for anyone signed in; turning the result into
 * a new code goes through /api/slip/book and its weekly allowance.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const PER_MINUTE = 8;
const recent = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const now = Date.now();
  const stamps = (recent.get(userId) ?? []).filter((t) => t > now - 60_000);
  if (stamps.length >= PER_MINUTE) return false;
  stamps.push(now);
  recent.set(userId, stamps);
  if (recent.size > 5_000) recent.clear();
  return true;
}

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  // Preview builds let anyone check a code, so the feature can be tried on a
  // preview link; production asks for an account. Booking always does.
  const viewer = entitlement.userId ?? (process.env.VERCEL_ENV === "preview" ? "preview" : null);
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to check a code.", locked: true }, { status: 403, headers: NO_STORE });
  }
  if (!allowed(viewer)) {
    return NextResponse.json({ error: "Too many checks. Wait a minute and try again." }, { status: 429, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "That doesn't look like a SportyBet code." }, { status: 400, headers: NO_STORE });
  }
  const read = await scanCode(code).catch(() => null);
  // Pro-league games stay locked for a free viewer until kick-off, as on every other page.
  const scan = read ? scanForViewer(read, await viewerForTier(entitlement.tier)) : null;
  if (!scan) {
    return NextResponse.json(
      { error: "SportyBet doesn't recognise that code, or it has expired." },
      { status: 404, headers: NO_STORE },
    );
  }
  const { predictions: _predictions, ...out } = scan;
  return NextResponse.json(out, { headers: NO_STORE });
}
