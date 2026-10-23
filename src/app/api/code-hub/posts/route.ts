import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { communityPosts, postCode, posterName, postForViewer } from "@/lib/code-hub-posts";
import { getViewer, viewerForTier } from "@/lib/viewer";

/**
 * Community codes (src/lib/code-hub-posts.ts). GET lists them; POST posts a
 * code for whoever is signed in, three a day, read and ranked by the model.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Each post reads the code from SportyBet, and a refused post does not count
// toward the daily three, so tries are limited per minute as well.
const PER_MINUTE = 5;
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

export async function GET() {
  const [{ open, recent: done }, viewer] = await Promise.all([communityPosts(), getViewer()]);
  return NextResponse.json(
    { open: open.map((p) => postForViewer(p, viewer)), recent: done.map((p) => postForViewer(p, viewer)) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  if (!entitlement.userId) {
    return NextResponse.json({ error: "Sign in to post a code.", locked: true }, { status: 403, headers: NO_STORE });
  }
  if (!allowed(entitlement.userId)) {
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "That doesn't look like a SportyBet code." }, { status: 400, headers: NO_STORE });
  }
  const out = await postCode(entitlement.userId, posterName(entitlement.displayName, entitlement.userId), code).catch(() => null);
  if (!out) return NextResponse.json({ error: "Couldn't post that just now. Try again." }, { status: 500, headers: NO_STORE });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE });
  return NextResponse.json({ post: postForViewer(out.post, await viewerForTier(entitlement.tier)) }, { headers: NO_STORE });
}
