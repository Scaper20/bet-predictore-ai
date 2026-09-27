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
  updated_at: string;
  profiles: { email: string | null } | { email: string | null }[] | null;
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

  let query = supabaseAdmin()
    .from("support_tickets")
    .select("id, subject, status, updated_at, profiles(email)")
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);

  const { data } = await query;
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
        <AdminTable>
          <AdminTableHead columns={["Subject", "From", "Status", "Updated"]} />
          <tbody>
            {tickets.map((t) => {
              const profile = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
              return (
                <AdminTableRow key={t.id}>
                  <AdminTableCell>
                    <Link href={`/admin/tickets/${t.id}`} className="font-medium text-ink hover:text-brand">
                      {t.subject}
                    </Link>
                  </AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{profile?.email ?? "—"}</AdminTableCell>
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
      )}
    </div>
  );
}
