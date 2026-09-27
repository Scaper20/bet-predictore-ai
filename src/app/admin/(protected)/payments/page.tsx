import type { Metadata } from "next";
import { getPayments } from "@/lib/admin-analytics";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { ExpirePaymentsButton } from "@/components/admin/expire-payments-button";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { naira } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

const STATUS_TONE: Record<string, Tone> = { success: "brand", pending: "amber", failed: "rose" };

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { rows, hasMore } = await getPayments(page);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Payments</h1>
          <p className="mt-1 text-sm text-ink-muted">
            A checkout that never got a Paystack webhook automatically flips from pending to failed after 24h.
          </p>
        </div>
        <ExpirePaymentsButton />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="💳" title="No payments yet" description="Every Paystack transaction this app has been notified about will show up here." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {rows.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{p.email ?? "—"}</p>
                  <span className="tnum shrink-0 text-sm font-semibold text-ink">{naira(p.amountKobo / 100)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-muted">
                  <span className="truncate">{p.plan}</span>
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="shrink-0">
                    {p.status}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-between gap-2 text-xs text-ink-dim">
                  <span className="truncate font-mono">{p.reference}</span>
                  <span className="shrink-0">
                    {new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block">
            <AdminTable>
              <AdminTableHead columns={["Customer", "Plan", "Amount", "Status", "Reference", "Date"]} />
              <tbody>
                {rows.map((p) => (
                  <AdminTableRow key={p.id}>
                    <AdminTableCell>{p.email ?? "—"}</AdminTableCell>
                    <AdminTableCell className="text-ink-muted">{p.plan}</AdminTableCell>
                    <AdminTableCell className="tnum font-medium">{naira(p.amountKobo / 100)}</AdminTableCell>
                    <AdminTableCell>
                      <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    </AdminTableCell>
                    <AdminTableCell className="font-mono text-xs text-ink-dim">{p.reference}</AdminTableCell>
                    <AdminTableCell className="text-ink-muted">
                      {new Date(p.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </tbody>
            </AdminTable>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 text-xs">
        {page > 1 && (
          <a href={`?page=${page - 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Previous
          </a>
        )}
        {hasMore && (
          <a href={`?page=${page + 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Next
          </a>
        )}
      </div>
    </div>
  );
}
