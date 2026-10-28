import type { Metadata } from "next";
import Link from "next/link";
import { getPartnersOverview } from "@/lib/partners-feed";
import { moneyText, partnerLink, pctText } from "@/lib/partners";
import { SITE_URL } from "@/lib/site-url";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { StatCard } from "@/components/admin/stat-card";
import { CopyButton } from "@/components/admin/copy-button";
import { PartnerForm } from "@/components/admin/partner-forms";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/admin-access";

export const metadata: Metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

const sum = (totals: { held: number; payable: number; paid: number; currency: string }[], key: "held" | "payable" | "paid") =>
  totals.length === 0 ? "₦0" : totals.map((b) => moneyText(b[key], b.currency)).join(" + ");

export default async function AdminPartnersPage() {
  const me = await requirePermission("partners.view");
  const { partners, totals, signups, subscribers } = await getPartnersOverview();
  const due = partners.filter((p) => p.status === "active" && p.balances.some((b) => b.payoutDue)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Business</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Partners</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Each partner has a link. Users who sign up through it and pay earn the partner a share of the net payment for their first 12 months.
            A commission is held 14 days (the refund window), then becomes payable.
          </p>
        </div>
        {due > 0 && can(me.roles, "partners.payout") && (
          <a href="/admin/partners/payouts.csv" className="text-sm font-medium text-brand underline underline-offset-2 hover:text-brand-strong">
            Download payout sheet ({due})
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Partners" value={String(partners.length)} sublabel={`${partners.filter((p) => p.status === "active").length} active`} />
        <StatCard label="Signups" value={String(signups)} sublabel={`${subscribers} paid`} />
        <StatCard label="Held" value={sum(totals, "held")} sublabel="Inside the refund window" />
        <StatCard label="Payable" value={sum(totals, "payable")} sublabel="Ready to pay" />
        <StatCard label="Paid" value={sum(totals, "paid")} sublabel="All time" />
      </div>

      {partners.length === 0 ? (
        <EmptyState icon="🤝" title="No partners yet" description="Add the first partner below. Their link works as soon as they are created." />
      ) : (
        <AdminTable>
          <AdminTableHead columns={["Partner", "Rate", "Signups", "Paid", "Held", "Payable", "Link", ""]} />
          <tbody>
            {partners.map((p) => {
              const link = partnerLink(SITE_URL, p.slug);
              return (
                <AdminTableRow key={p.id}>
                  <AdminTableCell>
                    <Link href={`/admin/partners/${p.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                    {p.status === "suspended" && (
                      <Badge tone="rose" className="ml-2">
                        suspended
                      </Badge>
                    )}
                  </AdminTableCell>
                  <AdminTableCell className="tnum">{pctText(p.rateBps)}</AdminTableCell>
                  <AdminTableCell className="tnum">
                    {p.signups} <span className="text-ink-dim">/ {p.subscribers} paid</span>
                  </AdminTableCell>
                  <AdminTableCell className="tnum text-ink-muted">{sum(p.balances, "paid")}</AdminTableCell>
                  <AdminTableCell className="tnum text-ink-muted">{sum(p.balances, "held")}</AdminTableCell>
                  <AdminTableCell className="tnum font-medium">
                    {sum(p.balances, "payable")}
                    {p.balances.some((b) => b.payoutDue) && (
                      <Badge tone="brand" className="ml-2">
                        due
                      </Badge>
                    )}
                  </AdminTableCell>
                  <AdminTableCell className="max-w-[16rem] truncate font-mono text-xs text-ink-dim">{link}</AdminTableCell>
                  <AdminTableCell>
                    <CopyButton text={link} label="Copy link" />
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </tbody>
        </AdminTable>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Add a partner</h2>
        <PartnerForm />
      </section>
    </div>
  );
}
