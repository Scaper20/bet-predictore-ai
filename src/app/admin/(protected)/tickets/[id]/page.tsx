import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TicketThread } from "@/components/admin/ticket-thread";
import { ReplyForm } from "@/components/admin/reply-form";
import { Badge, type Tone } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Ticket" };

const STATUS_TONE: Record<string, Tone> = { open: "amber", pending: "cyan", closed: "neutral" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    admin.from("support_tickets").select("id, subject, status, user_id, profiles(email)").eq("id", id).maybeSingle(),
    admin.from("support_messages").select("id, sender_role, body, created_at").eq("ticket_id", id).order("created_at", { ascending: true }),
  ]);

  if (!ticket) notFound();
  const profile = Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{ticket.subject}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
          <span>{profile?.email ?? "Unknown user"}</span>
          <Badge tone={STATUS_TONE[ticket.status] ?? "neutral"}>{ticket.status}</Badge>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <TicketThread ticketId={ticket.id} initialMessages={messages ?? []} />
        <ReplyForm ticketId={ticket.id} closed={ticket.status === "closed"} />
      </div>
    </div>
  );
}
