import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Acts only on the caller's own data via the ordinary RLS-scoped client —
 * no admin bypass here, ticket content is legitimate user-owned data (see
 * migration 0006's comment), unlike subscriptions/payments.
 */
export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false }, { headers: NO_STORE });

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, subject, status")
    .eq("user_id", user.id)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ signedIn: true, ticket: null, messages: [] }, { headers: NO_STORE });

  const { data: messages } = await supabase
    .from("support_messages")
    .select("id, sender_role, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ signedIn: true, ticket, messages: messages ?? [] }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });

  const { body } = (await request.json()) as { body?: string };
  const message = (body ?? "").trim();
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400, headers: NO_STORE });

  // Reuse the caller's most recent open/pending ticket, or start a new one.
  let { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ticket) {
    const { data: created, error: createError } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id })
      .select("id, status")
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: "Couldn't start a conversation." }, { status: 502, headers: NO_STORE });
    }
    ticket = created;
  }

  const { error: insertError } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id,
    sender_id: user.id,
    sender_role: "user",
    body: message,
  });
  if (insertError) return NextResponse.json({ error: "Couldn't send your message." }, { status: 502, headers: NO_STORE });

  // A user message reopens a closed/pending ticket — the ball moves to the admin's court.
  await supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticket.id);

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
