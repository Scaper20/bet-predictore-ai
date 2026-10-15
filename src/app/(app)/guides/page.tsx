import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocCard, Example } from "@/components/guides/doc-page";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Football Prediction Guides: Probabilities and Prediction Types Explained",
  description:
    "What match result, two results, over/under, both teams to score, draw excluded, winning margin and correct score predictions mean; how a price becomes a probability; why combos are hard; and how to read a match page.",
  alternates: { canonical: "/guides" },
};

/** Our plain names, then what the same thing is called elsewhere. */
const OTHER_NAMES: [string, string][] = [
  ["Match result", "1X2, full-time result"],
  ["Two results", "Double chance (1X, X2, 12)"],
  ["Both teams to score", "BTTS, GG / NG"],
  ["Over / Under goals", "Totals, O/U 2.5"],
  ["Draw excluded", "DNB"],
  ["Winning margin", "Asian handicap (AH)"],
  ["Combo", "Accumulator, acca, multiple"],
  ["Price", "Odds"],
  ["Value", "Value pick, overlay"],
  ["Predictions", "Tips, picks"],
];

const TYPES: { name: string; also?: string; what: string; example: string }[] = [
  { name: "Match result", also: "1X2: home, draw, away", what: "Home win, draw or away win after 90 minutes plus stoppage time. Extra time and penalties don't count.", example: "Arsenal v Chelsea ends 2-2: the draw is right, home and away are wrong." },
  { name: "Two results", also: "Double chance: 1X, X2, 12", what: "Two of the three results together. More likely than any single result, so the price is shorter.", example: "Home or draw is right on any Arsenal win or any draw." },
  { name: "Over / Under goals", also: "O2.5, U2.5", what: "Total goals in the game above or below a line. Over 2.5 needs three or more goals; under 2.5 needs two or fewer.", example: "A 2-1 finish: over 2.5 is right (three goals), under 2.5 is wrong." },
  { name: "Both teams to score", also: "BTTS, GG / NG", what: "Yes: both teams score at least once. No: at least one team doesn't score.", example: "1-0: No is right. 1-1: Yes is right." },
  { name: "Draw excluded", also: "DNB", what: "Which team wins if the game has a winner. A draw makes the pick void, neither right nor wrong.", example: "Home, draw excluded, game ends 0-0: the pick is void." },
  { name: "Winning margin", also: "Asian handicap, AH", what: "One team starts with a goal head start or deficit, so the prediction is about the margin. Half lines (−0.5, +1.5) always settle; whole lines (−1) are void on an exact margin.", example: "Home −1.5 needs the home side to win by two or more." },
  { name: "Correct score", what: "The exact final score. Rarely right, because even the likeliest score usually happens only about one game in eight.", example: "A 1-1 pick is right only on exactly 1-1." },
];

export default function GuidesPage() {
  return (
    <DocPage
      eyebrow="Guides"
      title="Predictions and probabilities, without the jargon"
      intro={<>Everything you need to read a KiqStat page with confidence, with a worked example for each idea.</>}
      aside={
        <>
          <DocCard title="How we build the numbers" href="/how-it-works" cta="How our picks work">
            Ratings from results, a scoreline model, and the rules for when we publish.
          </DocCard>
          <DocCard title="Try it on a real game" href={sportPath("predictions")} cta="Today's predictions">
            Every card shows the split, our pick and the price it needs.
          </DocCard>
        </>
      }
      sections={[
        {
          id: "types",
          title: "The prediction types",
          body: (
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((m, i) => (
                <div key={m.name} className="card p-4" style={{ ["--i" as string]: i }}>
                  <p className="font-display text-lg font-bold text-ink">
                    {m.name}
                    {m.also && <span className="ml-2 font-sans text-xs font-medium text-ink-dim">{m.also}</span>}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{m.what}</p>
                  <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-ink">{m.example}</p>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "prices",
          title: "A price is a probability in disguise",
          body: (
            <>
              <p>
                The decimal prices quoted for a match are a probability written another way. Turn a price into the
                chance it implies by dividing 1 by it.
              </p>
              <Example>A price of 2.50 → 1 ÷ 2.50 = 40%. A price of 1.25 → 80%.</Example>
              <p>
                Add up the implied chances of every outcome and you get more than 100%. The extra is the margin built
                into the prices. A match result priced 2.10 / 3.40 / 3.60 adds up to about 105%: a 5% margin.
              </p>
            </>
          ),
        },
        {
          id: "value",
          title: "Value: when a price is generous",
          body: (
            <>
              <p>
                A price is good value when it is longer than the true chance deserves. Enter a price on a combo and
                KiqStat rates it for you.
              </p>
              <p>
                The best pick isn&apos;t the likeliest one, it&apos;s the one priced most generously. A sure-looking
                pick at a poor price is still poor value.
              </p>
            </>
          ),
        },
        {
          id: "combos",
          title: "Why combos are hard",
          body: (
            <>
              <p>
                In a combo every pick has to be right, so the chances multiply. The combined price grows quickly, but
                the chance of the whole combo landing shrinks faster than most people expect.
              </p>
              <Example>
                Five picks at 70% each: 0.7 × 0.7 × 0.7 × 0.7 × 0.7 ≈ <strong>17%</strong>. Even five strong picks are
                all right together only about one time in six.
              </Example>
              <p>
                Forge shows that combined chance for every combo it builds, so you can see the trade-off up front.
                Fewer, stronger picks usually beat long combos.
              </p>
            </>
          ),
        },
        {
          id: "using-predictions",
          title: "Using predictions well",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li><strong className="text-ink">Read every number as a chance, not a promise.</strong> A 70% pick is wrong three times in ten, by design.</li>
              <li><strong className="text-ink">Check the evidence.</strong> Every match page shows the sample size and data quality behind the read.</li>
              <li><strong className="text-ink">Keep a record.</strong> &ldquo;My combos&rdquo; on KiqStat follows your picks live, so you see honestly how they do.</li>
              <li>
                <strong className="text-ink">Take breaks.</strong> If it stops being fun, stop.{" "}
                <Link href="/responsible-use" className="font-semibold text-brand hover:underline">Get support</Link>.
              </li>
            </ul>
          ),
        },
        {
          id: "other-names",
          title: "Other names you'll see",
          body: (
            <>
              <p>
                Football markets go by different names on different sites. Ours are written in plain words; these are the
                same things under the names you may already know.
              </p>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                {OTHER_NAMES.map(([ours, theirs]) => (
                  <div key={ours} className="contents">
                    <dt className="font-semibold text-ink">{ours}</dt>
                    <dd className="text-ink-muted">{theirs}</dd>
                  </div>
                ))}
              </dl>
            </>
          ),
        },
        {
          id: "match-page",
          title: "Reading a KiqStat match page",
          body: (
            <>
              <ul className="list-disc space-y-2 pl-5">
                <li><strong className="text-ink">The split bar</strong> under the score is our home / draw / away chance. The green segment is the outcome we favour.</li>
                <li><strong className="text-ink">Overview</strong>: our strongest read, its chance and the price it needs, plus form and a written analysis.</li>
                <li><strong className="text-ink">Predictions</strong>: every prediction type from the same scoreline model, and live market prices where we have them.</li>
                <li><strong className="text-ink">Stats</strong>: both teams side by side over their last ten games, with their 1-10 model rating.</li>
                <li><strong className="text-ink">Table and Head-to-head</strong>: the live league table with both clubs picked out, and their past meetings.</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
