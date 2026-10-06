import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const MAX_BODY = 500;
// No WAF in front of this route; a cheap per-user cap keeps a script from
// flooding a thread.
const MAX_PER_WINDOW = 6;
const WINDOW_MS = 5 * 60_000;

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 120;
}

/** The newest comments on one pick: ?matchId=… */
export async function GET(request: Request) {
  const matchId = new URL(request.url).searchParams.get("matchId");
  if (!supabaseConfigured || !validId(matchId)) return NextResponse.json({ comments: [] }, { headers: NO_STORE });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("pick_comments")
    .select("id, user_id, author_name, body, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(50);

  const comments = (data ?? []).reverse().map((c) => ({
    id: c.id as string,
    author: c.author_name as string,
    body: c.body as string,
    createdAt: c.created_at as string,
    mine: !!user && c.user_id === user.id,
  }));
  return NextResponse.json({ comments, signedIn: !!user }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to comment." }, { status: 401, headers: NO_STORE });

  const { matchId, body } = (await request.json().catch(() => ({}))) as { matchId?: string; body?: string };
  const text = typeof body === "string" ? body.trim() : "";
  if (!validId(matchId) || text.length === 0 || text.length > MAX_BODY) {
    return NextResponse.json({ error: `Comments are 1 to ${MAX_BODY} characters.` }, { status: 400, headers: NO_STORE });
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("pick_comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: "Slow down a little, then try again." }, { status: 429, headers: NO_STORE });
  }

  const { error } = await supabase.from("pick_comments").insert({ match_id: matchId, user_id: user.id, body: text });
  if (error) return NextResponse.json({ error: "Couldn't post that. Try again." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing comment." }, { status: 400, headers: NO_STORE });
  // RLS limits the delete to the caller's own rows.
  await supabase.from("pick_comments").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
