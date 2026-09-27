import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { GiftSubscriptionButton } from "@/components/admin/gift-subscription-button";
import { Badge, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 50;
const PAID_TIERS = ["pass", "pro", "vip"] as const;
const TIERS = ["free", ...PAID_TIERS] as const;
type TierFilter = (typeof TIERS)[number];

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  subscriptions: { tier: string; status: string }[] | { tier: string; status: string } | null;
}

function isTierFilter(v: string | undefined): v is TierFilter {
  return !!v && (TIERS as readonly string[]).includes(v);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tier?: string }>;
}) {
  const { q, page: pageParam, tier: tierParam } = await searchParams;
  const tier = isTierFilter(tierParam) ? tierParam : undefined;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = supabaseAdmin();

  // Paid tiers filter at the DB level via an inner join, so the range/count
  // below stay correct regardless of how many users this app has.
  // "free" means "no subscriptions row, or one that's never left the
  // default tier" — expressed as "id not in (every paid user)" rather than
  // a join, since there's no single column to filter on for "absent or free".
  let excludeIds: string[] | null = null;
  if (tier === "free") {
    const { data: paidRows } = await admin.from("subscriptions").select("user_id").in("tier", PAID_TIERS);
    excludeIds = (paidRows ?? []).map((r) => r.user_id as string);
  }

  let query = admin
    .from("profiles")
    .select(
      tier && tier !== "free"
        ? "id, email, display_name, created_at, last_seen_at, subscriptions!inner(tier, status)"
        : "id, email, display_name, created_at, last_seen_at, subscriptions(tier, status)",
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) query = query.ilike("email", `%${q}%`);
  if (tier && tier !== "free") query = query.eq("subscriptions.tier", tier);
  if (excludeIds && excludeIds.length > 0) query = query.not("id", "in", `(${excludeIds.join(",")})`);

  const { data } = await query;
  const users = (data ?? []) as unknown as UserRow[];

  const qs = (overrides: Record<string, string | undefined>) => {
    const merged = { q, tier, page: undefined as string | undefined, ...overrides };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.tier) params.set("tier", merged.tier);
    if (merged.page) params.set("page", merged.page);
    return params.toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Users</h1>
        <form className="flex w-full gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by email…"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:w-64"
          />
          {tier && <input type="hidden" name="tier" value={tier} />}
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`?${qs({ tier: undefined })}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!tier ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-ink-muted hover:text-ink"}`}
        >
          All
        </a>
        {TIERS.map((t) => (
          <a
            key={t}
            href={`?${qs({ tier: t })}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${tier === t ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-ink-muted hover:text-ink"}`}
          >
            {t}
          </a>
        ))}
      </div>

      {users.length === 0 ? (
        <EmptyState icon="👤" title="No users found" description="No accounts match that search." />
      ) : (
        <>
          {/* Mobile: stacked cards — five columns of a data table don't fit a
              phone screen without hiding most of them behind a side-scroll. */}
          <div className="space-y-3 sm:hidden">
            {users.map((u) => {
              const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
              return (
                <div key={u.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{u.email}</p>
                      {u.display_name && <p className="truncate text-xs text-ink-dim">{u.display_name}</p>}
                    </div>
                    <Badge tone={!sub || sub.tier === "free" ? "neutral" : "brand"} className="shrink-0">
                      {sub?.tier ?? "free"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-ink-muted">
                    <span>
                      Joined {new Date(u.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span>
                      {u.last_seen_at
                        ? `Seen ${new Date(u.last_seen_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`
                        : "Never seen"}
                    </span>
                  </div>
                  {u.email && (
                    <div className="mt-3 border-t border-line pt-3">
                      <GiftSubscriptionButton userId={u.id} userEmail={u.email} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden sm:block">
            <AdminTable>
              <AdminTableHead columns={["Email", "Name", "Plan", "Joined", "Last seen", ""]} />
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
                      <AdminTableCell>{u.email && <GiftSubscriptionButton userId={u.id} userEmail={u.email} />}</AdminTableCell>
                    </AdminTableRow>
                  );
                })}
              </tbody>
            </AdminTable>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 text-xs">
        {page > 1 && (
          <a href={`?${qs({ page: String(page - 1) })}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Previous
          </a>
        )}
        {users.length === PAGE_SIZE && (
          <a href={`?${qs({ page: String(page + 1) })}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Next
          </a>
        )}
      </div>
    </div>
  );
}
