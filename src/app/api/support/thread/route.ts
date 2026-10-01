import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { newTicketNotificationEmail } from "@/lib/email-templates";
import { getEntitlement, meets } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const SUPPORT_INBOX = process.env.SUPPORT_INBOX_EMAIL ?? "support@betrix.com.ng";

// A signed-in user could otherwise script a loop of POSTs — there's no CDN/
// WAF-level throttling in front of this route, and each message both writes
// a row and (on a new/reopened ticket) fires an outbound email. Cheap DB
// check rather than a KV-backed limiter: correct enough for one user's own
// message rate, no new infra required, and the 4000-char body cap
// (0006_support_tickets.sql) already bounds the size of each one.
const MAX_MESSAGES_PER_WINDOW = 8;
const WINDOW_MS = 5 * 60_000;

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

  const { count: recentCount } = await supabase
    .from("support_messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
  if ((recentCount ?? 0) >= MAX_MESSAGES_PER_WINDOW) {
    return NextResponse.json(
      { error: "You're sending messages too fast. Wait a few minutes and try again." },
      { status: 429, headers: NO_STORE },
    );
  }

  // Reuse the caller's most recent open/pending ticket, or start a new one.
  let { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isNewTicket = !ticket;
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

  // VIP priority support. Decided here, server-side, from the real
  // entitlement, and written with the service-role client: the column is
  // pinned against browser sessions by a trigger (migration 0023), so a user
  // cannot promote their own ticket. Checked on every message, so someone who
  // upgrades mid-conversation is promoted on their next message.
  const priority = meets((await getEntitlement()).tier, "vip");
  if (priority) {
    const { error: priorityError } = await supabaseAdmin()
      .from("support_tickets")
      .update({ priority: true })
      .eq("id", ticket.id);
    if (priorityError) console.error("support priority flag failed:", priorityError.message);
  }

  // Only on the very first message of a conversation — a busy admin doesn't
  // need an email for every follow-up on a ticket they already know is open.
  if (isNewTicket) {
    void sendEmail({
      to: SUPPORT_INBOX,
      ...newTicketNotificationEmail({
        priority,
        subject: "Support request",
        fromEmail: user.email ?? "unknown",
        preview: message.slice(0, 500),
        ticketId: ticket.id,
      }),
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
