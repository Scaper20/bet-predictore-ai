import type { Metadata } from "next";
import { getDashboardKpis } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { naira } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const kpis = await getDashboardKpis();
  const maxTrend = Math.max(1, ...kpis.revenueTrend.map((d) => d.kobo));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered users" value={kpis.registeredUsers.toLocaleString()} />
        <StatCard
          label="Active users"
          value={kpis.activeUsers30d.toLocaleString()}
          sublabel={`${kpis.activeUsers7d.toLocaleString()} active in the last 7 days`}
        />
        <StatCard label="Revenue this month" value={naira(kpis.revenueThisMonthKobo / 100)} />
        <StatCard label="Open tickets" value={kpis.openTicketCount.toLocaleString()} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Free" value={kpis.tierBreakdown.free.toLocaleString()} />
        <StatCard label="Weekend Pass" value={kpis.tierBreakdown.pass.toLocaleString()} sublabel={`${kpis.passSalesCount} sold all-time`} />
        <StatCard label="Pro" value={kpis.tierBreakdown.pro.toLocaleString()} />
        <StatCard label="VIP" value={kpis.tierBreakdown.vip.toLocaleString()} />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Revenue, last 30 days</h2>
          <span className="tnum text-xs text-ink-dim">
            {naira(kpis.revenueTrend.reduce((s, d) => s + d.kobo, 0) / 100)} total
          </span>
        </div>
        <div className="flex h-32 items-end gap-1">
          {kpis.revenueTrend.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${naira(d.kobo / 100)}`}
              className="flex-1 rounded-t bg-brand/70 transition-colors hover:bg-brand"
              style={{ height: `${Math.max(2, (d.kobo / maxTrend) * 100)}%` }}
            />
          ))}
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
    </div>
  );
}
