import Link from "next/link";
import { Badge, ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { LEAGUES } from "@/lib/leagues";
import { naira } from "@/lib/format";
import { PLANS } from "@/lib/pricing";

/* ---------------------------------------------------------------- Features */

const FEATURES = [
  {
    icon: "📊",
    title: "A real model, not a hunch",
    body:
      "Dixon-Coles goal modelling with time-weighted attack and defence ratings, fitted by " +
      "maximum likelihood on completed matches. The same maths quant desks use.",
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
      "Paste in the price you have been offered. We strip the margin, compare against the " +
      "model's fair price and tell you the edge and a sane allocation.",
  },
  {
    icon: "🇳🇬",
    title: "Nigeria first",
    body:
      "NPFL and CAF competitions alongside the Premier League. Prices in Naira, kickoff " +
      "times in WAT, written the way Nigerian football fans actually talk.",
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
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading
        eyebrow="What you get"
        title="Everything you need to read a match properly"
        description="Most tipster sites hand you a pick and ask you to trust them. This one hands you the numbers and the sample size behind them."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card card-hover p-6">
            <div className="grid size-11 place-items-center rounded-xl bg-surface-2 text-xl">
              {f.icon}
            </div>
            <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </div>
        ))}
      </div>
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
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps, no black box"
          description="You can check every stage of this on the match pages. That is the point."
          align="center"
        />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="relative card p-7">
              <span className="font-display text-5xl font-extrabold text-brand/15">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <ButtonLink href="/how-it-works" variant="secondary">
            Read the full method
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Leagues */

export function Leagues() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="Coverage"
        title="The leagues that matter most in Nigeria"
        description="Ordered by how much they actually matter here — not by European convention."
      />
      <div className="mt-10 flex flex-wrap gap-2.5">
        {LEAGUES.map((l) => (
          <Link
            key={l.code}
            href={`/fixtures?league=${l.code}`}
            className="card card-hover flex items-center gap-2.5 px-4 py-3"
          >
            <span className="text-lg" aria-hidden>{l.flag}</span>
            <span className="text-sm font-medium">{l.shortName}</span>
            <span className="text-xs text-ink-dim">{l.country}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Pricing */

const CTA: Record<string, string> = {
  free: "Start free",
  pass: "Get this weekend",
  pro: "Go Pro",
  vip: "Go VIP",
};

export function Pricing() {
  return (
    <section className="border-y border-line bg-shell">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Pricing"
          title="Priced for Nigeria"
          description="From a single matchday to a full season. Cancel whenever you like."
          align="center"
        />
        <div className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => {
            const price = p.price.oneOff ?? p.price.monthly;
            return (
              <div
                key={p.id}
                className={`card relative flex flex-col p-7 ${
                  p.highlighted ? "border-brand/40 glow-brand" : ""
                }`}
              >
                {p.highlighted && (
                  <Badge tone="brand" className="absolute -top-3 left-7">
                    Most popular
                  </Badge>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-extrabold">
                    {!price ? "Free" : naira(price)}
                  </span>
                  <span className="text-sm text-ink-dim">{p.cadence}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-ink-muted">
                      <span className="mt-0.5 text-brand" aria-hidden>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href={p.id === "free" ? "/predictions" : `/account/billing?plan=${p.id}`}
                  variant={p.highlighted ? "primary" : "secondary"}
                  className="mt-7 w-full"
                >
                  {CTA[p.id]}
                </ButtonLink>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- FAQ */

const FAQS = [
  {
    q: "Are these real matches?",
    a: "Yes. Every fixture, scoreline and result comes from live football data providers. Nothing on this site is generated or placeholder data — if the feeds return nothing, the page says so rather than filling the gap.",
  },
  {
    q: "How accurate are the predictions?",
    a: "They are probabilities, not forecasts. A 60% home win means the model expects that outcome roughly six times in ten — which also means four times in ten it will not happen. We publish the sample size and data quality behind every number so you can judge how much weight it deserves.",
  },
  {
    q: "What model do you use?",
    a: "A Dixon-Coles bivariate Poisson model. Team attack and defence ratings, home advantage and a low-score dependency correction are fitted by weighted maximum likelihood on completed matches, with recent games weighted more heavily.",
  },
  {
    q: "Why does a match sometimes have no pick?",
    a: "Because there is not enough completed history in that competition to stand behind one. Rather than dress up a guess as analysis, the model output is shown with an explicit warning and no selection is published.",
  },
  {
    q: "Do you cover the NPFL?",
    a: "Yes, alongside the CAF Champions League and the European competitions Nigerians follow most. Depth of NPFL data depends on which feeds are configured, and each prediction tells you what it was fitted on.",
  },
  {
    q: "Is this legal in Nigeria?",
    a: "This is an analytics product. We do not take bets, hold funds or act as a bookmaker. Sports betting is regulated in Nigeria and restricted to adults 18 and over.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
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
        <h2 className="font-display text-3xl font-extrabold sm:text-5xl">
          Stop guessing.
          <br />
          <span className="text-gradient-brand">Start reading the numbers.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-muted">
          Free to use, no card, no sign-up wall. Open today&apos;s slate and see what the model
          makes of it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/predictions">Open today&apos;s predictions</ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary">
            How the model works
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
