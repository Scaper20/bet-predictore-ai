import type { Metadata } from "next";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/admin-access";
import { allOffers } from "@/lib/offers-server";
import { offerStats, CONVERT_DAYS, type OfferStat } from "@/lib/offers-stats";
import { campaignProgress, offerAudienceCount } from "@/lib/outreach-feed";
import { priceOverrides } from "@/lib/plan-prices";
import { PLANS, CYCLE_LABEL, type BillingCycle } from "@/lib/pricing";
import { planCodeOrNull } from "@/lib/paystack/plan-codes";
import { fetchPlan } from "@/lib/paystack/client";
import { durationLabel, naira, offerCampaign, offerLive, tierName, OFFER_AUDIENCES, type Offer } from "@/lib/offers";
import { KpiTile, PageHeader, Panel, SectionLabel, StatusPill } from "@/components/admin/kit";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { OfferForm, OfferSwitch, PriceForm } from "@/components/admin/offer-forms";
import { OutreachCampaignPanel } from "@/components/admin/outreach-campaign-panel";
import { queueOfferEmail, sendOfferBatch } from "@/app/actions/admin/offers";

export const metadata: Metadata = { title: "Offers & pricing" };

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];
const kobo = (k: number) => naira(Math.round(k / 100));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/**
 * Offers (lib/offers.ts) and plan prices, in one place: the two popups (new
 * visitors, free members), the email-only offers with their send panel, a
 * form for a new one, Nigeria's plan prices beside what Paystack charges
 * card subscribers, and who bought a pass and whether they stayed on.
 */
export default async function AdminOffersPage() {
  const me = await requirePermission("offers.manage");
  const pricing = can(me.roles, "pricing.manage");
  const [offers, stats] = await Promise.all([allOffers(), offerStats()]);
  const emailOffers = offers.filter((o) => o.audience === "email");
  const [progress, audience] = await Promise.all([
    Promise.all(emailOffers.map((o) => campaignProgress(offerCampaign(o.slug)))),
    emailOffers.length ? offerAudienceCount() : Promise.resolve(0),
  ]);
  const settled = stats.total.buyers - stats.total.pending;

  return (
    <div>
      <PageHeader
        eyebrow="Business"
        title="Offers & pricing"
        description="Passes at a price for one audience at a time: new visitors and free members see theirs as a popup; email offers open only from their email's link. Changes reach the site within a minute."
      />

      <section className="mb-8">
        <SectionLabel>Passes · last 30 days</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Passes sold" value={stats.last30.passes.toLocaleString()} icon="star" />
          <KpiTile label="Revenue" value={kobo(stats.last30.revenueKobo)} tone="gold" icon="card" />
          <KpiTile label="Buyers" value={stats.last30.buyers.toLocaleString()} tone="cyan" icon="users" />
          <KpiTile
            label={`Went on to a plan`}
            value={pct(stats.total.converted, settled)}
            hint={`${stats.total.converted} of ${settled} buyers within ${CONVERT_DAYS} days, all time${stats.total.pending ? ` · ${stats.total.pending} still inside their ${CONVERT_DAYS} days` : ""}`}
            tone="violet"
            icon="target"
          />
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel>Popups</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["new_visitors", "free_members"] as const).map((a) => {
            const info = OFFER_AUDIENCES.find((x) => x.id === a)!;
            const list = offers.filter((o) => o.audience === a);
            return (
              <Panel key={a} title={info.label} meta={info.detail}>
                {list.length === 0 ? (
                  <p className="text-xs text-ink-dim">No offer yet. Create one below.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((o) => (
                      <OfferRow key={o.id} offer={o} stat={stats.byOffer.get(o.id)} />
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel>Email offers</SectionLabel>
        {emailOffers.length === 0 ? (
          <p className="text-xs text-ink-dim">No email offer yet. Create one below with “Email only”.</p>
        ) : (
          <div className="space-y-4">
            {emailOffers.map((o, i) => (
              <Panel key={o.id} title={o.name} meta={`/offer/${o.slug}`}>
                <ul>
                  <OfferRow offer={o} stat={stats.byOffer.get(o.id)} />
                </ul>
                <div className="mt-4">
                  <OutreachCampaignPanel
                    campaign={offerCampaign(o.slug)}
                    label="Send to free members"
                    description={`Everyone on no paid plan, gift or pass who hasn't opted out of emails. Each link works only on its recipient's account${o.windowHours ? `, for ${durationLabel(o.windowHours)} after it's sent` : ""}. Switch the offer on first.`}
                    initialProgress={progress[i]}
                    audience={audience}
                    previews={[{ label: "Preview the email", href: `/admin/offers/preview?slug=${o.slug}` }]}
                    enqueue={queueOfferEmail}
                    send={sendOfferBatch}
                  />
                </div>
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <SectionLabel>New offer</SectionLabel>
        <details className="card group">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink">
            + Create an offer <span className="text-xs font-normal text-ink-dim">(saved switched off)</span>
          </summary>
          <div className="border-t border-line p-5">
            <OfferForm />
          </div>
        </details>
      </section>

      {pricing && (
        <section className="mb-8">
          <SectionLabel>Plan prices · Nigeria</SectionLabel>
          <PlanPrices />
        </section>
      )}

      <section>
        <SectionLabel>Recent pass buyers</SectionLabel>
        {stats.recent.length === 0 ? (
          <p className="text-xs text-ink-dim">No passes sold yet.</p>
        ) : (
          <AdminTable>
            <AdminTableHead columns={["Buyer", "Offer", "Paid", "Started", "Ends", `Plan in ${CONVERT_DAYS}d`]} />
            <tbody>
              {stats.recent.map((p, i) => (
                <AdminTableRow key={i}>
                  <AdminTableCell>{p.email ?? "—"}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{offers.find((o) => o.id === p.offerId)?.name ?? "—"}</AdminTableCell>
                  <AdminTableCell className="font-mono">{kobo(p.amountKobo)}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{when(p.startsAt)}</AdminTableCell>
                  <AdminTableCell className="text-ink-muted">{when(p.expiresAt)}</AdminTableCell>
                  <AdminTableCell>{p.converted ? <StatusPill tone="brand">Yes</StatusPill> : <span className="text-ink-dim">—</span>}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        )}
      </section>
    </div>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}

function OfferRow({ offer: o, stat }: { offer: Offer; stat?: OfferStat }) {
  const live = offerLive(o);
  const status = live ? <StatusPill tone="brand">Live</StatusPill> : o.active ? <StatusPill tone="amber">On, outside its dates</StatusPill> : <StatusPill tone="neutral">Off</StatusPill>;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{o.name}</p>
            {status}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {tierName(o.tier)} for {durationLabel(o.hours)} · <span className="font-mono text-ink">{naira(o.priceNaira)}</span>
            {o.windowHours ? ` · open ${durationLabel(o.windowHours)}` : ""} · {o.maxPerAccount === 1 ? "once per account" : `${o.maxPerAccount}× per account`}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-dim">
            {stat ? `${stat.passes} sold · ${kobo(stat.revenueKobo)} · ${stat.converted}/${stat.buyers} went on to a plan` : "None sold yet"}
          </p>
        </div>
        <OfferSwitch id={o.id} active={o.active} label={o.name} />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-brand">Edit</summary>
        <div className="mt-3 rounded-xl border border-line p-4">
          <OfferForm offer={o} />
        </div>
      </details>
    </li>
  );
}

/**
 * Nigeria's plan prices. "Default" is lib/pricing.ts; a price set here
 * overrides it for pay-once checkouts and every price shown. A card
 * subscription is charged what its Paystack plan says, shown beside it.
 */
async function PlanPrices() {
  const overrides = await priceOverrides();
  const rows = (["pro", "vip"] as const).flatMap((tier) => CYCLES.map((cycle) => ({ tier, cycle })));
  const paystack = await Promise.all(
    rows.map(async ({ tier, cycle }) => {
      const code = planCodeOrNull(tier, cycle);
      if (!code) return { code: null, naira: null as number | null };
      const plan = await fetchPlan(code).catch(() => null);
      return { code, naira: plan ? Math.round(plan.amount / 100) : null };
    }),
  );
  return (
    <Panel flush>
      <AdminTable>
        <AdminTableHead columns={["Plan", "Default", "Price now", "Card plan at Paystack", "Set (empty = default)"]} />
        <tbody>
          {rows.map(({ tier, cycle }, i) => {
            const def = PLANS.find((p) => p.id === tier)?.price[cycle] ?? 0;
            const set = overrides[tier]?.[cycle] ?? null;
            const now = set ?? def;
            const ps = paystack[i];
            return (
              <AdminTableRow key={`${tier}:${cycle}`}>
                <AdminTableCell>
                  {tierName(tier)} · {CYCLE_LABEL[cycle].name}
                </AdminTableCell>
                <AdminTableCell className="font-mono text-ink-muted">{naira(def)}</AdminTableCell>
                <AdminTableCell className="font-mono">{naira(now)}</AdminTableCell>
                <AdminTableCell>
                  {!ps.code ? (
                    <span className="text-xs text-ink-dim">No card plan</span>
                  ) : ps.naira === null ? (
                    <span className="text-xs text-ink-dim">Couldn&apos;t read</span>
                  ) : ps.naira === now ? (
                    <span className="font-mono text-xs text-brand">{naira(ps.naira)} ✓</span>
                  ) : (
                    <span className="text-xs text-amber">
                      <span className="font-mono">{naira(ps.naira)}</span> · differs: change the plan in Paystack too
                    </span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <PriceForm tier={tier} cycle={cycle} value={set} placeholder={def} />
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </tbody>
      </AdminTable>
    </Panel>
  );
}
