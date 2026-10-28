import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTrafficSources } from "@/lib/admin-analytics";
import { getGoogleTraffic, type GoogleTraffic } from "@/lib/analytics/ga4";
import { getVercelTraffic, type VercelTraffic } from "@/lib/analytics/vercel-web";
import { RANGE_DAYS, type Ranked, type SourceResult } from "@/lib/analytics/types";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { BarList, KpiTile, PageHeader, Panel, SectionLabel, StatusPill, type BarRow, type Delta } from "@/components/admin/kit";
import { TrendChart } from "@/components/admin/trend-chart";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Traffic" };

const PERIOD = `last ${RANGE_DAYS}d`;
const AGAINST = `vs prev ${RANGE_DAYS}d`;

export default async function AdminTrafficPage() {
  await requirePermission("growth.view");
  const [google, vercel, ours] = await Promise.all([getGoogleTraffic(), getVercelTraffic(), getTrafficSources()]);

  return (
    <div>
      <PageHeader
        eyebrow="Growth"
        title="Traffic"
        description="Three separate views of who comes to KiqStat. Google Analytics and Vercel each count anonymous visits their own way, so their numbers won't match exactly; KiqStat's own attribution covers only the visitors who went on to sign up."
      />
      <ChipTabs
        ariaLabel="Traffic source"
        sections={[
          { key: "google", label: <TabLabel name="Google Analytics" result={google} />, node: <GoogleSection result={google} /> },
          { key: "vercel", label: <TabLabel name="Vercel" result={vercel} />, node: <VercelSection result={vercel} /> },
          { key: "ours", label: "KiqStat signups", node: <OursSection traffic={ours} /> },
        ]}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function TabLabel({ name, result }: { name: string; result: SourceResult<unknown> }) {
  if (result.state === "ok") return name;
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      <span className={`size-1.5 rounded-full ${result.state === "error" ? "bg-rose" : "bg-amber"}`} aria-label={result.state === "error" ? "error" : "not connected"} />
    </span>
  );
}

function delta(cur: number, prev: number): Delta {
  return { change: prev > 0 ? cur / prev - 1 : null, against: AGAINST };
}

const bars = (rows: Ranked[], total?: number): BarRow[] =>
  rows.map((r) => ({
    label: r.label,
    value: r.value,
    display: total ? `${r.value.toLocaleString()} · ${Math.round((r.value / total) * 100)}%` : undefined,
  }));

function SourceHeader({ children, fetchedAt }: { children: ReactNode; fetchedAt: string }) {
  return (
    <SectionLabel aside={<span className="font-mono text-[10.5px] text-ink-dim">Updated {new Date(fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} WAT · refreshes every 10 min</span>}>
      {children}
    </SectionLabel>
  );
}

/** Shown in place of a source that isn't connected yet, or that failed. */
function SourceState({ result, name, steps }: { result: Exclude<SourceResult<unknown>, { state: "ok" }>; name: string; steps: ReactNode[] }) {
  if (result.state === "error") {
    return (
      <Panel title={`${name} didn't answer`} action={<StatusPill tone="rose">Error</StatusPill>}>
        <p className="text-sm text-ink-muted">The request failed, so there is nothing to show this time. It tries again in a minute.</p>
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 font-mono text-[11px] break-all text-ink-dim">{result.message}</p>
      </Panel>
    );
  }
  return (
    <Panel title={`Connect ${name}`} action={<StatusPill tone="amber">Not connected</StatusPill>}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted marker:text-ink-dim">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-ink-dim">
        Still missing:{" "}
        {result.missing.map((m) => (
          <code key={m} className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">
            {m}
          </code>
        ))}
      </p>
    </Panel>
  );
}

const code = (s: string) => <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-ink">{s}</code>;

/* ----------------------------------------------------------------- Google */

function GoogleSection({ result }: { result: SourceResult<GoogleTraffic> }) {
  if (result.state !== "ok") {
    return (
      <SourceState
        result={result}
        name="Google Analytics"
        steps={[
          <>The tracking tag ({code("G-HEZ1TWLR83")}) is already on every page of the live site; this tab reads its numbers back.</>,
          <>From Admin → Property details, copy the numeric property ID into {code("GA4_PROPERTY_ID")}.</>,
          <>In Google Cloud, enable the Google Analytics Data API, create a service account and download a JSON key. Put its {code("client_email")} in {code("GA4_SERVICE_ACCOUNT_EMAIL")} and its {code("private_key")} in {code("GA4_SERVICE_ACCOUNT_KEY")}.</>,
          <>Back in Analytics, Admin → Property access management: add that service-account email as a Viewer. Redeploy.</>,
        ]}
      />
    );
  }
  const g = result.data;
  return (
    <div className="space-y-6">
      <section>
        <SourceHeader fetchedAt={result.fetchedAt}>Google Analytics · {PERIOD}</SourceHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Active users" value={g.users.toLocaleString()} delta={delta(g.users, g.prevUsers)} spark={g.dailyUsers.map((d) => d.value)} />
          <KpiTile label="Sessions" value={g.sessions.toLocaleString()} delta={delta(g.sessions, g.prevSessions)} tone="cyan" />
          <KpiTile label="Page views" value={g.views.toLocaleString()} hint={g.sessions ? `${(g.views / g.sessions).toFixed(1)} per session` : undefined} tone="violet" />
          <KpiTile label="Engaged sessions" value={`${Math.round(g.engagementRate * 100)}`} unit="%" hint="10s+, 2+ pages or a conversion" tone="gold" />
        </div>
      </section>
      <Panel title="Active users per day" meta={PERIOD}>
        <TrendChart points={g.dailyUsers} label="Google Analytics active users per day" />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Channels" meta="sessions">
          <BarList rows={bars(g.channels, g.sessions)} empty="No sessions yet." />
        </Panel>
        <Panel title="Sources" meta="sessions">
          <BarList rows={bars(g.sources, g.sessions)} tone="cyan" empty="No sessions yet." />
        </Panel>
        <Panel title="Landing pages" meta="sessions">
          <BarList rows={bars(g.landingPages)} tone="violet" empty="No sessions yet." />
        </Panel>
        <Panel title="Countries" meta="active users">
          <BarList rows={bars(g.countries, g.users)} tone="gold" empty="No users yet." />
        </Panel>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Vercel */

function VercelSection({ result }: { result: SourceResult<VercelTraffic> }) {
  if (result.state !== "ok") {
    return (
      <SourceState
        result={result}
        name="Vercel Web Analytics"
        steps={[
          <>Web Analytics is already collecting: the {code("<Analytics />")} beacon is in the root layout.</>,
          <>In Vercel, Account settings → Tokens, create a token scoped to the KiqStat team (read access is enough).</>,
          <>Set it as {code("VERCEL_ANALYTICS_TOKEN")} in the project’s environment variables (Production) and redeploy.</>,
        ]}
      />
    );
  }
  const v = result.data;
  const topReferrer = v.referrers.find((r) => r.label !== "Direct / none");
  return (
    <div className="space-y-6">
      <section>
        <SourceHeader fetchedAt={result.fetchedAt}>Vercel Web Analytics · {PERIOD} · production</SourceHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Visitors" value={v.visitors.toLocaleString()} delta={delta(v.visitors, v.prevVisitors)} spark={v.dailyVisitors.map((d) => d.value)} />
          <KpiTile label="Page views" value={v.pageviews.toLocaleString()} delta={delta(v.pageviews, v.prevPageviews)} tone="cyan" />
          <KpiTile label="Views per visitor" value={v.visitors ? (v.pageviews / v.visitors).toFixed(1) : "—"} tone="violet" />
          <KpiTile
            label="Top referrer"
            value={topReferrer?.label ?? "—"}
            hint={topReferrer && `${topReferrer.value.toLocaleString()} visitors`}
            tone="gold"
          />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Visitors per day" meta={PERIOD}>
          <TrendChart points={v.dailyVisitors} label="Vercel visitors per day" />
        </Panel>
        <Panel title="Page views per day" meta={PERIOD}>
          <TrendChart points={v.dailyPageviews} tone="cyan" label="Vercel page views per day" />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Referrers" meta="visitors">
          <BarList rows={bars(v.referrers, v.visitors)} empty="No visits yet." />
        </Panel>
        <Panel title="Top pages" meta="visitors">
          <BarList rows={bars(v.pages)} tone="cyan" empty="No visits yet." />
        </Panel>
        <Panel title="Countries" meta="visitors">
          <BarList rows={bars(v.countries, v.visitors)} tone="gold" empty="No visits yet." />
        </Panel>
        <Panel title="Devices" meta="visitors">
          <BarList rows={bars(v.devices, v.visitors)} tone="violet" empty="No visits yet." />
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- ours */

function OursSection({ traffic }: { traffic: Awaited<ReturnType<typeof getTrafficSources>> }) {
  const total = traffic.trackedCount + traffic.untrackedCount;
  const toBars = (rows: { label: string; count: number }[]): BarRow[] =>
    rows.map((r) => ({ label: r.label, value: r.count, display: total ? `${r.count} · ${Math.round((r.count / total) * 100)}%` : undefined }));
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Signup attribution · all time</SectionLabel>
        <p className="mb-4 max-w-3xl text-sm text-ink-muted">
          Where every account came from, captured on its first visit (referrer plus any {code("utm_")} tags) and never overwritten by a later one.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiTile label="Accounts" value={total.toLocaleString()} icon="users" />
          <KpiTile label="Known source" value={traffic.trackedCount.toLocaleString()} hint={total ? `${Math.round((traffic.trackedCount / total) * 100)}% of accounts` : undefined} tone="cyan" icon="target" />
          <KpiTile label="Direct / untracked" value={traffic.untrackedCount.toLocaleString()} hint="No referrer or UTM tag on first visit" tone="neutral" icon="link" />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By referrer" meta="signups">
          <BarList rows={toBars(traffic.byReferrer)} empty="No referred signups yet." />
        </Panel>
        <Panel title="By campaign (UTM)" meta="signups">
          <BarList rows={toBars(traffic.byCampaign)} tone="cyan" empty="No tagged-link signups yet." />
        </Panel>
      </div>
      <Panel title="Recent signups" meta="exact source" flush>
        {traffic.recentSignups.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-dim">Attribution for new accounts will show up here.</p>
        ) : (
          <>
            {/* Phones get one card per signup: seven columns don't fit. */}
            <ul className="divide-y divide-line sm:hidden">
              {traffic.recentSignups.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{s.email ?? "—"}</p>
                    <span className="shrink-0 text-xs text-ink-dim">
                      {new Date(s.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-muted">
                    {s.referrerHost ?? "Direct"}
                    {s.utmSource && ` · ${s.utmSource}${s.utmMedium ? ` / ${s.utmMedium}` : ""}${s.utmCampaign ? ` (${s.utmCampaign})` : ""}`}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-dim">{s.landingPage ?? "—"}</p>
                </li>
              ))}
            </ul>
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
                      <AdminTableCell className="max-w-[10rem] truncate font-mono text-xs text-ink-dim">{s.landingPage ?? "—"}</AdminTableCell>
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
      </Panel>
    </div>
  );
}
