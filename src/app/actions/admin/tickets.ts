"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { ticketReplyNotificationEmail } from "@/lib/email-templates";

export type TicketActionState = { error: string | null };

export async function replyToTicket(
  _prev: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error };

  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!ticketId || !body) return { error: "Write a reply first." };

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const { error: insertError } = await admin.from("support_messages").insert({
    ticket_id: ticketId,
    sender_id: gate.identity.id,
    sender_role: "admin",
    body,
  });
  if (insertError) return { error: "Couldn't send the reply. Try again." };

  // Reply puts the ball back in the user's court.
  await admin.from("support_tickets").update({ status: "pending", updated_at: now }).eq("id", ticketId);

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("subject, guest_email, profiles(email)")
    .eq("id", ticketId)
    .maybeSingle();
  const profile = ticket ? (Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles) : undefined;
  // Guests have no account, so their address is on the ticket itself.
  const to = profile?.email ?? (ticket?.guest_email as string | null | undefined);
  if (ticket && to) {
    void sendEmail({ to, ...ticketReplyNotificationEmail({ subject: ticket.subject }) });
  }

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin/tickets");
  return { error: null };
}

export async function closeTicket(
  _prev: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error };

  const ticketId = String(formData.get("ticketId") ?? "");
  if (!ticketId) return { error: "Missing ticket." };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("support_tickets")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { error: "Couldn't close the ticket. Try again." };

  await logAdminAction(gate.identity, "ticket.closed", ticketId);

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin/tickets");
  return { error: null };
}
