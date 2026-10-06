import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Tickets" };

const STATUS_TONE: Record<string, Tone> = { open: "amber", pending: "cyan", closed: "neutral" };
const STATUSES = ["open", "pending", "closed"] as const;
type StatusFilter = (typeof STATUSES)[number];

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  priority: boolean | null;
  updated_at: string;
  profiles: { email: string | null } | { email: string | null }[] | null;
  /** Signed-out visitor's address (0041); null for account tickets. */
  guest_email?: string | null;
}

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return !!v && (STATUSES as readonly string[]).includes(v);
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const status = isStatusFilter(statusParam) ? statusParam : undefined;

  const load = (withPriority: boolean) => {
    let q = supabaseAdmin()
      .from("support_tickets")
      .select(`id, subject, status, ${withPriority ? "priority, " : ""}updated_at, guest_email, profiles(email)`);
    // VIP priority tickets first — that is the whole of the VIP promise.
    if (withPriority) q = q.order("priority", { ascending: false });
    q = q.order("status", { ascending: true }).order("updated_at", { ascending: false }).limit(100);
    return status ? q.eq("status", status) : q;
  };

  // Falls back to the pre-0023 shape so the inbox never goes blank on a
  // deployment whose database has not had the priority migration yet.
  const first = await load(true);
  const { data } = first.error ? await load(false) : first;
  const tickets = (data ?? []) as unknown as TicketRow[];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Tickets</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/tickets"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!status ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-ink-muted hover:text-ink"}`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/tickets?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${status === s ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-ink-muted hover:text-ink"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon="💬" title="No tickets" description="Support requests submitted through the site's chat widget will show up here." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {tickets.map((t) => {
              const profile = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
              return (
                <Link key={t.id} href={`/admin/tickets/${t.id}`} className="card block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-ink">
                      {t.priority && <PriorityBadge />} {t.subject}
                    </p>
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"} className="shrink-0">
                      {t.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-ink-muted">
                    <span className="truncate">{profile?.email ?? (t.guest_email ? `${t.guest_email} (guest)` : "—")}</span>
                    <span className="shrink-0">
                      {new Date(t.updated_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="hidden sm:block">
            <AdminTable>
              <AdminTableHead columns={["Subject", "From", "Status", "Updated"]} />
              <tbody>
                {tickets.map((t) => {
                  const profile = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
                  return (
                    <AdminTableRow key={t.id}>
                      <AdminTableCell>
                        {t.priority && <PriorityBadge />}{" "}
                        <Link href={`/admin/tickets/${t.id}`} className="font-medium text-ink hover:text-brand">
                          {t.subject}
                        </Link>
                      </AdminTableCell>
                      <AdminTableCell className="text-ink-muted">{profile?.email ?? (t.guest_email ? `${t.guest_email} (guest)` : "—")}</AdminTableCell>
                      <AdminTableCell>
                        <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                      </AdminTableCell>
                      <AdminTableCell className="text-ink-muted">
                        {new Date(t.updated_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })}
              </tbody>
            </AdminTable>
          </div>
        </>
      )}
    </div>
  );
}

function PriorityBadge() {
  return <Badge tone="violet" className="mr-1.5 align-middle">VIP priority</Badge>;
}
