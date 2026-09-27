import type { Metadata } from "next";
import { getAuditLog } from "@/lib/admin-analytics";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { rows, hasMore } = await getAuditLog(page);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Audit log</h1>
        <p className="mt-1 text-sm text-ink-muted">Every admin grant, revoke, and ticket action — who did what, when.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="📜" title="No admin actions logged yet" description="Grants, revokes, and ticket closes will show up here as they happen." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {rows.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{r.adminEmail}</p>
                  <span className="shrink-0 text-xs text-ink-dim">
                    {new Date(r.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-muted">{r.action}</p>
                {r.target && <p className="mt-1 truncate text-xs text-ink-dim">Target: {r.target}</p>}
                {r.detail && <p className="mt-1 truncate font-mono text-xs text-ink-dim">{JSON.stringify(r.detail)}</p>}
              </div>
            ))}
          </div>

          <div className="hidden sm:block">
            <AdminTable>
              <AdminTableHead columns={["Admin", "Action", "Target", "Detail", "When"]} />
              <tbody>
                {rows.map((r) => (
                  <AdminTableRow key={r.id}>
                    <AdminTableCell>{r.adminEmail}</AdminTableCell>
                    <AdminTableCell className="font-mono text-xs">{r.action}</AdminTableCell>
                    <AdminTableCell className="max-w-[16rem] truncate text-ink-muted">{r.target ?? "—"}</AdminTableCell>
                    <AdminTableCell className="max-w-[20rem] truncate font-mono text-xs text-ink-dim">
                      {r.detail ? JSON.stringify(r.detail) : "—"}
                    </AdminTableCell>
                    <AdminTableCell className="text-ink-muted">
                      {new Date(r.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
