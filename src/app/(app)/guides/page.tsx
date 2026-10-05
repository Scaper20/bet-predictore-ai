import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocCard, Example } from "@/components/guides/doc-page";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Betting Guides: Markets, Odds and Staking Explained",
  description:
    "What 1X2, double chance, over/under, GG/NG, draw no bet, Asian handicap and correct score mean; how odds become a probability; why accumulators are hard; and sensible staking.",
  alternates: { canonical: "/guides" },
};

const MARKETS: { name: string; also?: string; what: string; example: string }[] = [
  { name: "1X2", also: "Match result", what: "Home win (1), draw (X) or away win (2) after 90 minutes plus stoppage time. Extra time and penalties don't count.", example: "Arsenal v Chelsea ends 2-2: X wins, 1 and 2 lose." },
  { name: "Double chance", also: "1X, 12, X2", what: "Two of the three results in one bet. Safer than 1X2, so the odds are shorter.", example: "1X (home or draw) wins on any Arsenal win or any draw." },
  { name: "Over / Under goals", also: "O2.5, U2.5", what: "Total goals in the game above or below a line. Over 2.5 needs three or more goals; under 2.5 needs two or fewer.", example: "A 2-1 finish: over 2.5 wins (three goals), under 2.5 loses." },
  { name: "GG / NG", also: "Both teams to score", what: "GG: both teams score at least once. NG: at least one team doesn't score.", example: "1-0: NG wins. 1-1: GG wins." },
  { name: "Draw no bet", what: "Back a team to win; if the game is drawn your stake comes back.", example: "Home draw no bet at 1.70, game ends 0-0: you get your stake back." },
  { name: "Asian handicap", what: "One team starts with a goal head start or deficit, so the bet is about the margin. Half lines (−0.5, +1.5) can't be refunded; whole lines (−1) refund on exact margins.", example: "Home −1.5 needs the home side to win by two or more." },
  { name: "Correct score", what: "The exact final score. Big odds, because even the likeliest score usually happens only about one game in eight.", example: "Backing 1-1 at 6.50 pays only on exactly 1-1." },
];

export default function GuidesPage() {
  return (
    <DocPage
      eyebrow="Guides"
      title="Markets, odds and staking, without the jargon"
      intro={<>Everything you need to read a BetriX page and a betting slip with confidence, with a worked example for each idea.</>}
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
          id: "markets",
          title: "The markets",
          body: (
            <div className="grid gap-3 sm:grid-cols-2">
              {MARKETS.map((m, i) => (
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
          id: "odds",
          title: "Odds are a probability in disguise",
          body: (
            <>
              <p>
                Decimal odds tell you what a ₦1 stake returns, stake included. Turn them into the chance the bookmaker
                is implying by dividing 1 by the odds.
              </p>
              <Example>Odds of 2.50 → 1 ÷ 2.50 = 40%. Odds of 1.25 → 80%.</Example>
              <p>
                Add up the implied chances of every outcome in a market and you get more than 100%. The extra is the
                bookmaker&apos;s margin, how they make money whatever happens. A 1X2 market priced 2.10 / 3.40 / 3.60
                adds up to about 105%: a 5% margin.
              </p>
            </>
          ),
        },
        {
          id: "value",
          title: "Value: when a price is worth taking",
          body: (
            <>
              <p>
                A bet is good value when its odds are longer than the true chance deserves. Our{" "}
                <strong className="text-ink">break-even price</strong> is the dividing line: 1 divided by our
                probability.
              </p>
              <Example>
                We rate over 2.5 goals at 58%: break-even 1.72. At 1.85 it is value; at 1.60 it isn&apos;t, even though
                it should land more often than not.
              </Example>
              <p>
                The best pick isn&apos;t the likeliest one, it&apos;s the one priced most generously. A sure-looking
                bet at a poor price loses money over time.
              </p>
            </>
          ),
        },
        {
          id: "accumulators",
          title: "Why accumulators are hard",
          body: (
            <>
              <p>
                In an accumulator every leg has to land, so the chances multiply. Odds grow quickly, but the chance of
                winning shrinks faster than most people expect.
              </p>
              <Example>
                Five legs at 70% each: 0.7 × 0.7 × 0.7 × 0.7 × 0.7 ≈ <strong>17%</strong>. Even five strong picks win
                together only about one time in six.
              </Example>
              <p>
                Forge shows that combined chance for every slip it builds, so you can see the trade-off before you
                bet. Fewer, better-priced legs usually beat long slips.
              </p>
            </>
          ),
        },
        {
          id: "staking",
          title: "Staking without regret",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li><strong className="text-ink">Set a budget first</strong> and treat it as spent. Never bet money meant for rent, food or school fees.</li>
              <li><strong className="text-ink">Stake the same small share each time</strong>, for example 1-2% of your budget per bet. One bad day then can&apos;t wipe you out.</li>
              <li><strong className="text-ink">Never chase losses.</strong> Doubling up after a loss is how budgets disappear.</li>
              <li><strong className="text-ink">Keep a record.</strong> &ldquo;My slips&rdquo; on BetriX tracks your bets live, so you see honestly how you are doing.</li>
              <li>
                <strong className="text-ink">Take breaks.</strong> If it stops being fun, stop.{" "}
                <Link href="/responsible-gambling" className="font-semibold text-brand hover:underline">Get support</Link>.
              </li>
            </ul>
          ),
        },
        {
          id: "match-page",
          title: "Reading a BetriX match page",
          body: (
            <>
              <ul className="list-disc space-y-2 pl-5">
                <li><strong className="text-ink">The split bar</strong> under the score is our home / draw / away chance. The green segment is the outcome we favour.</li>
                <li><strong className="text-ink">Overview</strong>: our strongest read, its chance and the price it needs, plus form and a written analysis.</li>
                <li><strong className="text-ink">Markets</strong>: every market from the same scoreline model, and live bookmaker prices where we have them.</li>
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
