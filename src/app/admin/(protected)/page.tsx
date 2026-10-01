import type { Metadata } from "next";
import Link from "next/link";
import { getDashboardKpis, getRecentActivity } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { Badge, type Tone } from "@/components/ui/primitives";
import { naira } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const TICKET_STATUS_TONE: Record<string, Tone> = { open: "amber", pending: "cyan", closed: "neutral" };
const PAYMENT_STATUS_TONE: Record<string, Tone> = { success: "brand", pending: "amber", failed: "rose" };

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function AdminDashboardPage() {
  const [kpis, activity] = await Promise.all([getDashboardKpis(), getRecentActivity()]);
  const maxTrend = Math.max(1, ...kpis.revenueTrend.map((d) => d.kobo));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Registered users"
          value={kpis.registeredUsers.toLocaleString()}
          sublabel={`+${kpis.newUsers7d.toLocaleString()} in the last 7 days`}
        />
        <StatCard
          label="Active users"
          value={kpis.activeUsers30d.toLocaleString()}
          sublabel={`${kpis.activeUsers7d.toLocaleString()} active in the last 7 days`}
        />
        <StatCard
          label="Revenue this month"
          value={naira(kpis.revenueThisMonthKobo / 100)}
          sublabel={`${naira(kpis.revenueAllTimeKobo / 100)} all-time`}
        />
        <StatCard
          label="Open tickets"
          value={kpis.openTicketCount.toLocaleString()}
          sublabel={`${kpis.pendingTicketCount.toLocaleString()} awaiting the user's reply`}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Free" value={kpis.tierBreakdown.free.toLocaleString()} />
        <StatCard label="Pass" value={kpis.tierBreakdown.pass.toLocaleString()} sublabel={`${kpis.passSalesCount} sold all-time`} />
        <StatCard label="Pro" value={kpis.tierBreakdown.pro.toLocaleString()} />
        <StatCard label="VIP" value={kpis.tierBreakdown.vip.toLocaleString()} />
      </section>

      {kpis.stalePendingPayments7d > 0 && (
        <div className="card border-amber/30 bg-amber/5 p-4 text-sm text-ink-muted">
          <strong className="text-ink">{kpis.stalePendingPayments7d}</strong> checkout
          {kpis.stalePendingPayments7d === 1 ? "" : "s"} from the last 7 days started but never
          completed (still &quot;pending&quot; over an hour later) — likely abandoned or failed at
          Paystack.{" "}
          <Link href="/admin/payments" className="underline underline-offset-2 hover:text-ink">
            Review payments
          </Link>
        </div>
      )}

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Revenue, last 30 days</h2>
          <span className="tnum text-xs text-ink-dim">
            {naira(kpis.revenueTrend.reduce((s, d) => s + d.kobo, 0) / 100)} total
          </span>
        </div>
        {/* 30 bars at flex-1 get unreadably thin below ~540px — scroll
            horizontally instead of squeezing them past the point of being
            able to tap or read one. sm:min-w-0 restores the fill-the-width
            behavior once there's room for it. */}
        <div className="overflow-x-auto">
          <div className="flex h-32 min-w-[540px] items-end gap-1 sm:min-w-0">
            {kpis.revenueTrend.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${naira(d.kobo / 100)}`}
                className="flex-1 rounded-t bg-brand/70 transition-colors hover:bg-brand"
                style={{ height: `${Math.max(2, (d.kobo / maxTrend) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Published picks settled
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Win rate"
            value={kpis.settledPicks.winRate !== null ? `${Math.round(kpis.settledPicks.winRate * 100)}%` : "—"}
          />
          <StatCard label="Wins" value={kpis.settledPicks.wins.toLocaleString()} />
          <StatCard label="Losses" value={kpis.settledPicks.losses.toLocaleString()} />
          <StatCard label="Pushes" value={kpis.settledPicks.pushes.toLocaleString()} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <RecentPanel title="Newest signups" viewAllHref="/admin/users">
          {activity.signups.length === 0 ? (
            <p className="px-1 py-4 text-xs text-ink-dim">No signups yet.</p>
          ) : (
            activity.signups.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border-t border-line px-1 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{s.displayName || s.email || "—"}</p>
                  {s.displayName && s.email && <p className="truncate text-xs text-ink-dim">{s.email}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink-dim">{timeAgo(s.createdAt)}</span>
              </div>
            ))
          )}
        </RecentPanel>

        <RecentPanel title="Latest payments" viewAllHref="/admin/payments">
          {activity.payments.length === 0 ? (
            <p className="px-1 py-4 text-xs text-ink-dim">No payments yet.</p>
          ) : (
            activity.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line px-1 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{p.email ?? "—"}</p>
                  <p className="truncate text-xs text-ink-dim">{p.plan}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm text-ink">{naira(p.amountKobo / 100)}</p>
                  <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "neutral"} className="mt-0.5">
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </RecentPanel>

        <RecentPanel title="Latest tickets" viewAllHref="/admin/tickets">
          {activity.tickets.length === 0 ? (
            <p className="px-1 py-4 text-xs text-ink-dim">No tickets yet.</p>
          ) : (
            activity.tickets.map((t) => (
              <Link
                key={t.id}
                href={`/admin/tickets/${t.id}`}
                className="flex items-center justify-between gap-3 border-t border-line px-1 py-2.5 first:border-t-0 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{t.subject}</p>
                  <p className="truncate text-xs text-ink-dim">{t.email ?? "—"}</p>
                </div>
                <Badge tone={TICKET_STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
              </Link>
            ))
          )}
        </RecentPanel>
      </section>
    </div>
  );
}

function RecentPanel({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        <Link href={viewAllHref} className="text-xs text-ink-dim underline underline-offset-2 hover:text-ink">
          View all
        </Link>
      </div>
      <div>{children}</div>
    </section>
  );
}
