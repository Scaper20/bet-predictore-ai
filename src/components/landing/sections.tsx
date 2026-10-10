import Link from "next/link";
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { PricingTable } from "@/components/pricing/pricing-table";
import { flutterwaveConfigured } from "@/lib/flutterwave/client";
import { Container, containerClass } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";
import { sportPath } from "@/lib/routes";

/* ---------------------------------------------------------------- Features */

const FEATURES = [
  {
    icon: "📊",
    title: "A real model, not a hunch",
    body:
      "Time-weighted attack and defence ratings, fitted by maximum likelihood on completed " +
      "matches. The same maths quant desks use.",
  },
  {
    icon: "⚡",
    title: "Live scores that keep up",
    body:
      "Every running match across the competitions we track, refreshed continuously with " +
      "the clock and the scoreline straight from the feed.",
  },
  {
    icon: "🎯",
    title: "Every market from one distribution",
    body:
      "1X2, over/under, BTTS, double chance and correct score all read off the same scoreline " +
      "grid — so the numbers can never contradict each other.",
  },
  {
    icon: "🧮",
    title: "Value, margin stripped out",
    body:
      "Paste in the price you have been offered. We strip the margin, compare it against the " +
      "price the selection has to beat, and tell you whether it is worth taking at all.",
  },
  {
    icon: "🌍",
    title: "African football, worldwide",
    body:
      "NPFL and CAF competitions alongside the Premier League and the rest of Europe. Kickoff " +
      "times in your own time zone, prices in your own currency, and Mobile Money, M-Pesa or card to pay.",
  },
  {
    icon: "🔍",
    title: "It shows its working",
    body:
      "Sample size, data quality and model uncertainty on every prediction. When the history " +
      "is too thin, we say so and publish no pick at all.",
  },
];

export function Features() {
  return (
    <section className={`${containerClass()} py-12 sm:py-20 lg:py-28`}>
      <Reveal>
        <SectionHeading
          eyebrow="What you get"
          title="Everything you need to read a match properly"
          description="The numbers behind every pick."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-5 sm:p-7">
              <div className="grid size-11 place-items-center rounded-lg bg-surface-2 text-xl">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ How it works */

const STEPS = [
  {
    n: "01",
    title: "We pull the real results",
    body:
      "Completed matches for the competition come in from the live feeds. Early in a season " +
      "we reach back into previous campaigns so the ratings are never fitted on three games.",
  },
  {
    n: "02",
    title: "The model fits itself to them",
    body:
      "Attack and defence ratings, home advantage and the low-score correction are all " +
      "estimated by maximum likelihood, with recent matches weighted more heavily.",
  },
  {
    n: "03",
    title: "You get probabilities, with caveats",
    body:
      "Those rates expand into a full scoreline distribution. Every market is read off it, " +
      "alongside how much history is actually standing behind the number.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-line bg-shell">
      <Container className="py-12 sm:py-20 lg:py-28">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Three steps, no black box"
            description="You can check every stage of this on the match pages. That is the point."
            align="center"
          />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative card p-5 sm:p-7">
                <span className="font-mono tracking-tighter text-4xl font-medium text-brand/15">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <ButtonLink href={sportPath("trackRecord")} variant="secondary">
              See the settled record
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ----------------------------------------------------------------- Leagues */

export function Leagues() {
  return (
    <section className={`${containerClass()} py-12 sm:py-20 lg:py-24`}>
      <Reveal>
        <SectionHeading
          eyebrow="Coverage"
          title="The football fans follow, from Lagos to Nairobi and beyond"
          description="Europe's big leagues and cups, African club football, and the national teams."
        />
        {(
          [
            ["Clubs", CLUB_LEAGUES],
            ["National teams", INTERNATIONAL_LEAGUES],
          ] as const
        ).map(([label, group]) => (
          <div key={label} className="mt-8 first-of-type:mt-10">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">{label}</h3>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {group.map((l) => (
                <Link
                  key={l.code}
                  href={`${sportPath("fixtures")}?league=${l.code}`}
                  className="card card-hover flex items-center gap-2.5 px-4 py-3"
                >
                  <span className="text-lg" aria-hidden>{l.flag}</span>
                  <span className="text-sm font-medium">{l.shortName}</span>
                  <span className="text-xs text-ink-dim">{l.country}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------------- Pricing */

export function Pricing() {
  return (
    <section className="border-y border-line bg-shell">
      <Container className="py-12 sm:py-20 lg:py-28">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Priced for where you are"
            description="In your own currency, from a month to a full season."
            align="center"
          />
          {/* Same cards as /pricing and /account/billing — see pricing-table.tsx
              for why all three stopped having their own copy of this. */}
          <div className="mt-12">
            <PricingTable
              sellsAbroad={flutterwaveConfigured()}
              hrefFor={(plan) =>
                plan.id === "free" ? "/account/sign-up" : `/account/billing?plan=${plan.id}`
              }
            />
          </div>
          <div className="mt-8 text-center">
            <ButtonLink href="/pricing" variant="secondary">
              Compare every plan
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------------- FAQ */

export const FAQS = [
  {
    q: "Are these real matches?",
    a: "Yes. Every fixture, scoreline and result comes from live football data providers. Nothing on this site is generated or placeholder data — if the feeds return nothing, the page says so rather than filling the gap.",
  },
  {
    q: "How accurate are the predictions?",
    a: "They are probabilities, not forecasts. A 60% home win means the model expects that outcome roughly six times in ten — which also means four times in ten it will not happen. We publish the sample size and data quality behind every number so you can judge how much weight it deserves.",
  },
  {
    q: "How are the probabilities produced?",
    a: "Team attack and defence ratings, home advantage and a low-score correction are fitted on completed matches, with recent games weighted more heavily. Those rates expand into a full scoreline distribution, and every market is read off that same distribution — so the numbers can never contradict each other.",
  },
  {
    q: "Why does a match sometimes have no pick?",
    a: "Because there is not enough completed history in that competition to stand behind one. Rather than dress up a guess as analysis, the model output is shown with an explicit warning and no selection is published.",
  },
  {
    q: "Do you cover the NPFL?",
    a: "Yes, alongside the CAF Champions League and the European leagues and cups fans across Africa follow most. Depth of NPFL data depends on which feeds are configured, and each prediction tells you what it was fitted on.",
  },
  {
    q: "Do you predict Super Eagles and other international matches?",
    a: "Yes. AFCON, World Cup and qualifiers, the Euros, Nations League, Copa America, Gold Cup and international friendlies are all covered. National teams play too rarely for one tournament to rate them, so each side is rated on every international in its confederation, and tournament finals are modelled at a neutral venue.",
  },
  {
    q: "Is this legal where I live?",
    a: "KiqStat is an analytics product. We do not take bets, hold funds or act as a bookmaker, so using it is not betting. Betting itself is regulated differently in every country: only bet where it is legal for you, and never under your country's legal age (18 in Nigeria and most countries, higher in some).",
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:py-20 sm:px-6 lg:px-8 lg:py-28">
      <Reveal>
        <SectionHeading eyebrow="Questions" title="Straight answers" align="center" />
        <div className="mt-12 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="card group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center gap-4 text-sm font-semibold">
                {f.q}
                <span className="ml-auto shrink-0 text-ink-dim transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* --------------------------------------------------------------------- CTA */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-line">
      <div
        className="pointer-events-none absolute inset-x-0 -bottom-32 h-72 opacity-25 blur-[110px]"
        style={{ background: "radial-gradient(ellipse at center, var(--color-brand), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold sm:text-5xl">
            Stop guessing.
            <br />
            <span className="text-gradient-brand">Start reading the numbers.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-ink-muted">
            Every pick on every match is free. Go Pro for the full breakdowns, half-time markets,
            Asian handicap and more from Forge and Ask KiqStat.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={sportPath("predictions")}>Open today&apos;s predictions</ButtonLink>
            <ButtonLink href={sportPath("trackRecord")} variant="secondary">
              See the settled record
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
