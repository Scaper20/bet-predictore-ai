import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { newTicketNotificationEmail } from "@/lib/email-templates";

/**
 * Support chat for signed-out visitors (0041_guest_support.sql).
 *
 * The guest's conversation is found by a random token in an httpOnly cookie;
 * only its hash is stored. Every read and write here uses the service-role
 * client and is scoped by that hash, so a guest can only ever reach their
 * own ticket.
 */

const COOKIE = "bx_support_guest";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const SUPPORT_INBOX = process.env.SUPPORT_INBOX_EMAIL ?? "support@betrix.com.ng";

// No account to rate-limit on, so two caps: messages per conversation, and
// new conversations per IP (each one emails the support inbox).
const MAX_MESSAGES_PER_WINDOW = 6;
const WINDOW_MS = 5 * 60_000;
const MAX_NEW_TICKETS_PER_IP = 3;
const NEW_TICKET_WINDOW_MS = 60 * 60_000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function tokenHash(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && /^[a-f0-9]{48}$/.test(token) ? sha256(token) : null;
}

async function ipHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  return ip ? sha256(`support:${ip}`) : null;
}

async function openTicket(hash: string) {
  const { data } = await supabaseAdmin()
    .from("support_tickets")
    .select("id, guest_email")
    .eq("guest_token_hash", hash)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; guest_email: string } | null;
}

export async function guestThread() {
  const hash = await tokenHash();
  const ticket = hash ? await openTicket(hash) : null;
  if (!ticket) return { signedIn: false, guest: true, email: null, messages: [] };

  const { data: messages } = await supabaseAdmin()
    .from("support_messages")
    .select("id, sender_role, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  return { signedIn: false, guest: true, email: ticket.guest_email, messages: messages ?? [] };
}

export async function guestSend(body: string, email: string | undefined): Promise<{ status: number; error?: string }> {
  const admin = supabaseAdmin();
  const jar = await cookies();
  let hash = await tokenHash();
  let ticket = hash ? await openTicket(hash) : null;

  if (ticket) {
    const { count } = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket.id)
      .eq("sender_role", "user")
      .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
    if ((count ?? 0) >= MAX_MESSAGES_PER_WINDOW) {
      return { status: 429, error: "You're sending messages too fast. Wait a few minutes and try again." };
    }
  } else {
    const address = (email ?? "").trim().toLowerCase();
    if (!EMAIL.test(address)) return { status: 400, error: "Add your email so we can reply." };

    const ip = await ipHash();
    if (ip) {
      const { count } = await admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("guest_ip_hash", ip)
        .gte("created_at", new Date(Date.now() - NEW_TICKET_WINDOW_MS).toISOString());
      if ((count ?? 0) >= MAX_NEW_TICKETS_PER_IP) {
        return { status: 429, error: "Too many new conversations. Try again later, or sign in." };
      }
    }

    if (!hash) {
      const token = randomBytes(24).toString("hex");
      jar.set(COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });
      hash = sha256(token);
    }

    const { data: created, error } = await admin
      .from("support_tickets")
      .insert({ guest_email: address, guest_token_hash: hash, guest_ip_hash: ip })
      .select("id, guest_email")
      .single();
    if (error || !created) return { status: 502, error: "Couldn't start a conversation." };
    ticket = created as { id: string; guest_email: string };

    void sendEmail({
      to: SUPPORT_INBOX,
      ...newTicketNotificationEmail({
        subject: "Support request (guest)",
        fromEmail: address,
        preview: body.slice(0, 500),
        ticketId: ticket.id,
      }),
    });
  }

  const { error: insertError } = await admin
    .from("support_messages")
    .insert({ ticket_id: ticket.id, sender_id: null, sender_role: "user", body });
  if (insertError) return { status: 502, error: "Couldn't send your message." };

  await admin.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticket.id);
  return { status: 200 };
}
