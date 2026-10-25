import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { viewerForTier } from "@/lib/viewer";
import { SCAN_FAILURE, editorContext, editorGames, scanCodeOrWhy, scanForViewer } from "@/lib/code-scan";
import { legacySaferCode, saferCode, targetCode } from "@/lib/code-editor";

/**
 * The Code Hub editor: reads a SportyBet code, puts the model on every game,
 * and returns both a safer version and (when asked) a version re-picked to
 * land near a target price. Free for anyone signed in; booking the result
 * goes through /api/slip/book and the weekly allowance.
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
    return NextResponse.json({ error: "Sign in to check or edit a code.", locked: true }, { status: 403, headers: NO_STORE });
  }
  if (!allowed(viewer)) {
    return NextResponse.json({ error: "Too many checks. Wait a minute and try again." }, { status: 429, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown; target?: unknown } | null;
  // Pasted codes come with spaces, dashes or a trailing full stop: only letters and digits count.
  const code = typeof body?.code === "string" ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json(
      { error: "That doesn't look like a SportyBet code: 4 to 12 letters and numbers, like 5CKNWH." },
      { status: 400, headers: NO_STORE },
    );
  }
  // Odds asked for: a number from 1.2 to 1,000 (a typed "10" or "10.5" arrives as a number; a string is read too).
  const asked = typeof body?.target === "string" ? Number(body.target) : body?.target;
  if (asked !== undefined && asked !== null && !(typeof asked === "number" && Number.isFinite(asked) && asked >= 1.2 && asked <= 1000)) {
    return NextResponse.json({ error: "Enter odds between 1.2 and 1,000." }, { status: 400, headers: NO_STORE });
  }
  const target = typeof asked === "number" ? asked : null;

  const read = await scanCodeOrWhy(code).catch(() => ({ why: "unreachable" as const }));
  if (!("scan" in read)) {
    const { error, status } = SCAN_FAILURE[read.why];
    return NextResponse.json({ error }, { status, headers: NO_STORE });
  }
  // Pro-league games stay locked for a free viewer until kick-off, as on every other page.
  const scan = scanForViewer(read.scan, await viewerForTier(entitlement.tier));
  // Re-picks only from what SportyBet lists on each game today, so the edited code books as shown.
  const { predictions: _predictions, ...shown } = scan;
  try {
    const games = editorGames(scan, await editorContext(scan).catch(() => undefined)).filter(
      (g) => g.kickoff > Date.now() + 10 * 60_000,
    );
    return NextResponse.json(
      {
        scan: shown,
        // EDITOR_POLICY=legacy: the editor before code-editor-policy.ts, the most likely pick on every game.
        safer: games.length ? (process.env.EDITOR_POLICY?.trim() === "legacy" ? legacySaferCode(games) : saferCode(games)) : null,
        target: games.length && target ? targetCode(games, target) : null,
      },
      { headers: NO_STORE },
    );
  } catch {
    // The read stands even when re-picking fails: the user still sees their code's games.
    return NextResponse.json(
      { scan: shown, safer: null, target: null, error: "We read your code but couldn't re-pick it just now. Try again shortly." },
      { headers: NO_STORE },
    );
  }
}
