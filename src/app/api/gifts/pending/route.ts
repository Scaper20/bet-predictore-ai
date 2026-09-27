import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { unseenGiftFor, markGiftSeenForUser } from "@/lib/subscription-gifts-feed";

export const dynamic = "force-dynamic";

/** GET: the signed-in user's oldest unseen live gift, or null — polled once
 * by GiftPopup on mount. POST: marks one seen, scoped to the caller's own
 * session so a client-supplied id can't touch anyone else's row. */
export async function GET() {
  if (!supabaseConfigured) return NextResponse.json({ gift: null });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ gift: null });

  const gift = await unseenGiftFor(user.id);
  return NextResponse.json({ gift }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  if (!supabaseConfigured) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { giftId?: unknown } | null;
  const giftId = typeof body?.giftId === "string" ? body.giftId : null;
  if (!giftId) return NextResponse.json({ error: "Missing giftId" }, { status: 400 });

  await markGiftSeenForUser(giftId, user.id);
  return NextResponse.json({ ok: true });
}
