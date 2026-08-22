import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { Badge, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 50;

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  subscriptions: { tier: string; status: string }[] | { tier: string; status: string } | null;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabaseAdmin()
    .from("profiles")
    .select("id, email, display_name, created_at, last_seen_at, subscriptions(tier, status)")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) query = query.ilike("email", `%${q}%`);

  const { data } = await query;
  const users = (data ?? []) as unknown as UserRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Users</h1>
        <form className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by email…"
            className="w-64 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
          />
        </form>
      </div>

      {users.length === 0 ? (
        <EmptyState icon="👤" title="No users found" description="No accounts match that search." />
      ) : (
        <AdminTable>
          <AdminTableHead columns={["Email", "Name", "Plan", "Joined", "Last seen"]} />
          <tbody>
            {users.map((u) => {
              const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
              return (
                <AdminTableRow key={u.id}>
                  <AdminTableCell>{u.email}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{u.display_name || "—"}</AdminTableCell>
                  <AdminTableCell>
                    <Badge tone={!sub || sub.tier === "free" ? "neutral" : "brand"}>
                      {sub?.tier ?? "free"}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell className="text-ink-muted">
                    {new Date(u.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </AdminTableCell>
                  <AdminTableCell className="text-ink-muted">
                    {u.last_seen_at
                      ? new Date(u.last_seen_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
                      : "Never"}
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </tbody>
        </AdminTable>
      )}

      <div className="flex justify-end gap-2 text-xs">
        {page > 1 && (
          <a href={`?q=${encodeURIComponent(q ?? "")}&page=${page - 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Previous
          </a>
        )}
        {users.length === PAGE_SIZE && (
          <a href={`?q=${encodeURIComponent(q ?? "")}&page=${page + 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Next
          </a>
        )}
      </div>
    </div>
  );
}
