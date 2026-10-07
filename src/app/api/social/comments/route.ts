import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkNickname, socialIdentity, withCookie } from "@/lib/social/identity";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const MAX_BODY = 500;
// No WAF in front of this route; cheap caps keep a script from flooding a
// thread. Guests get a second, per-network cap, since clearing cookies
// makes a new guest.
const MAX_PER_WINDOW = 6;
const WINDOW_MS = 5 * 60_000;
const GUEST_NETWORK_HOURLY = 20;

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 120;
}

/** The newest comments on one pick: ?matchId=… */
export async function GET(request: Request) {
  const matchId = new URL(request.url).searchParams.get("matchId");
  if (!supabaseConfigured || !validId(matchId)) return NextResponse.json({ comments: [] }, { headers: NO_STORE });

  const who = await socialIdentity(request, false);
  const { data } = await supabaseAdmin()
    .from("pick_comments")
    .select("id, user_id, guest_key, author_name, body, created_at, parent_id")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(100);

  const comments = (data ?? []).reverse().map((c) => ({
    id: c.id as string,
    author: c.author_name as string,
    guest: c.user_id === null,
    body: c.body as string,
    createdAt: c.created_at as string,
    mine: who.userId ? c.user_id === who.userId : !!who.guestKey && c.guest_key === who.guestKey,
    parentId: (c.parent_id as string | null) ?? null,
  }));
  return NextResponse.json({ comments, signedIn: !!who.userId }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const { matchId, body, parentId, name } = (await request.json().catch(() => ({}))) as {
    matchId?: string;
    body?: string;
    parentId?: string;
    name?: string;
  };
  const text = typeof body === "string" ? body.trim() : "";
  if (!validId(matchId) || text.length === 0 || text.length > MAX_BODY) {
    return NextResponse.json({ error: `Comments are 1 to ${MAX_BODY} characters.` }, { status: 400, headers: NO_STORE });
  }

  const who = await socialIdentity(request, true);
  const admin = supabaseAdmin();

  let nickname: string | null = null;
  if (!who.userId) {
    const n = checkNickname(name);
    if (!n.ok) return NextResponse.json({ error: n.error, code: "name" }, { status: 400, headers: NO_STORE });
    nickname = n.name;
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const recent = admin.from("pick_comments").select("id", { count: "exact", head: true }).gte("created_at", since);
  const { count } = await (who.userId ? recent.eq("user_id", who.userId) : recent.eq("guest_key", who.guestKey!));
  let limited = (count ?? 0) >= MAX_PER_WINDOW;
  if (!who.userId && !limited) {
    const { count: net } = await admin
      .from("pick_comments")
      .select("id", { count: "exact", head: true })
      .eq("guest_ip", who.ipKey)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    limited = (net ?? 0) >= GUEST_NETWORK_HOURLY;
  }
  if (limited) {
    return withCookie(NextResponse.json({ error: "Slow down a little, then try again." }, { status: 429, headers: NO_STORE }), who);
  }

  // Replies are one level deep: a reply to a reply joins its parent's thread,
  // and the parent must be on the same pick.
  let parent: string | null = null;
  if (typeof parentId === "string" && parentId) {
    const { data: target } = await admin
      .from("pick_comments")
      .select("id, match_id, parent_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!target || target.match_id !== matchId) {
      return NextResponse.json({ error: "That comment is gone." }, { status: 400, headers: NO_STORE });
    }
    parent = (target.parent_id as string | null) ?? (target.id as string);
  }

  const { error } = await admin.from("pick_comments").insert({
    match_id: matchId,
    body: text,
    parent_id: parent,
    ...(who.userId
      ? { user_id: who.userId }
      : { user_id: null, guest_key: who.guestKey, guest_ip: who.ipKey, author_name: nickname }),
  });
  if (error) return NextResponse.json({ error: "Couldn't post that. Try again." }, { status: 500, headers: NO_STORE });
  return withCookie(NextResponse.json({ ok: true }, { headers: NO_STORE }), who);
}

/** Deletes one of the caller's own comments (and its replies). */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing comment." }, { status: 400, headers: NO_STORE });
  const who = await socialIdentity(request, false);
  if (!who.userId && !who.guestKey) return NextResponse.json({ error: "Not yours." }, { status: 403, headers: NO_STORE });
  const q = supabaseAdmin().from("pick_comments").delete().eq("id", id);
  await (who.userId ? q.eq("user_id", who.userId) : q.eq("guest_key", who.guestKey!));
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
