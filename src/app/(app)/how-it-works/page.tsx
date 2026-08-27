import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "How The Model Works",
  description:
    "The statistics behind BetriX: a Dixon-Coles bivariate Poisson model fitted by weighted " +
    "maximum likelihood on real completed matches.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="Method"
        title="How the model works"
        description="No black box. This page describes exactly what is computed and where it breaks down."
      />

      <article className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        <Section title="Where the data comes from">
          <p>
            Every fixture, scoreline and result on this site comes from live football data
            providers — football-data.org, API-Football and TheSportsDB. Nothing is generated,
            seeded or filled in. When the feeds return nothing for a competition, the page says so
            rather than showing something that looks like a match but is not one.
          </p>
          <p>
            Feeds overlap, so records are merged rather than ranked: the same fixture arriving from
            two sources is de-duplicated on the club pair and kickoff day, with the more detailed
            record kept and any gaps filled from the other.
          </p>
        </Section>

        <Section title="The model: Dixon-Coles">
          <p>
            Goals in football are close to Poisson-distributed, so each side gets a scoring rate
            and the scoreline distribution follows. For a fixture between home side <em>i</em> and
            away side <em>j</em>:
          </p>
          <Formula>
            λ = exp(intercept + attack<sub>i</sub> − defence<sub>j</sub> + homeAdvantage)
            <br />
            μ = exp(intercept + attack<sub>j</sub> − defence<sub>i</sub>)
          </Formula>
          <p>
            λ is the home side&apos;s expected goals and μ the away side&apos;s. Attack and defence
            are per-club ratings on a log scale, centred so that zero means exactly league average.
          </p>
          <p>
            Pure Poisson gets low-scoring matches wrong: 0-0, 1-0, 0-1 and 1-1 all happen more
            often than independent scoring rates imply, because teams change how they play when a
            game is tight. Dixon and Coles (1997) correct exactly those four scorelines with a
            dependency parameter, ρ, which the model fits alongside everything else.
          </p>
        </Section>

        <Section title="How the ratings are fitted">
          <p>
            Ratings are estimated by <strong>weighted maximum likelihood</strong> — the parameter
            set that makes the actual observed results most probable. Because the log-likelihood of
            a Poisson model with a log link is concave, and an L2 penalty makes it strictly
            concave, there is a single best answer and the optimiser reaches it.
          </p>
          <p>
            Two choices matter for football specifically. Recent matches are weighted more heavily,
            with the weight halving roughly every six months, so a squad&apos;s current level counts
            for more than what it did eighteen months ago. And the penalty pulls thinly-observed
            clubs toward league average, which is what stops a newly promoted side with three games
            played from being handed an extreme rating off a fluke result.
          </p>
        </Section>

        <Section title="Where the markets come from">
          <p>
            The two fitted rates expand into a full grid of scoreline probabilities. Every market
            is then read off that one grid — the match result, over/under at each line, both teams
            to score, double chance and correct score. Because they all come from the same
            distribution, they cannot contradict each other, which is a failure mode you will find
            on plenty of prediction sites.
          </p>
        </Section>

        <Section title="Odds, margin and value">
          <p>
            The odds shown next to a probability are <strong>fair odds</strong>: simply the inverse,
            with no margin added. A real bookmaker prices in a margin, which is why the implied
            probabilities on a betting slip add up to more than 100%.
          </p>
          <p>
            The value finder on each match page removes that margin before comparing anything. This
            is not a detail — comparing a model probability against a raw bookmaker price will
            flag &quot;value&quot; on selections that are actually break-even or worse. Allocation
            guidance uses the Kelly criterion at a quarter stake and is capped at 5% of bankroll.
          </p>
        </Section>

        <Section title="Where it breaks down">
          <p>
            The model knows results. It does not know that a first-choice striker is suspended,
            that a side has a cup final in midweek, or that the pitch is waterlogged. Those things
            move real matches and this model cannot see any of them.
          </p>
          <p>
            It is also only as good as its sample. Every prediction shows how many completed
            matches it was fitted on and a data-quality score. Where that sample is too thin — a
            competition with fewer than fifteen results, or a club with almost no appearances —
            <strong> no pick is published at all</strong>. The numbers are still shown, with a
            warning, because dressing up a guess as analysis is the exact thing this site exists to
            avoid.
          </p>
          <p>
            Finally: a probability is not a prediction. A 65% home win means the model expects that
            result about two times in three, which also means it will be wrong about one time in
            three. That is the model working correctly, not failing.
          </p>
        </Section>

        <div className="rounded-2xl border border-line bg-shell p-6">
          <h2 className="font-display text-lg font-bold">See it on a real match</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Every match page shows the fitted ratings, the sample size and the parameters used.
          </p>
          <ButtonLink href="/predictions" className="mt-4">
            Open today&apos;s predictions
          </ButtonLink>
        </div>
      </article>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 font-mono text-sm leading-relaxed text-ink">
      {children}
    </div>
  );
}
