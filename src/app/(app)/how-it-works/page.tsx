import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocCard, Example } from "@/components/guides/doc-page";
import { scoreMatrix } from "@/lib/model/poisson";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "How Our Picks Work",
  description:
    "How BetriX turns real results into probabilities: team ratings, a scoreline model, the rules for when we publish a pick, and how every pick is graded.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <DocPage
      eyebrow="How our picks work"
      title="From real results to a probability"
      intro={
        <>
          No tipsters, no gut feel. Every number on BetriX comes from one statistical model fitted on thousands of
          finished games, and every pick it publishes is graded in public. Here is the whole process in plain words.
        </>
      }
      aside={
        <>
          <DocCard title="See it graded" href={sportPath("trackRecord")} cta="Track record">
            Every published pick is logged before kick-off and marked won or lost after the final whistle.
          </DocCard>
          <DocCard title="New to betting terms?" href="/guides" cta="Read the guides">
            What 1X2, GG, double chance and break-even odds mean, with examples.
          </DocCard>
        </>
      }
      sections={[
        {
          id: "short-version",
          title: "The short version",
          body: (
            <>
              <p>
                We rate how strongly every team attacks and defends, from its real results. For any game we turn those
                ratings into a chance for every possible scoreline. Add up the right scorelines and you have the chance
                of a home win, of over 2.5 goals, of both teams scoring, and every other market.
              </p>
              <p>
                Where there isn&apos;t enough history to trust the numbers, we say so and publish no pick. Where there
                is, we show the selection the model would stand on and the price it needs to be worth taking.
              </p>
            </>
          ),
        },
        {
          id: "ratings",
          title: "1. Ratings from results",
          body: (
            <>
              <p>
                Each team gets two numbers: <strong className="text-ink">attack</strong> (how many goals it scores
                compared with the league average) and <strong className="text-ink">defence</strong> (how few it
                concedes). They are fitted together, so scoring three against the league leaders counts for more than
                three against the bottom side.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><strong className="text-ink">Recent games count more.</strong> A result loses half its weight every six months or so, because squads and form change.</li>
                <li><strong className="text-ink">Home advantage is measured</strong> for each competition, not assumed, and switched off at neutral-venue tournaments.</li>
                <li><strong className="text-ink">Chances count, not just goals.</strong> Where the data records shots on target, half of each rating comes from the chances a team creates and allows, because goals alone are a noisy count of which chances went in.</li>
                <li><strong className="text-ink">Small samples are pulled to the middle.</strong> A newly promoted side with three games doesn&apos;t get an extreme rating from one lucky win, and starts a little below average, where promoted sides usually are.</li>
                <li><strong className="text-ink">National teams</strong> play too few games in one competition, so they are rated on every international in their confederation plus the World Cup and friendlies.</li>
              </ul>
            </>
          ),
        },
        {
          id: "scorelines",
          title: "2. From ratings to every scoreline",
          body: (
            <>
              <p>
                The ratings give each side an expected number of goals for this game. From those we work out the chance
                of every scoreline from 0-0 upwards, with a correction for low scores (the Dixon-Coles adjustment): real
                football has slightly more 0-0s and 1-1s than a plain goals model predicts.
              </p>
              <ScorelineGrid />
              <p>
                Every market is read off that one grid. That is why our 1X2, over/under, GG and correct-score numbers
                always agree with each other, and why Forge can price two picks in the same game exactly instead of
                guessing.
              </p>
            </>
          ),
        },
        {
          id: "when-we-publish",
          title: "3. When we publish a pick, and when we don't",
          body: (
            <>
              <p>We only publish a pick when the history behind it is deep enough:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>at least <strong className="text-ink">200 finished games</strong> in the competition, and</li>
                <li>at least <strong className="text-ink">3 games for each team</strong> in that sample.</li>
              </ul>
              <p>
                Below that the game is still listed, marked &ldquo;not enough history&rdquo;, with no pick. When the
                sample clears the bar but is under 400 games, the pick is labelled as a guide. We tested this: on 40
                games of history, picks landed 58% of the time against the 72% they claimed; on 200 they landed 71%,
                and on 400 they matched their claims. We would rather show nothing than a confident number built on a
                handful of games.
              </p>
            </>
          ),
        },
        {
          id: "the-pick",
          title: "4. Choosing the strongest read",
          body: (
            <>
              <p>
                For each game we look at every market and rank the selections by how far the model&apos;s chance sits
                above what usually happens in that competition. A 75% home win in a league where home sides win 45% of
                the time is a strong read; a 75% over 1.5 goals in a league where that lands 76% of the time says
                nothing new.
              </p>
              <p>The top of that list is the pick you see on the card and the match page.</p>
            </>
          ),
        },
        {
          id: "break-even",
          title: "5. The price a pick needs",
          body: (
            <>
              <p>
                Next to every pick is a <strong className="text-ink">break-even price</strong>: the odds at which the
                bet neither makes nor loses money over time. It is simply 1 divided by the probability.
              </p>
              <Example>
                We give a home win a 62.5% chance. Break-even is 1 ÷ 0.625 = <strong>1.60</strong>. If your bookmaker
                offers 1.75, the bet is worth taking; at 1.50 it loses money over time, however often it lands.
              </Example>
              <p>
                That is the question that matters: not &ldquo;will this land?&rdquo; but &ldquo;is the price long
                enough?&rdquo;. Match pages show live bookmaker prices next to ours where we have them.
              </p>
            </>
          ),
        },
        {
          id: "honesty",
          title: "6. Keeping ourselves honest",
          body: (
            <>
              <p>
                Every headline pick is written to a log before kick-off with its probability and price, and graded
                automatically against the final score. Nothing is edited or deleted afterwards. The{" "}
                <Link href={sportPath("trackRecord")} className="font-semibold text-brand hover:underline">track record</Link>{" "}
                shows all of it, wins and losses, by league and by market.
              </p>
            </>
          ),
        },
        {
          id: "limits",
          title: "7. What the model doesn't know",
          body: (
            <>
              <p>
                It learns from results only. It doesn&apos;t know about an injury announced this morning, a rotated
                team before a cup final, a manager sacked yesterday or a waterlogged pitch. Use the numbers as a
                starting point, not the last word.
              </p>
              <p>
                Probabilities are not promises: a 70% pick loses three times in ten, by design. Bet only what you can
                afford to lose.{" "}
                <Link href="/responsible-gambling" className="font-semibold text-brand hover:underline">Responsible gambling</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

/**
 * A real scoreline grid from the same function the predictions use, for a
 * game where the home side expects 1.6 goals and the away side 1.1. Cells
 * fade in diagonally, the way the chance spreads out from 1-1.
 */
function ScorelineGrid() {
  const grid = scoreMatrix(1.6, 1.1, -0.08);
  const n = 5;
  const max = Math.max(...grid.slice(0, n).flatMap((r) => r.slice(0, n)));
  let home = 0;
  let draw = 0;
  let away = 0;
  grid.forEach((row, h) => row.forEach((p, a) => (h > a ? (home += p) : h === a ? (draw += p) : (away += p))));
  return (
    <figure className="card overflow-hidden p-4 sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-dim">
        <span>Chance of each score · home expects 1.6 goals, away 1.1</span>
        <span className="tnum text-ink-muted">
          Home {Math.round(home * 100)}% · Draw {Math.round(draw * 100)}% · Away {Math.round(away * 100)}%
        </span>
      </figcaption>
      <div className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] gap-1 text-center">
        <span />
        {Array.from({ length: n }, (_, a) => (
          <span key={a} className="text-[10px] font-semibold text-ink-dim">{a}</span>
        ))}
        {Array.from({ length: n }, (_, h) => (
          <Row key={h} h={h} n={n} grid={grid} max={max} />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-dim">Rows: home goals. Columns: away goals. Greener is likelier.</p>
    </figure>
  );
}

function Row({ h, n, grid, max }: { h: number; n: number; grid: number[][]; max: number }) {
  return (
    <>
      <span className="grid place-items-center text-[10px] font-semibold text-ink-dim">{h}</span>
      {Array.from({ length: n }, (_, a) => {
        const p = grid[h][a];
        const t = p / max;
        return (
          <span
            key={a}
            className="pip tnum grid aspect-[1.6] place-items-center rounded-md text-[11px] font-semibold"
            style={{
              background: `color-mix(in oklab, var(--color-brand) ${Math.round(t * 70)}%, var(--color-surface-2))`,
              color: t > 0.55 ? "var(--color-brand-ink)" : "var(--color-ink-muted)",
              ["--p" as string]: h + a,
            }}
            title={`${h}-${a}: ${(p * 100).toFixed(1)}%`}
          >
            {(p * 100).toFixed(1)}
          </span>
        );
      })}
    </>
  );
}
