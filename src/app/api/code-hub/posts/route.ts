import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { communityPosts, postCode, posterName } from "@/lib/code-hub-posts";

/**
 * Community codes (src/lib/code-hub-posts.ts). GET lists them; POST posts a
 * code for whoever is signed in, three a day, read and ranked by the model.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(await communityPosts(), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  if (!entitlement.userId) {
    return NextResponse.json({ error: "Sign in to post a code.", locked: true }, { status: 403, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "That doesn't look like a SportyBet code." }, { status: 400, headers: NO_STORE });
  }
  const out = await postCode(entitlement.userId, posterName(entitlement.displayName, entitlement.email), code).catch(() => null);
  if (!out) return NextResponse.json({ error: "Couldn't post that just now. Try again." }, { status: 500, headers: NO_STORE });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE });
  return NextResponse.json({ post: out.post }, { headers: NO_STORE });
}
