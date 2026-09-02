import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { LegalNote } from "@/components/ui/legal-note";
import { SectionHeading, ButtonLink } from "@/components/ui/primitives";
import { PricingTable } from "@/components/pricing/pricing-table";
import { PlanMatrix } from "@/components/pricing/plan-matrix";
import { IntervalToggle } from "@/components/pricing/interval-toggle";
import { sportPath } from "@/lib/routes";
import { planById, yearlySaving } from "@/lib/pricing";
import { naira } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Plans from a single matchday to a full season, priced in Naira. Start free — no card, no subscription required.",
  openGraph: {
    title: "BetriX Pricing",
    description: "From one matchday to a full season. Priced for Nigeria, cancel any time.",
  },
};

const FAQS = [
  {
    q: "Do I need to pay to use BetriX?",
    a: "No. Live scores, fixtures, match results and the headline prediction for every fixture are free, and a free account unlocks the full set of markets on every match. Paid plans add value detection against the price you're offered, staking guidance and the enhanced breakdowns.",
  },
  {
    q: "What exactly is the Weekend Pass?",
    a: "One-off access for a single matchday slate, with no subscription attached. It runs to the end of the following Monday, 23:59 West Africa Time, so a Friday purchase covers the whole weekend's fixtures.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, from Plan & billing in your account, at any time. Cancelling stops the next renewal — you keep access for the period you have already paid for, and nothing is charged after that.",
  },
  {
    q: "How do I pay?",
    a: "Through Paystack, in Naira. Cards and bank transfer are both supported. We never see or store your card details.",
  },
  {
    q: "Is my subscription tied to football?",
    a: "No. A plan covers every competition and every sport BetriX tracks, including anything added later at no extra cost.",
  },
];

export default async function PricingPage({ searchParams }: PageProps<"/pricing">) {
  const params = await searchParams;
  const raw = Array.isArray(params.interval) ? params.interval[0] : params.interval;
  const interval = raw === "yearly" ? "yearly" : "monthly";

  const proSaving = yearlySaving(planById("pro"));

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Priced for Nigeria"
        description="From a single matchday to a full season. Start free, upgrade when the numbers are earning their keep, cancel whenever."
      />

      <Container className="py-10">
        <div className="flex flex-col items-center gap-3">
          <IntervalToggle value={interval} />
          {proSaving && (
            <p className="text-xs text-ink-muted">
              Paying yearly saves {naira(proSaving.amount)} on Pro — {proSaving.percent}% off.
            </p>
          )}
        </div>

        <div className="mt-10">
          <PricingTable
            interval={interval}
            hrefFor={(plan) =>
              plan.id === "free"
                ? "/account/sign-up"
                : `/account/billing?plan=${plan.id}${interval === "yearly" ? "&cycle=yearly" : ""}`
            }
          />
        </div>
      </Container>

      <section className="border-y border-line bg-shell">
        <Container className="py-16">
          <SectionHeading
            eyebrow="Compare"
            title="What each plan includes"
            description="Every plan covers every competition we track. The difference is depth."
            align="center"
          />
          <div className="mt-10">
            <PlanMatrix />
          </div>
        </Container>
      </section>

      <Container className="py-16">
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
            <div className="card p-7">
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
                All prices are in Nigerian Naira and include any applicable taxes unless stated
                otherwise. Payments are processed by Paystack.
              </p>
              <p>
                The Weekend Pass is one-off access expiring at 23:59 West Africa Time on the
                Monday at the end of the covered slate; it does not renew. Subscriptions renew
                automatically until cancelled, and cancelling ends future charges while leaving
                access in place for the period already paid for.
              </p>
              <p>
                Services marked “coming soon” are not part of what you are buying today and may
                change or not ship.
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
