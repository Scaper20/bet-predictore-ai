import type { ReactNode } from "react";
import { naira } from "@/lib/format";
import { HUB_LIVE_TIERS } from "@/lib/code-hub";
import { alertsFor, openableAlerts } from "@/lib/admin-alerts";
import { ageText, change } from "@/lib/admin-metrics";
import type {
  HubCodeCheck, IngestSummary, MarketingDashboard, OwnerDashboard, PickStats, ProductDashboard, SupportDashboard,
} from "@/lib/admin-dashboards";
import { HUB_MIN_TARGET_SHARE } from "@/lib/admin-dashboards";
import {
  AlertList, BarList, EmptyRow, FeedRow, KeyValues, KpiTile, Meter, Panel, PanelLink, SectionLabel, SegmentBar, StatusPill,
  timeAgo, type KitTone,
} from "@/components/admin/kit";
import { TrendChart } from "@/components/admin/trend-chart";

/**
 * The four role dashboards. Each answers its role's morning question first
 * (the KPI row), shows the trend behind it, then what needs doing.
 *
 *   Owner      Is the business growing, and is anything on fire?
 *   Product    Is the model landing, is the data flowing, did today's build ship right?
 *   Marketing  Where are signups coming from, and which of them pay?
 *   Support    Who is waiting on us, and who is stuck?
 *
 * `canOpen` hides links to pages the viewer can't open, and `showEmail` masks
 * addresses for roles without contact access (lib/admin-access.ts).
 */
export interface DashContext {
  canOpen: (href: string) => boolean;
  showEmail: (email: string | null | undefined) => string | null;
  lagosHour: number;
}

const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);

function Grid({ children, cols = "lg:grid-cols-3" }: { children: ReactNode; cols?: string }) {
  return <div className={`grid gap-4 ${cols}`}>{children}</div>;
}

function Link_({ ctx, href, children }: { ctx: DashContext; href: string; children?: ReactNode }) {
  return ctx.canOpen(href) ? <PanelLink href={href}>{children}</PanelLink> : null;
}

function record(s: PickStats): string {
  return `${s.wins}W – ${s.losses}L${s.pushes ? ` – ${s.pushes}P` : ""}`;
}

/* ------------------------------------------------------------ shared panels */

function HubPanel({ hub, ctx }: { hub: HubCodeCheck[]; ctx: DashContext }) {
  return (
    <Panel title="Code Hub today" meta={`${hub.length}/${HUB_LIVE_TIERS.length}`} action={<Link_ ctx={ctx} href="/admin/parsebot" />} flush>
      {hub.length === 0 ? (
        <EmptyRow>No codes built yet today. The morning build runs at 07:00 WAT.</EmptyRow>
      ) : (
        <ul>
          {hub.map((c) => {
            const short = c.share < HUB_MIN_TARGET_SHARE;
            return (
              <li key={c.tier} className="border-t border-line px-4 py-3 first:border-t-0 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-muted">{c.name}</span>
                  <span className="tnum font-mono text-sm text-ink">
                    {c.odds.toFixed(2)} <span className="text-ink-dim">/ {c.target}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Meter value={Math.min(1, c.share)} tone={short ? "amber" : "brand"} label={`${c.name}: ${Math.round(c.share * 100)}% of target`} />
                  <span className={`tnum w-10 shrink-0 text-right font-mono text-[10.5px] ${short ? "text-amber" : "text-ink-dim"}`}>
                    {Math.round(c.share * 100)}%
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-dim">
                  {c.legs} legs · {c.booked ? "booked" : <span className="text-amber">not booked</span>}
                  {short && <span className="text-amber"> · short of its odds</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function PipelinePanel({ ingest, ctx }: { ingest: IngestSummary; ctx: DashContext }) {
  const okShare = ingest.runs24h ? ingest.ok24h / ingest.runs24h : null;
  return (
    <Panel title="Data pipeline" meta="last 24h" action={<Link_ ctx={ctx} href="/admin/data-health" />}>
      <KeyValues
        rows={[
          {
            k: "Runs ok",
            v: (
              <span>
                {ingest.ok24h.toLocaleString()} / {ingest.runs24h.toLocaleString()}{" "}
                <span className="text-ink-dim">({pct(okShare)})</span>
              </span>
            ),
          },
          { k: "Partial", v: <span className={ingest.partial24h ? "text-amber" : ""}>{ingest.partial24h}</span> },
          { k: "Failed", v: <span className={ingest.failed24h ? "text-rose" : ""}>{ingest.failed24h}</span> },
          { k: "Live scores last wrote", v: ingest.liveScoresAgeMin === null ? "never" : ingest.liveScoresAgeMin < 90 ? `${ingest.liveScoresAgeMin}m ago` : `${ageText(Math.round(ingest.liveScoresAgeMin / 60))} ago` },
          { k: "Results last ran", v: ingest.resultsAgeH === null ? "never" : <span className={ingest.resultsAgeH >= 26 ? "text-rose" : ""}>{ageText(ingest.resultsAgeH)} ago</span> },
        ]}
      />
    </Panel>
  );
}

function TicketsPanel({ t, ctx, title = "Support queue" }: { t: SupportDashboard["tickets"]; ctx: DashContext; title?: string }) {
  return (
    <Panel title={title} meta={`${t.open} open · ${t.pending} waiting on user`} action={<Link_ ctx={ctx} href="/admin/tickets" />} flush>
      {t.queue.length === 0 ? (
        <EmptyRow>Inbox zero.</EmptyRow>
      ) : (
        t.queue.slice(0, 6).map((q) => (
          <FeedRow
            key={q.id}
            href={ctx.canOpen("/admin/tickets") ? `/admin/tickets/${q.id}` : undefined}
            primary={q.subject}
            secondary={ctx.showEmail(q.email) ?? "—"}
            aside={
              <span className="flex flex-col items-end gap-1">
                <StatusPill tone={q.status === "open" ? (q.ageH >= 24 ? "rose" : "amber") : "cyan"}>{q.status}</StatusPill>
                <span className="tnum font-mono text-[10px] text-ink-dim">{ageText(q.ageH)}</span>
              </span>
            }
          />
        ))
      )}
    </Panel>
  );
}

function FeedbackPanel({ f, ctx }: { f: SupportDashboard["feedback"]; ctx: DashContext }) {
  return (
    <Panel
      title="What users say"
      meta={`${f.count30d} in 30d${f.average30d !== null ? ` · avg ${f.average30d.toFixed(1)}` : ""}`}
      action={<Link_ ctx={ctx} href="/admin/feedback" />}
      flush
    >
      {f.latest.length === 0 ? (
        <EmptyRow>No feedback yet.</EmptyRow>
      ) : (
        f.latest.slice(0, 5).map((r, i) => (
          <FeedRow
            key={i}
            primary={r.comment?.trim() || <span className="text-ink-dim">No comment</span>}
            secondary={`${r.page ?? "—"} · ${timeAgo(r.at)}`}
            aside={r.score !== null ? <span className="tnum font-mono text-sm text-ink">{r.score}</span> : null}
          />
        ))
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- the owner */

export function OwnerView({ d, ctx }: { d: OwnerDashboard; ctx: DashContext }) {
  const completion = d.checkout.started ? d.checkout.paid / d.checkout.started : null;
  const conversion = d.registered ? d.payingNow / d.registered : null;
  const alerts = openableAlerts(
    alertsFor({
      tickets: d.tickets,
      ingest: d.ingest,
      hub: d.hub,
      hubTiers: HUB_LIVE_TIERS.length,
      lagosHour: ctx.lagosHour,
      checkout: d.checkout,
      minShare: HUB_MIN_TARGET_SHARE,
    }),
    ctx.canOpen,
  );

  return (
    <div className="space-y-8">
      <Grid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Revenue · 30d"
          value={naira(d.revenue30d)}
          delta={{ change: change(d.revenue30d, d.revenuePrev30d), against: "vs prev 30d" }}
          hint={d.foreignPayments30d ? `+ ${d.foreignPayments30d} paid in other currencies` : "Naira, successful payments"}
          href={ctx.canOpen("/admin/payments") ? "/admin/payments" : undefined}
        />
        <KpiTile label="Paying now" value={d.payingNow.toLocaleString()} hint={`${pct(conversion, 1)} of ${d.registered.toLocaleString()} accounts`} tone="gold" />
        <KpiTile
          label="Signups · 30d"
          value={d.signups30d.toLocaleString()}
          delta={{ change: change(d.signups30d, d.signupsPrev30d), against: "vs prev 30d" }}
          tone="cyan"
        />
        <KpiTile
          label="Checkout done"
          value={pct(completion)}
          hint={`${d.checkout.paid} paid of ${d.checkout.started} started (30d)`}
          tone={completion !== null && completion < 1 / 3 ? "amber" : "brand"}
        />
        <KpiTile label="Active · 7d" value={d.active7d.toLocaleString()} hint={`${d.active30d.toLocaleString()} in 30 days`} tone="violet" />
        <KpiTile
          label="Hit rate · 30d"
          value={pct(d.picks30d.rate, 1)}
          delta={{
            change: d.picks30d.rate !== null && d.picksPrev30d.rate !== null ? d.picks30d.rate - d.picksPrev30d.rate : null,
            against: "vs prev 30d",
            points: true,
          }}
          hint={record(d.picks30d)}
        />
      </Grid>

      <Grid>
        <Panel title="Revenue" meta="naira · daily · 30 days" className="lg:col-span-2">
          <TrendChart points={d.revenueSeries} format="naira" label="Daily revenue in naira, last 30 days" />
        </Panel>
        <Panel title="Needs attention" meta={alerts.length ? `${alerts.length} open` : "all clear"}>
          <AlertList alerts={alerts} />
        </Panel>
      </Grid>

      <Grid>
        <Panel title="Signups" meta="daily · 30 days" className="lg:col-span-2">
          <TrendChart points={d.signupSeries} format="count" tone="cyan" label="Daily signups, last 30 days" />
        </Panel>
        <Panel title="Customer base" meta="live plans">
          <SegmentBar
            segments={[
              { label: "Free", value: d.tierMix.free, tone: "neutral" },
              { label: "Pass", value: d.tierMix.pass, tone: "cyan" },
              { label: "Pro", value: d.tierMix.pro, tone: "brand" },
              { label: "VIP", value: d.tierMix.vip, tone: "gold" },
            ]}
          />
          <div className="mt-6">
            <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">Revenue by plan · 30d</p>
            <BarList rows={d.revenueByPlan.map((r) => ({ ...r, display: naira(r.value) }))} tone="gold" empty="No revenue in the last 30 days." />
          </div>
        </Panel>
      </Grid>

      <div>
        <SectionLabel>Operations</SectionLabel>
        <Grid cols="lg:grid-cols-2 xl:grid-cols-4">
          <HubPanel hub={d.hub} ctx={ctx} />
          <PipelinePanel ingest={d.ingest} ctx={ctx} />
          <Panel title="Latest payments" action={<Link_ ctx={ctx} href="/admin/payments" />} flush>
            {d.latestPayments.length === 0 ? (
              <EmptyRow>No payments yet.</EmptyRow>
            ) : (
              d.latestPayments.map((p) => (
                <FeedRow
                  key={p.id}
                  primary={ctx.showEmail(p.email) ?? "—"}
                  secondary={`${p.plan} · ${timeAgo(p.at)}`}
                  aside={
                    <span className="flex flex-col items-end gap-1">
                      <span className="tnum font-mono text-xs text-ink">{p.amount}</span>
                      <StatusPill tone={p.status === "success" ? "brand" : p.status === "pending" ? "amber" : "rose"}>{p.status}</StatusPill>
                    </span>
                  }
                />
              ))
            )}
          </Panel>
          <Panel title="Team activity" action={<Link_ ctx={ctx} href="/admin/audit-log" />} flush>
            {d.audit.length === 0 ? (
              <EmptyRow>No changes recorded yet.</EmptyRow>
            ) : (
              d.audit.map((a) => (
                <FeedRow key={a.id} primary={<span className="font-mono text-xs">{a.action}</span>} secondary={`${a.email.split("@")[0]} · ${timeAgo(a.at)}${a.target ? ` · ${a.target}` : ""}`} />
              ))
            )}
          </Panel>
        </Grid>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- the product */

export function ProductView({ d, ctx }: { d: ProductDashboard; ctx: DashContext }) {
  const alerts = openableAlerts(
    alertsFor({ ingest: d.ingest, hub: d.hub, hubTiers: HUB_LIVE_TIERS.length, lagosHour: ctx.lagosHour, maintenance: d.maintenance, minShare: HUB_MIN_TARGET_SHARE }),
    ctx.canOpen,
  );
  const bookOk = d.booking7d.total ? (d.booking7d.booked + d.booking7d.cached) / d.booking7d.total : null;
  const switchLabel: Record<string, string> = {
    code_hub_open: "Code Hub open",
    sportybet_direct: "SportyBet direct",
    parsebot_live: "parse.bot live",
  };

  return (
    <div className="space-y-8">
      <Grid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Hit rate · 7d"
          value={pct(d.picks7d.rate, 1)}
          delta={{
            change: d.picks7d.rate !== null && d.picksPrev7d.rate !== null ? d.picks7d.rate - d.picksPrev7d.rate : null,
            against: "vs prev 7d",
            points: true,
          }}
          hint={record(d.picks7d)}
          href={ctx.canOpen("/admin/model-performance") ? "/admin/model-performance" : undefined}
        />
        <KpiTile label="Strong · 30d" value={pct(d.strong30d.rate, 1)} hint={record(d.strong30d)} tone="gold" />
        <KpiTile label="All picks · 30d" value={pct(d.picks30d.rate, 1)} hint={`${record(d.picks30d)} · ${d.picks30d.open} open`} />
        <KpiTile label="Picks · 7d" value={d.published7d.toLocaleString()} hint="Published, kicked off" tone="cyan" />
        <KpiTile
          label="Booking ok · 7d"
          value={pct(bookOk)}
          hint={`${d.booking7d.problems} with problems · ${d.booking7d.refused} refused`}
          tone={bookOk !== null && bookOk < 0.7 ? "amber" : "brand"}
        />
        <KpiTile
          label="Feedback · 30d"
          value={d.feedback.average30d !== null ? d.feedback.average30d.toFixed(1) : "—"}
          unit={d.feedback.average30d !== null ? "avg" : undefined}
          hint={`${d.feedback.count30d} responses`}
          tone="violet"
        />
      </Grid>

      <Grid>
        <Panel title="Daily hit rate" meta="published picks · 30 days" className="lg:col-span-2">
          <TrendChart points={d.picksSeries} format="pct" label="Share of graded picks that landed, per day, last 30 days" />
        </Panel>
        <Panel title="Needs attention" meta={alerts.length ? `${alerts.length} open` : "all clear"}>
          <AlertList alerts={alerts} />
        </Panel>
      </Grid>

      <Grid cols="lg:grid-cols-2 xl:grid-cols-4">
        <HubPanel hub={d.hub} ctx={ctx} />
        <PipelinePanel ingest={d.ingest} ctx={ctx} />
        <Panel title="Switches" meta="live config" action={<Link_ ctx={ctx} href="/admin/parsebot" />}>
          <KeyValues
            rows={[
              ...d.switches.map((s) => ({
                k: switchLabel[s.key] ?? s.key,
                v: <StatusPill tone={s.enabled ? "brand" : "neutral"}>{s.enabled ? "on" : "off"}</StatusPill>,
              })),
              { k: "Data layer", v: <span className="font-mono text-xs">{d.dataLayer}</span> },
              { k: "Maintenance", v: <StatusPill tone={d.maintenance ? "rose" : "neutral"}>{d.maintenance ? "on" : "off"}</StatusPill> },
            ]}
          />
        </Panel>
        <Panel title="Feature use" meta="14 days">
          <BarList rows={d.features14d} tone="violet" empty="No feature use recorded." />
          <div className="mt-5 border-t border-line pt-4">
            <KeyValues rows={[{ k: "Ask KiqStat questions", v: `${d.ask14d.questions} · ${d.ask14d.askers} people` }]} />
          </div>
        </Panel>
      </Grid>

      <div>
        <SectionLabel>Voice of the user</SectionLabel>
        <Grid cols="lg:grid-cols-2">
          <FeedbackPanel f={d.feedback} ctx={ctx} />
          <TicketsPanel t={d.tickets} ctx={ctx} title="Support tickets" />
        </Grid>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the marketer */

export function MarketingView({ d, ctx }: { d: MarketingDashboard; ctx: DashContext }) {
  return (
    <div className="space-y-8">
      <Grid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Signups · 30d"
          value={d.signups30d.toLocaleString()}
          delta={{ change: change(d.signups30d, d.signupsPrev30d), against: "vs prev 30d" }}
          tone="cyan"
        />
        <KpiTile label="Signups · 7d" value={d.signups7d.toLocaleString()} hint="Last seven days" tone="cyan" />
        <KpiTile
          label="New payers · 30d"
          value={d.newPayers30d.toLocaleString()}
          delta={{ change: change(d.newPayers30d, d.newPayersPrev30d), against: "vs prev 30d" }}
          hint="First successful payment"
          tone="gold"
        />
        <KpiTile label="Signup → paid" value={pct(d.cohortConversion, 1)} hint="Of this month's signups" />
        <KpiTile label="Reachable" value={d.audience.reachable.toLocaleString()} hint={`by email · ${d.audience.optOut} opted out`} tone="violet" />
        <KpiTile label="Push devices" value={d.audience.push.toLocaleString()} hint={`${d.audience.waitlist} on the Code Hub list`} tone="violet" />
      </Grid>

      <Grid>
        <Panel title="Signups" meta="daily · 30 days" className="lg:col-span-2">
          <TrendChart points={d.signupSeries} format="count" tone="cyan" label="Daily signups, last 30 days" />
        </Panel>
        <Panel title="Channels" meta="signups · 30d" action={<Link_ ctx={ctx} href="/admin/traffic" />}>
          <BarList rows={d.channels} tone="cyan" empty="No signups in the last 30 days." />
          <p className="mt-4 text-[11px] leading-snug text-ink-dim">
            First touch: a tagged link wins, then the referring site. &ldquo;Direct&rdquo; is typed-in, app and untagged traffic.
          </p>
        </Panel>
      </Grid>

      <Grid cols="lg:grid-cols-3">
        <Panel title="Campaigns" meta="utm_campaign · 90d">
          <BarList rows={d.campaigns} tone="brand" empty="No tagged campaigns yet. Add ?utm_campaign= to links you share." />
        </Panel>
        <Panel title="Landing pages" meta="first page · 30d">
          <BarList rows={d.landings} tone="violet" empty="No landing pages recorded." />
        </Panel>
        <Panel title="Partners" meta="signups 30d / all time" action={<Link_ ctx={ctx} href="/admin/partners" />} flush>
          {d.partners.length === 0 ? (
            <EmptyRow>No partners yet.</EmptyRow>
          ) : (
            d.partners.map((p) => (
              <FeedRow
                key={p.slug}
                href={ctx.canOpen("/admin/partners") ? "/admin/partners" : undefined}
                primary={p.name}
                secondary={`/?ref=${p.slug}`}
                aside={
                  <span className="flex flex-col items-end gap-1">
                    <span className="tnum font-mono text-xs text-ink">
                      {p.signups30d} <span className="text-ink-dim">/ {p.signupsAll}</span>
                    </span>
                    {p.status !== "active" && <StatusPill tone="neutral">{p.status}</StatusPill>}
                  </span>
                }
              />
            ))
          )}
        </Panel>
      </Grid>

      <div>
        <SectionLabel>Owned channels</SectionLabel>
        <Grid cols="lg:grid-cols-3">
          <Panel title="Email campaigns" meta="all time" action={<Link_ ctx={ctx} href="/admin/outreach" />} className="lg:col-span-2" flush>
            {d.emails.length === 0 ? (
              <EmptyRow>No campaigns sent yet.</EmptyRow>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Campaign", "Sent", "Queued", "Failed", ""].map((h, i) => (
                      <th key={i} className="px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim sm:px-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.emails.map((e) => {
                    const total = e.sent + e.pending + e.failed;
                    return (
                      <tr key={e.campaign} className="border-t border-line first:border-t-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-ink sm:px-5">{e.campaign}</td>
                        <td className="tnum px-4 py-2.5 font-mono text-xs sm:px-5">{e.sent}</td>
                        <td className={`tnum px-4 py-2.5 font-mono text-xs sm:px-5 ${e.pending ? "text-amber" : "text-ink-dim"}`}>{e.pending}</td>
                        <td className={`tnum px-4 py-2.5 font-mono text-xs sm:px-5 ${e.failed ? "text-rose" : "text-ink-dim"}`}>{e.failed}</td>
                        <td className="w-32 px-4 py-2.5 sm:px-5">
                          <Meter value={total ? e.sent / total : 0} label={`${e.campaign}: ${e.sent} of ${total} sent`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Audience" meta="now">
            <KeyValues
              rows={[
                { k: "Accounts", v: d.audience.registered.toLocaleString() },
                { k: "Email-reachable", v: d.audience.reachable.toLocaleString() },
                { k: "Opted out", v: d.audience.optOut.toLocaleString() },
                { k: "Push devices", v: d.audience.push.toLocaleString() },
                { k: "Code Hub waitlist", v: d.audience.waitlist.toLocaleString() },
                { k: "VIP chat members", v: d.audience.vip.toLocaleString() },
              ]}
            />
          </Panel>
        </Grid>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the support */

export function SupportView({ d, ctx }: { d: SupportDashboard; ctx: DashContext }) {
  const alerts = openableAlerts(alertsFor({ tickets: d.tickets }), ctx.canOpen);
  const oldestTone: KitTone = (d.tickets.oldestOpenH ?? 0) >= 72 ? "rose" : (d.tickets.oldestOpenH ?? 0) >= 24 ? "amber" : "brand";
  return (
    <div className="space-y-8">
      <Grid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Open tickets" value={d.tickets.open.toLocaleString()} hint="Waiting on us" tone={d.tickets.open ? "amber" : "brand"} href={ctx.canOpen("/admin/tickets") ? "/admin/tickets" : undefined} />
        <KpiTile label="Oldest open" value={d.tickets.oldestOpenH === null ? "—" : ageText(d.tickets.oldestOpenH)} hint="Since it was raised" tone={oldestTone} />
        <KpiTile label="Waiting on user" value={d.tickets.pending.toLocaleString()} hint="We replied last" tone="cyan" />
        <KpiTile label="Closed · 7d" value={d.tickets.closed7d.toLocaleString()} hint="Resolved this week" />
        <KpiTile label="Stuck checkouts" value={d.stuckCheckouts.length.toLocaleString()} hint="Failed in 7d, not paid since" tone={d.stuckCheckouts.length ? "amber" : "brand"} />
        <KpiTile label="New users · 7d" value={d.newUsers7d.toLocaleString()} hint="Likely first questions" tone="violet" />
      </Grid>

      {alerts.length > 0 && (
        <Panel title="Needs attention">
          <AlertList alerts={alerts} />
        </Panel>
      )}

      <Grid cols="lg:grid-cols-2">
        <TicketsPanel t={d.tickets} ctx={ctx} title="Queue, oldest first" />
        <Panel title="Stuck at checkout" meta="7 days" flush>
          {d.stuckCheckouts.length === 0 ? (
            <EmptyRow>No one stuck at checkout this week.</EmptyRow>
          ) : (
            d.stuckCheckouts.map((s, i) => (
              <FeedRow
                key={i}
                primary={ctx.showEmail(s.email) ?? "—"}
                secondary={`${s.plan} · ${timeAgo(s.at)}`}
                aside={<span className="tnum font-mono text-[10.5px] text-ink-dim">{s.attempts} {s.attempts === 1 ? "try" : "tries"}</span>}
              />
            ))
          )}
          <p className="border-t border-line px-4 py-3 text-[11px] leading-snug text-ink-dim sm:px-5">
            A friendly note often turns these into customers: a card that needed 3-D Secure, a bank that declined, a mobile money prompt that timed out.
          </p>
        </Panel>
      </Grid>

      <Grid cols="lg:grid-cols-2">
        <FeedbackPanel f={d.feedback} ctx={ctx} />
        <Panel title="Active gifts" meta="expiring soonest" action={<Link_ ctx={ctx} href="/admin/users" />} flush>
          {d.gifts.length === 0 ? (
            <EmptyRow>No active gifts.</EmptyRow>
          ) : (
            d.gifts.map((g, i) => (
              <FeedRow
                key={i}
                primary={ctx.showEmail(g.email) ?? "—"}
                secondary={`by ${g.by ?? "—"}`}
                aside={
                  <span className="flex flex-col items-end gap-1">
                    <StatusPill tone={g.tier === "vip" ? "gold" : "brand"}>{g.tier}</StatusPill>
                    <span className="tnum font-mono text-[10px] text-ink-dim">
                      to {new Date(g.expires).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                }
              />
            ))
          )}
        </Panel>
      </Grid>
    </div>
  );
}
