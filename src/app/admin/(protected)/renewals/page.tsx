import type { Metadata } from "next";
import { getRenewalsView } from "@/lib/admin-renewals";
import { requirePermission } from "@/lib/admin";
import { APP_TIMEZONE, naira } from "@/lib/format";
import { DUE_WINDOW_DAYS, type RenewalItem } from "@/lib/renewals-view";
import { AdminTable, AdminTableCell, AdminTableHead, AdminTableRow } from "@/components/admin/admin-table";
import { CheckPaystackButton } from "@/components/admin/check-paystack-button";
import { KpiTile, PageHeader, Panel, StatusPill } from "@/components/admin/kit";

export const metadata: Metadata = { title: "Renewals" };
// "Check with Paystack now" asks Paystack about every subscription and unconfirmed checkout from here.
export const maxDuration = 60;

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: APP_TIMEZONE }) : "—";
const kobo = (n: number | null) => (n === null ? "—" : naira(n / 100));
const when = (days: number | null) =>
  days === null ? "" : days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 ? `in ${days} days` : `${-days} day${days === -1 ? "" : "s"} ago`;
const planText = (i: RenewalItem) => `${i.tier.toUpperCase()}${i.cycle ? ` · ${i.cycle}` : ""}`;

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-4 text-xs text-ink-muted sm:px-5">{children}</p>;
}

export default async function AdminRenewalsPage() {
  await requirePermission("finance.view");
  const v = await getRenewalsView();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Renewals"
        description="Who renews soon, who has lapsed without renewing, and what Paystack has charged. This reads our own records; the button asks Paystack directly and fixes what the webhook missed."
        actions={<CheckPaystackButton />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Card plans" value={String(v.cardActive)} hint="Renew by themselves through Paystack" />
        <KpiTile
          label={`Renewing in ${DUE_WINDOW_DAYS} days`}
          value={String(v.dueSoon.length)}
          hint={v.dueSoon.length ? `About ${kobo(v.dueSoonKobo)} to collect` : "No card renewals due"}
          tone="cyan"
        />
        <KpiTile
          label="Needs attention"
          value={String(v.needsAttention.length)}
          hint={v.needsAttention.length ? "Lapsed, failing or unrecorded" : "All card plans look healthy"}
          tone={v.needsAttention.length ? "rose" : "brand"}
        />
        <KpiTile label="Renewed, 30 days" value={String(v.recent.length)} hint="Card charges after a member's first" />
      </div>

      <Panel title="Needs attention" meta={`${v.needsAttention.length}`} flush>
        {v.needsAttention.length === 0 ? (
          <Empty>No card plan has lapsed, is failing, or is missing a paid-through date.</Empty>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Member", "Plan", "Paid through", "What is wrong"]} />
            <tbody>
              {v.needsAttention.map(({ item, reasons }) => (
                <AdminTableRow key={item.userId}>
                  <AdminTableCell>{item.email ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{planText(item)}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">
                    {date(item.periodEnd)} <span className="text-ink-dim">{when(item.daysLeft)}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={item.status === "past_due" ? "amber" : "rose"}>{item.status.replace("_", " ")}</StatusPill>
                      <span className="text-ink-muted">{reasons.join(" ")}</span>
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
      </Panel>

      <Panel title="Card renewals due" meta={`next ${DUE_WINDOW_DAYS} days`} flush>
        {v.dueSoon.length === 0 ? (
          <Empty>No card plan renews in the next two weeks.</Empty>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Member", "Plan", "Renews", "Expected charge"]} />
            <tbody>
              {v.dueSoon.map((i) => (
                <AdminTableRow key={i.userId}>
                  <AdminTableCell>{i.email ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{planText(i)}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">
                    {date(i.periodEnd)} <span className="text-ink-dim">{when(i.daysLeft)}</span>
                  </AdminTableCell>
                  <AdminTableCell className="tnum font-medium">{kobo(i.amountKobo)}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
      </Panel>

      <Panel title="Pay-once plans ending" meta={`next ${DUE_WINDOW_DAYS} days · will not renew`} flush>
        {v.lapsingOnce.length === 0 ? (
          <Empty>No pay-once plan ends in the next two weeks.</Empty>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Member", "Plan", "Ends", "Last paid"]} />
            <tbody>
              {v.lapsingOnce.map((i) => (
                <AdminTableRow key={i.userId}>
                  <AdminTableCell>{i.email ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{planText(i)}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">
                    {date(i.periodEnd)} <span className="text-ink-dim">{when(i.daysLeft)}</span>
                  </AdminTableCell>
                  <AdminTableCell className="tnum text-ink-muted">{kobo(i.amountKobo)}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-dim sm:px-5">They are emailed once, three days before the end.</p>
      </Panel>

      <Panel title="Renewals recorded" meta="last 30 days" flush>
        {v.recent.length === 0 ? (
          <Empty>No renewal charge has been recorded in the last 30 days.</Empty>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Member", "Plan", "Amount", "Date", "Reference"]} />
            <tbody>
              {v.recent.map((r) => (
                <AdminTableRow key={r.reference}>
                  <AdminTableCell>{r.email ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{r.plan}</AdminTableCell>
                  <AdminTableCell className="tnum font-medium">{kobo(r.amountKobo)}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(r.createdAt)}</AdminTableCell>
                  <AdminTableCell className="font-mono text-xs text-ink-dim">{r.reference}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
      </Panel>

      <p className="text-xs leading-relaxed text-ink-dim">
        A card renewal reaches us as a Paystack webhook, which records it and moves the paid-through date. Every morning a second check asks Paystack
        directly and records any renewal the webhook missed. A failed renewal emails the member and the support inbox.
      </p>
    </div>
  );
}
