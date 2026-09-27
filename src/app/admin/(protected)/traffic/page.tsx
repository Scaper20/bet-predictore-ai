import type { Metadata } from "next";
import { getTrafficSources } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Traffic sources" };

export default async function AdminTrafficPage() {
  const traffic = await getTrafficSources();
  const total = traffic.trackedCount + traffic.untrackedCount;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Traffic sources</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Where every account actually came from — captured on their first visit to the site
          (referrer + any <code className="text-xs">utm_</code> link tags) and never overwritten by a
          later visit. For raw, anonymous pageview and visitor-referrer traffic (not just signups),
          see the Analytics tab in your Vercel project dashboard.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total accounts" value={total.toLocaleString()} />
        <StatCard label="With a known source" value={traffic.trackedCount.toLocaleString()} />
        <StatCard label="Direct / untracked" value={traffic.untrackedCount.toLocaleString()} sublabel="No referrer or UTM tag on first visit" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChannelSection
          title="By referrer"
          description="Where the browser came from — search, social, another site, or direct."
          data={traffic.byReferrer}
        />
        <ChannelSection
          title="By campaign (UTM)"
          description="Traffic that arrived through a deliberately tagged link (utm_source/medium)."
          data={traffic.byCampaign}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Recent signups — exact source
        </h2>
        {traffic.recentSignups.length === 0 ? (
          <EmptyState icon="🧭" title="No signups yet" description="Attribution for new accounts will show up here." />
        ) : (
          <>
            {/* Mobile: stacked cards, one per signup — a 6-column table has no
                honest way to fit a phone screen without a horizontal scroll
                that just hides most of it by default. */}
            <div className="space-y-3 sm:hidden">
              {traffic.recentSignups.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{s.email ?? "—"}</p>
                    <span className="shrink-0 text-xs text-ink-dim">
                      {new Date(s.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-ink-muted">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ink-dim">Referrer</dt>
                      <dd className="truncate">{s.referrerHost ?? "Direct"}</dd>
                    </div>
                    {s.utmSource && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-ink-dim">Campaign</dt>
                        <dd className="truncate">
                          {s.utmSource}
                          {s.utmMedium ? ` / ${s.utmMedium}` : ""}
                          {s.utmCampaign ? ` (${s.utmCampaign})` : ""}
                        </dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ink-dim">Landed on</dt>
                      <dd className="truncate font-mono">{s.landingPage ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <AdminTable>
                <AdminTableHead columns={["Email", "Referrer", "Source", "Medium", "Campaign", "Landing page", "Joined"]} />
                <tbody>
                  {traffic.recentSignups.map((s) => (
                    <AdminTableRow key={s.id}>
                      <AdminTableCell>{s.email ?? "—"}</AdminTableCell>
                      <AdminTableCell className="text-ink-muted">{s.referrerHost ?? "Direct"}</AdminTableCell>
                      <AdminTableCell className="text-ink-muted">{s.utmSource ?? "—"}</AdminTableCell>
                      <AdminTableCell className="text-ink-muted">{s.utmMedium ?? "—"}</AdminTableCell>
                      <AdminTableCell className="text-ink-muted">{s.utmCampaign ?? "—"}</AdminTableCell>
                      <AdminTableCell className="max-w-[10rem] truncate font-mono text-xs text-ink-dim">
                        {s.landingPage ?? "—"}
                      </AdminTableCell>
                      <AdminTableCell className="text-ink-muted">
                        {new Date(s.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </tbody>
              </AdminTable>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ChannelSection({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      <p className="mt-1 mb-5 text-xs text-ink-dim">{description}</p>
      {data.length === 0 ? (
        <p className="text-sm text-ink-dim">No data yet.</p>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.label} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-ink-muted">{d.label}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(d.count / max) * 100}%` }} />
                </div>
              </div>
              <span className="tnum text-xs font-semibold text-ink">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
