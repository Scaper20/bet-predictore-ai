import type { Metadata } from "next";
import { getPayments } from "@/lib/admin-analytics";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
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
      <h1 className="font-display text-2xl font-bold">Payments</h1>

      {rows.length === 0 ? (
        <EmptyState icon="💳" title="No payments yet" description="Every Paystack transaction this app has been notified about will show up here." />
      ) : (
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
