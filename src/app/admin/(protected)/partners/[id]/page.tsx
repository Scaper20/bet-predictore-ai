import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartnerDetail } from "@/lib/partners-feed";
import { moneyText, partnerLink, pctText, standing, type Standing } from "@/lib/partners";
import { SITE_URL } from "@/lib/site-url";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { StatCard } from "@/components/admin/stat-card";
import { CopyButton } from "@/components/admin/copy-button";
import { CancelRateChangeForm, CreditSignupForm, ForfeitForm, PartnerForm, PartnerStatusForm, PayoutForm, RateChangeForm, ReverseForm, TerminateForm } from "@/components/admin/partner-forms";
import { INSPECTION_DAYS, inPilot, inspectionDue, isTerminated } from "@/lib/partner-terms";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/admin-access";

export const metadata: Metadata = { title: "Partner" };
export const dynamic = "force-dynamic";

const STANDING_TONE: Record<Standing, Tone> = { held: "amber", payable: "brand", paid: "neutral", reversed: "rose" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("partners.view");
  const canPay = can(me.roles, "partners.payout");
  const { id } = await params;
  const detail = await getPartnerDetail(id);
  if (!detail) notFound();
  const { partner, balances, commissions, payouts, signups, signupCount, accountEmail, rateChanges, forfeitures } = detail;
  const now = new Date();
  const ended = isTerminated(partner.terminatedAt ? new Date(partner.terminatedAt) : null, now);
  const activated = partner.activatedAt ? new Date(partner.activatedAt) : null;
  const piloting = inPilot(activated, now);
  const inspectAt = inspectionDue(activated);
  const canManage = can(me.roles, "partners.manage");
  const shownStatus = ended ? "terminated" : partner.status;
  const link = partnerLink(SITE_URL, partner.slug);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/partners" className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink">
          ← All partners
        </Link>
        <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Business · Partner</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{partner.name}</h1>
          <Badge tone={shownStatus === "active" ? "brand" : "rose"}>{shownStatus}</Badge>
          <Badge tone="neutral">{pctText(partner.rateBps)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="min-w-0 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
      </div>

      {partner.terminatedAt && (
        <div className="rounded-2xl border border-rose/30 bg-rose/5 p-4 text-sm text-ink">
          {ended ? "Terminated" : "Termination set"} {ended ? "on" : "for"} {date(partner.terminatedAt)}
          {partner.terminationForCause ? " (for cause)" : ""}. {partner.terminationReason}
          <p className="mt-1 text-xs text-ink-muted">
            No new accounts are credited from that date. Customers who had already paid keep earning to the end of their own 12 months, and the partner is paid with no minimum.
          </p>
        </div>
      )}
      {piloting && inspectAt && !partner.terminatedAt && (
        <div className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink">
          In the 90-day pilot. {INSPECTION_DAYS}-day inspection {inspectAt.getTime() <= now.getTime() ? "was due" : "is due"} {date(inspectAt.toISOString())}: check referrals, refunds and chargebacks, and the promotion itself; then keep, change the rate for new customers, or end the pilot (7 days&apos; notice).
        </div>
      )}

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
            {canPay && balances
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
                      {canPay && c.kind === "commission" && c.status !== "reversed" && <ReverseForm id={c.id} partnerId={partner.id} />}
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
        <div className="space-y-1">
          <CreditSignupForm partnerId={partner.id} />
          <p className="text-xs text-ink-dim">
            For a signup the site missed: credits the account to this partner and pays commission on anything it has
            already paid.
          </p>
        </div>
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
        <h2 className="text-sm font-semibold text-ink">Rate and agreement</h2>
        {rateChanges.length > 0 && (
          <AdminTable>
            <AdminTableHead columns={["Notified", "Change", "Effective", "Status", ""]} />
            <tbody>
              {rateChanges.map((c) => (
                <AdminTableRow key={c.id}>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(c.notifiedAt)}</AdminTableCell>
                  <AdminTableCell className="tnum">
                    {pctText(c.fromBps)} to {pctText(c.toBps)}
                    {c.agreedInWriting && <span className="ml-2 text-[11px] text-ink-dim">agreed in writing</span>}
                  </AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap text-ink-muted">{date(c.effectiveAt)}</AdminTableCell>
                  <AdminTableCell>
                    <Badge tone={c.cancelledAt ? "neutral" : c.appliedAt ? "brand" : "amber"}>{c.cancelledAt ? "cancelled" : c.appliedAt ? "in force" : "scheduled"}</Badge>
                  </AdminTableCell>
                  <AdminTableCell>{canManage && !c.appliedAt && !c.cancelledAt && <CancelRateChangeForm id={c.id} partnerId={partner.id} />}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
        {canManage && shownStatus !== "terminated" && <RateChangeForm partnerId={partner.id} currentPercent={String(partner.rateBps / 100)} />}
        {canManage && !partner.terminatedAt && <TerminateForm partnerId={partner.id} />}
        {canManage && (partner.terminatedAt || forfeitures.length > 0) && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Forfeited referrals</h3>
            <ForfeitForm partnerId={partner.id} />
            {forfeitures.length > 0 && (
              <ul className="space-y-1 text-xs text-ink-muted">
                {forfeitures.map((f) => (
                  <li key={f.userId}>{f.email ?? f.userId}: {f.reason} ({date(f.createdAt)})</li>
                ))}
              </ul>
            )}
          </div>
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
        {shownStatus !== "terminated" && <PartnerStatusForm id={partner.id} status={partner.status === "suspended" ? "suspended" : "active"} />}
      </section>
    </div>
  );
}
