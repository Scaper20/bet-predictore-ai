import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { socialIdentity, withCookie } from "@/lib/social/identity";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Toggles a love on a pick. Body: { matchId, loved } (the state wanted).
 * Works signed out: a guest is known by a private browser cookie.
 */
export async function POST(request: Request) {
  const { matchId, loved } = (await request.json().catch(() => ({}))) as { matchId?: string; loved?: boolean };
  if (typeof matchId !== "string" || matchId.length === 0 || matchId.length > 120) {
    return NextResponse.json({ error: "Invalid pick." }, { status: 400, headers: NO_STORE });
  }

  const who = await socialIdentity(request, true);
  const admin = supabaseAdmin();
  const mine = (q: ReturnType<ReturnType<typeof admin.from>["delete"]>) =>
    who.userId ? q.eq("user_id", who.userId) : q.eq("guest_key", who.guestKey!);

  let failed = false;
  if (loved) {
    const { error } = await admin
      .from("pick_loves")
      .insert({ match_id: matchId, user_id: who.userId, guest_key: who.userId ? null : who.guestKey });
    // Already loved (unique index): fine, that is the state wanted.
    failed = !!error && error.code !== "23505";
  } else {
    const { error } = await mine(admin.from("pick_loves").delete().eq("match_id", matchId));
    failed = !!error;
  }
  if (failed) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500, headers: NO_STORE });

  return withCookie(NextResponse.json({ ok: true }, { headers: NO_STORE }), who);
}
