import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocCard } from "@/components/guides/doc-page";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY } from "@/lib/company";
import { SITE_URL as SITE } from "@/lib/site-url";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: { absolute: "About KiqStat · Who We Are" },
  description: `KiqStat is a football data and prediction platform built by ${COMPANY.legalName}, a ${COMPANY.nationality} company. What we do, what we don't, and how to reach us.`,
  alternates: { canonical: "/about" },
};

/*
 * The questions people type into a search engine before trusting a site like
 * this one. Rendered on the page and published as FAQPage structured data
 * from the same strings, so the two can't drift apart. Every answer has to
 * stay literally true: this page exists to be believed.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Is KiqStat legit?",
    a: `Yes. KiqStat is a product of ${COMPANY.legalName}, a ${COMPANY.nationality} company. It publishes football data and statistical predictions, and logs every pick before kick-off so anyone can check how it has done.`,
  },
  {
    q: "Is KiqStat a scam?",
    a: "No. KiqStat never holds your money and never promises results. Most of the site is free with no card required, and paid plans are optional subscriptions paid through Paystack.",
  },
  {
    q: "What kind of company is KiqStat?",
    a: "KiqStat is an independent sports analytics company. You cannot deposit money, place money on a match or win money on KiqStat. It shows data and probabilities, and what you do with them is up to you.",
  },
  {
    q: "Who owns KiqStat?",
    a: `KiqStat is built and run by ${COMPANY.legalName}, a ${COMPANY.nationality} company.`,
  },
  {
    q: "Does KiqStat guarantee wins or sell fixed matches?",
    a: "No. Nobody can guarantee a football result, and anyone selling fixed matches is running a scam. KiqStat predictions are probabilities from a statistical model, and some of them lose. The track record shows the losses as well as the wins.",
  },
  {
    q: "How do I pay, and is it safe?",
    a: "Payments go through Paystack, in naira, by bank transfer, OPay, PalmPay, USSD or card. KiqStat never sees or stores your card details, and a plan paid once never renews.",
  },
  {
    q: "How do I spot someone pretending to be KiqStat?",
    a: `The only KiqStat website is kiqstat.app and our email ends in @kiqstat.app. KiqStat will never ask for your password, your bank PIN or a payment to a personal account, by email, phone or WhatsApp. Report anything suspicious to ${COMPANY.supportEmail}.`,
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "AboutPage",
              url: `${SITE}/about`,
              name: "About KiqStat",
              about: { "@id": `${SITE}/#organization` },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
              })),
            },
          ],
        }}
      />
      <DocPage
        eyebrow="About KiqStat"
        title="Football data you can check for yourself"
        intro={
          <>
            KiqStat is a football data and prediction platform for fans across Africa and the world. It is a product of{" "}
            <strong className="text-ink">{COMPANY.legalName}</strong>, a {COMPANY.nationality} company.
          </>
        }
        aside={
          <>
            <DocCard title="See every pick graded" href={sportPath("trackRecord")} cta="Track record">
              Every published pick is logged before kick-off and marked won or lost after the final whistle.
            </DocCard>
            <DocCard title="Talk to us" href={`mailto:${COMPANY.supportEmail}`} cta={COMPANY.supportEmail}>
              Questions, problems or something that looks wrong? Email the team.
            </DocCard>
          </>
        }
        sections={[
          {
            id: "what-kiqstat-is",
            title: "What KiqStat is",
            body: (
              <>
                <p>
                  KiqStat turns real football results into probabilities. A statistical model rates how strongly every
                  team attacks and defends, works out the chance of every scoreline in a game, and from those the chance
                  of a home win, of over 2.5 goals, of both teams scoring and every other common market.
                </p>
                <p>
                  The aim is simple: before you decide anything about a match, you should know what the numbers say,
                  and how often those numbers have been right. We show both.
                </p>
              </>
            ),
          },
          {
            id: "what-we-do",
            title: "What we do",
            body: (
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-ink">Live scores, fixtures, results and league tables</strong> for the
                  Premier League, the NPFL, the Champions League, AFCON, the CAF competitions and the other major
                  leagues.
                </li>
                <li>
                  <strong className="text-ink">Model predictions</strong> for every match, with the probability behind
                  each one and the price it needs to be worth taking.{" "}
                  <Link href="/how-it-works" className="text-brand hover:underline">How the model works</Link>.
                </li>
                <li>
                  <strong className="text-ink">A public track record.</strong> Every pick is logged before kick-off and
                  graded after the final whistle, wins and losses alike.
                </li>
                <li>
                  <strong className="text-ink">Form, trends, ratings and head-to-heads</strong> for anyone who wants to
                  do their own reading.
                </li>
                <li>
                  <strong className="text-ink">Forge and Ask KiqStat.</strong> Forge builds a combo from the
                  model&apos;s own numbers to the risk level and price you choose; Ask KiqStat answers questions about any
                  match. Both are free to try, and paid plans add more of each plus deeper prediction types.{" "}
                  <Link href="/pricing" className="text-brand hover:underline">See plans</Link>.
                </li>
              </ul>
            ),
          },
          {
            id: "what-we-dont-do",
            title: "What we don't do",
            body: (
              <ul className="list-disc space-y-1.5 pl-5">
                <li>We are <strong className="text-ink">analytics only.</strong> You can&apos;t deposit money, place money on a match or win money on KiqStat.</li>
                <li>We <strong className="text-ink">never promise wins</strong> and never sell &ldquo;fixed&rdquo; or &ldquo;sure&rdquo; matches. Anyone who does is lying.</li>
                <li>We <strong className="text-ink">don&apos;t hide the losses.</strong> Where the model has too little data to trust, it says so and publishes no pick.</li>
                <li>We <strong className="text-ink">don&apos;t take your card details.</strong> Payments are handled by Paystack.</li>
              </ul>
            ),
          },
          {
            id: "responsible",
            title: "Responsible use",
            body: (
              <p>
                KiqStat is for adults, 18 and over. Predictions are estimates, not certainties: never spend money you
                can&apos;t afford to lose because of one. If it stops being fun,{" "}
                <Link href="/responsible-use" className="text-brand hover:underline">get help here</Link>.
              </p>
            ),
          },
          {
            id: "faq",
            title: "Is KiqStat real? Common questions",
            body: (
              <div className="space-y-5">
                {FAQ.map(({ q, a }) => (
                  <div key={q}>
                    <h3 className="font-semibold text-ink">{q}</h3>
                    <p className="mt-1">{a}</p>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "contact",
            title: "Contact",
            body: (
              <p>
                {COMPANY.legalName} · {COMPANY.country}
                <br />
                Email:{" "}
                <a href={`mailto:${COMPANY.supportEmail}`} className="text-brand hover:underline">
                  {COMPANY.supportEmail}
                </a>
                <br />
                Website: <a href={SITE} className="text-brand hover:underline">kiqstat.app</a>
              </p>
            ),
          },
        ]}
      />
    </>
  );
}
