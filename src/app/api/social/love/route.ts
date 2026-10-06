import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Toggles the caller's love on a pick. Body: { matchId, loved } (the state wanted). */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to love a pick." }, { status: 401, headers: NO_STORE });

  const { matchId, loved } = (await request.json().catch(() => ({}))) as { matchId?: string; loved?: boolean };
  if (typeof matchId !== "string" || matchId.length === 0 || matchId.length > 120) {
    return NextResponse.json({ error: "Invalid pick." }, { status: 400, headers: NO_STORE });
  }

  const { error } = loved
    ? await supabase.from("pick_loves").upsert({ match_id: matchId, user_id: user.id }, { ignoreDuplicates: true })
    : await supabase.from("pick_loves").delete().eq("match_id", matchId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
