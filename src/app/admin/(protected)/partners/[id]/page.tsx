import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartnerDetail } from "@/lib/partners-feed";
import { moneyText, partnerLink, pctText, standing, type Standing } from "@/lib/partners";
import { SITE_URL } from "@/lib/site-url";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { StatCard } from "@/components/admin/stat-card";
import { CopyButton } from "@/components/admin/copy-button";
import { PartnerForm, PartnerStatusForm, PayoutForm, ReverseForm } from "@/components/admin/partner-forms";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Partner" };
export const dynamic = "force-dynamic";

const STANDING_TONE: Record<Standing, Tone> = { held: "amber", payable: "brand", paid: "neutral", reversed: "rose" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPartnerDetail(id);
  if (!detail) notFound();
  const { partner, balances, commissions, payouts, signups, signupCount, accountEmail } = detail;
  const link = partnerLink(SITE_URL, partner.slug);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/partners" className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink">
          ← All partners
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{partner.name}</h1>
          <Badge tone={partner.status === "active" ? "brand" : "rose"}>{partner.status}</Badge>
          <Badge tone="neutral">{pctText(partner.rateBps)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="min-w-0 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Signups" value={String(signupCount)} sublabel={`${signups.filter((s) => s.paid).length} paid (of the latest ${signups.length})`} />
        {(balances.length ? balances : [{ currency: "NGN", held: 0, payable: 0, paid: 0, payoutDue: false }]).flatMap((b) => [
          <StatCard key={`${b.currency}-h`} label={`Held ${b.currency}`} value={moneyText(b.held, b.currency)} sublabel="Inside the refund window" />,
          <StatCard key={`${b.currency}-p`} label={`Payable ${b.currency}`} value={moneyText(b.payable, b.currency)} sublabel={b.payoutDue ? "Due now" : "Below the minimum or empty"} />,
          <StatCard key={`${b.currency}-d`} label={`Paid ${b.currency}`} value={moneyText(b.paid, b.currency)} sublabel="All time" />,
        ])}
      </div>

      {balances.some((b) => b.payoutDue) && (
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-ink">Pay out</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Send the transfer from the bank sheet or your bank app, then record it here. This marks the payable commissions paid and cannot be undone.
            </p>
            {partner.bankName || partner.accountNumber ? (
              <p className="mt-2 text-xs text-ink">
                {partner.accountName} · {partner.bankName} · <span className="font-mono">{partner.accountNumber}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber">No bank details yet. Add them below before paying.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {balances
              .filter((b) => b.payoutDue)
              .map((b) => (
                <PayoutForm key={b.currency} id={partner.id} currency={b.currency} amountText={moneyText(b.payable, b.currency)} />
              ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Commissions</h2>
        {commissions.length === 0 ? (
          <EmptyState icon="💸" title="No commissions yet" description="They appear here when someone who signed up through this link pays." />
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Date", "User", "Plan", "Paid", "Fee", "Net", "Rate", "Commission", "Status", ""]} />
            <tbody>
              {commissions.map((c) => {
                const s = standing({ status: c.status, payable_at: c.payableAt });
                return (
                  <AdminTableRow key={c.id}>
                    <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(c.createdAt)}</AdminTableCell>
                    <AdminTableCell className="max-w-[12rem] truncate text-ink-muted">{c.userEmail ?? "—"}</AdminTableCell>
                    <AdminTableCell className="text-ink-muted">{c.kind === "clawback" ? "Clawback" : (c.plan ?? "—")}</AdminTableCell>
                    <AdminTableCell className="tnum">{moneyText(c.grossMinor, c.currency)}</AdminTableCell>
                    <AdminTableCell className="tnum text-ink-muted">{moneyText(c.feeMinor, c.currency)}</AdminTableCell>
                    <AdminTableCell className="tnum text-ink-muted">{moneyText(c.netMinor, c.currency)}</AdminTableCell>
                    <AdminTableCell className="tnum text-ink-muted">{pctText(c.rateBps)}</AdminTableCell>
                    <AdminTableCell className="tnum font-medium">{moneyText(c.amountMinor, c.currency)}</AdminTableCell>
                    <AdminTableCell>
                      <Badge tone={STANDING_TONE[s]}>{s === "held" ? `held to ${date(c.payableAt)}` : s}</Badge>
                      {c.reversalReason && <p className="mt-1 text-[11px] text-ink-dim">{c.reversalReason}</p>}
                    </AdminTableCell>
                    <AdminTableCell>
                      {c.kind === "commission" && c.status !== "reversed" && <ReverseForm id={c.id} partnerId={partner.id} />}
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </section>

      {payouts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Payouts</h2>
          <AdminTable>
            <AdminTableHead columns={["Date", "Amount", "Commissions", "Reference", "Recorded by"]} />
            <tbody>
              {payouts.map((p) => (
                <AdminTableRow key={p.id}>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(p.paidAt)}</AdminTableCell>
                  <AdminTableCell className="tnum font-medium">{moneyText(p.totalMinor, p.currency)}</AdminTableCell>
                  <AdminTableCell className="tnum text-ink-muted">{p.commissions}</AdminTableCell>
                  <AdminTableCell className="font-mono text-xs text-ink-dim">{p.reference ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{p.paidByEmail ?? "—"}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Signups</h2>
        {signups.length === 0 ? (
          <p className="text-sm text-ink-muted">No one has signed up through this link yet.</p>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Joined", "User", "Paid"]} />
            <tbody>
              {signups.map((s) => (
                <AdminTableRow key={s.userId}>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(s.signedUpAt)}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{s.email ?? "—"}</AdminTableCell>
                  <AdminTableCell>{s.paid ? <Badge tone="brand">paid</Badge> : <span className="text-ink-dim">not yet</span>}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Details</h2>
        <PartnerForm
          partner={{
            id: partner.id,
            slug: partner.slug,
            name: partner.name,
            email: partner.email,
            accountEmail,
            ratePercent: String(partner.rateBps / 100),
            bankName: partner.bankName,
            accountNumber: partner.accountNumber,
            accountName: partner.accountName,
            notes: partner.notes,
          }}
        />
        <PartnerStatusForm id={partner.id} status={partner.status} />
      </section>
    </div>
  );
}
