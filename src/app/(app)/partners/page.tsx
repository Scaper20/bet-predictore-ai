import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPartnerDashboard } from "@/lib/partners-feed";
import { HOLD_DAYS, MIN_PAYOUT_MINOR, WINDOW_MONTHS, moneyText, partnerLink, pctText, standing, type Standing } from "@/lib/partners";
import { SITE_URL } from "@/lib/site-url";
import { CopyButton } from "@/components/admin/copy-button";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Partner dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TONE: Record<Standing, Tone> = { held: "amber", payable: "brand", paid: "neutral", reversed: "rose" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const planLabel = (plan: string | null) => {
  if (!plan) return "-";
  const [tier, cycle] = plan.split(":");
  return `${tier?.toUpperCase()}${cycle && cycle !== "once" ? ` · ${cycle}` : ""}`;
};
const total = (b: { currency: string; held: number; payable: number; paid: number }[], k: "held" | "payable" | "paid") =>
  b.length === 0 ? moneyText(0, "NGN") : b.map((x) => moneyText(x[k], x.currency)).join(" + ");

export default async function PartnerDashboardPage() {
  if (!supabaseConfigured) redirect("/");
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login?next=/partners");

  const d = await getPartnerDashboard(user.id);
  if (!d) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6 sm:py-16">
        <h1 className="font-display text-2xl font-bold">This account isn&apos;t a partner account</h1>
        <p className="mt-2 text-sm text-ink-muted">
          If you were told to expect a partner dashboard, make sure you are signed in with the email KiqStat linked to your partner profile, or message support from the chat button.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand underline underline-offset-2">
          Back to KiqStat
        </Link>
      </div>
    );
  }

  const link = partnerLink(SITE_URL, d.slug);
  const minNaira = MIN_PAYOUT_MINOR.NGN / 100;

  return (
    <>
      <PageHeader eyebrow="Partner" title={d.name} description={`You earn ${pctText(d.rateBps)} of every payment from people you bring, for their first ${WINDOW_MONTHS} months.`} />

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {d.status === "suspended" && (
          <div className="rounded-2xl border border-rose/30 bg-rose/5 p-4 text-sm text-ink">
            Your partner account is suspended. New signups are not credited and payouts are paused. Message support if you think this is a mistake.
          </div>
        )}

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-ink">Your link</h2>
          <div className="flex flex-wrap items-center gap-3">
            <code className="min-w-0 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">{link}</code>
            <CopyButton text={link} label="Copy link" />
          </div>
          <p className="text-xs leading-relaxed text-ink-dim">
            Anyone who opens it and creates an account within 90 days is credited to you, as long as yours was the first partner link they clicked. People who already have an account are not.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Signups" value={String(d.signups)} />
          <StatCard label="Subscribers" value={String(d.subscribers)} sublabel="Have paid" />
          <StatCard label="Pending" value={total(d.balances, "held")} sublabel={`Held ${HOLD_DAYS} days for refunds`} />
          <StatCard label="Payable" value={total(d.balances, "payable")} sublabel={`Paid monthly from ₦${minNaira.toLocaleString("en-NG")}`} />
          <StatCard label="Paid" value={total(d.balances, "paid")} sublabel="All time" />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Earnings</h2>
          {d.commissions.length === 0 ? (
            <EmptyState icon="🔗" title="No earnings yet" description="They show up here when someone who joined through your link pays." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    {["Date", "Subscriber", "Plan", "Commission", "Status"].map((c) => (
                      <th key={c} className="px-4 py-3 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.commissions.map((c, i) => {
                    const s = standing({ status: c.status, payable_at: c.payableAt });
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{day(c.createdAt)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-dim">{c.ref}</td>
                        <td className="px-4 py-3 text-ink-muted">{c.kind === "clawback" ? "Refund adjustment" : planLabel(c.plan)}</td>
                        <td className="tnum px-4 py-3 font-medium">{moneyText(c.amountMinor, c.currency)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={TONE[s]}>{s === "held" ? `pending to ${day(c.payableAt)}` : s}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {d.payouts.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Payouts</h2>
            <div className="card divide-y divide-line">
              {d.payouts.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-ink-muted">{day(p.paidAt)}</span>
                  <span className="tnum font-medium">{moneyText(p.totalMinor, p.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs leading-relaxed text-ink-dim">
          For privacy you see an anonymous reference for each subscriber, never a name or email. If a payment is refunded, its commission is cancelled, or deducted from your next payout if it was already paid. A balance under ₦{minNaira.toLocaleString("en-NG")} carries over to the next month.
        </p>
      </div>
    </>
  );
}
