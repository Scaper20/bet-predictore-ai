import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { LegalNote } from "@/components/ui/legal-note";
import { SectionHeading, ButtonLink } from "@/components/ui/primitives";
import { PricingTable } from "@/components/pricing/pricing-table";
import { PlanMatrix } from "@/components/pricing/plan-matrix";
import { PlanMatrixMobile } from "@/components/pricing/plan-matrix-mobile";
import { IntervalToggle } from "@/components/pricing/interval-toggle";
import { sportPath } from "@/lib/routes";
import { headers } from "next/headers";
import { planById, priceSaving, type BillingCycle } from "@/lib/pricing";
import { flutterwaveConfigured } from "@/lib/flutterwave/client";
import { formatMoney, marketFor, NIGERIA } from "@/lib/payments/markets";

export const metadata: Metadata = {
  alternates: { canonical: "/pricing" },
  title: "Pricing",
  description:
    "Plans from a month to a full season, priced in your own currency. Start free — no card, no subscription required.",
  openGraph: {
    title: "BetriX Pricing",
    description: "Priced for where you are. Start free.",
  },
};

const faqs = (sellsAbroad: boolean) => [
  {
    q: "Do I need to pay to use BetriX?",
    a: "No. Every pick and every market on every match is free, along with live scores, fixtures and results. Pro adds Asian handicap, half-time markets, the full breakdowns, value against the price you're offered, staking guidance and more from Forge and Ask BetriX.",
  },
  {
    q: "What happened to passes?",
    a: "Passes are no longer sold; everything they unlocked is now in Pro. A pass you already bought keeps working until it runs out.",
  },
  {
    q: "Can I cancel?",
    a: sellsAbroad
      ? "In Nigeria, plans are subscriptions: cancel from Plan & billing at any time, and you keep access for the period you have already paid for with nothing charged after that. Outside Nigeria each payment buys a set period that never renews, so there is nothing to cancel."
      : "Yes, from Plan & billing in your account, at any time. Cancelling stops the next renewal — you keep access for the period you have already paid for, and nothing is charged after that.",
  },
  {
    q: "How do I pay?",
    a: sellsAbroad
      ? "In Nigeria through Paystack, in naira, by card or bank transfer. Elsewhere through Flutterwave, in your own currency: Mobile Money in Ghana, Uganda, Rwanda, Tanzania, Zambia and francophone Africa, M-Pesa in Kenya, and cards everywhere (US dollars outside the countries we price locally). We never see or store your card details."
      : "Through Paystack, in Naira. Cards and bank transfer are both supported. We never see or store your card details.",
  },
  {
    q: "Is my subscription tied to football?",
    a: "No. A plan covers every competition and every sport BetriX tracks, including anything added later at no extra cost.",
  },
];

export default async function PricingPage({ searchParams }: PageProps<"/pricing">) {
  const params = await searchParams;
  const raw = Array.isArray(params.interval) ? params.interval[0] : params.interval;
  const interval: BillingCycle = raw === "yearly" || raw === "quarterly" ? raw : "monthly";

  // Dynamic already (searchParams), so the market is read here and the
  // prices render right first time, unlike the cached landing page.
  const sellsAbroad = flutterwaveConfigured();
  const country = sellsAbroad ? ((await headers()).get("x-vercel-ip-country") ?? NIGERIA.country) : NIGERIA.country;
  const market = sellsAbroad ? marketFor(country) : NIGERIA;
  const proPrices = market.provider === "flutterwave" ? (market.prices?.pro ?? {}) : planById("pro").price;
  const proSaving = priceSaving(proPrices, interval);
  const FAQS = faqs(sellsAbroad);

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Priced for where you are"
        description="Start free. Pay in your own currency."
      />

      <Container className="py-7 sm:py-10">
        <div className="flex flex-col items-center gap-3">
          <IntervalToggle value={interval} />
          {proSaving && (
            <p className="text-xs text-ink-muted">
              Paying {interval} saves {formatMoney(proSaving.amount, market.currency)} on Pro — {proSaving.percent}% off.
            </p>
          )}
        </div>

        <div className="mt-10">
          <PricingTable
            interval={interval}
            sellsAbroad={sellsAbroad}
            country={country}
            hrefFor={(plan) =>
              plan.id === "free"
                ? "/account/sign-up"
                : `/account/billing?plan=${plan.id}${interval !== "monthly" ? `&cycle=${interval}` : ""}`
            }
          />
        </div>
      </Container>

      <section className="border-y border-line bg-shell">
        <Container className="py-10 sm:py-16">
          <SectionHeading
            eyebrow="Compare"
            title="What each plan includes"
            description="Every plan covers every competition we track. The difference is depth."
            align="center"
          />
          <div className="mt-6 sm:mt-10">
            <PlanMatrixMobile />
            <PlanMatrix />
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <SectionHeading eyebrow="Billing" title="Questions about paying" />
            <div className="mt-8 space-y-3">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="card group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center gap-4 text-sm font-semibold">
                    {f.q}
                    <span
                      className="ml-auto shrink-0 text-ink-dim transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5 sm:p-7">
              <h2 className="font-display text-xl font-bold">Not sure yet?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Every pick we publish is settled and kept on the record — wins and losses both.
                Read it before you pay us anything.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href={sportPath("trackRecord")} variant="secondary">
                  See the track record
                </ButtonLink>
                <ButtonLink href="/account/sign-up">Start free</ButtonLink>
              </div>
            </div>

            {/*
              LEGAL-PLACEHOLDER — drafted in-house to cover the obvious ground
              and to give counsel something concrete to mark up. Replace this
              block wholesale with counsel-approved copy before launch; do not
              edit it piecemeal, because the omissions matter more than the
              wording.
            */}
            <LegalNote>
              <p>
                BetriX is an analytics product. We do not accept bets, hold funds, or act as a
                bookmaker, and we are not affiliated with any bookmaker.
              </p>
              <p>
                Probabilities are statistical estimates, not statements of fact or predictions of
                outcome. Nothing here is financial advice and no plan guarantees a return. You are
                responsible for your own decisions and any money you stake.
              </p>
              <p>
                {sellsAbroad
                  ? "Prices are shown in your local currency (naira in Nigeria, US dollars outside the countries we price locally) and include any applicable taxes unless stated otherwise. Payments are processed by Paystack in Nigeria and by Flutterwave elsewhere."
                  : "All prices are in Nigerian Naira and include any applicable taxes unless stated otherwise. Payments are processed by Paystack."}
              </p>
              <p>
                {sellsAbroad ? "In Nigeria, subscriptions" : "Subscriptions"} renew
                automatically until cancelled, and cancelling ends future charges while leaving
                access in place for the period already paid for.
                {sellsAbroad ? " Outside Nigeria, each payment buys a fixed period and nothing renews." : ""}
              </p>
              <p>
                Value-shift alerts depend on bookmaker prices that move constantly; an alert
                reflects the price when we last checked it, and on most days there are few or none.
              </p>
              <p>
                18+ only. If gambling stops being fun,{" "}
                <Link
                  href="/responsible-gambling"
                  className="text-amber underline underline-offset-2"
                >
                  take a break
                </Link>
                .
              </p>
            </LegalNote>
          </div>
        </div>
      </Container>
    </>
  );
}
