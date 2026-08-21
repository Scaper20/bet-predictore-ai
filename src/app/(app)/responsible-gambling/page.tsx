import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Responsible Gambling",
  description:
    "Betting should stay entertainment. Warning signs, practical limits, and where to get help " +
    "in Nigeria.",
};

const SIGNS = [
  "Betting more than you planned, or chasing a loss with a bigger stake",
  "Borrowing money, or dipping into rent or school fees, to fund a bet",
  "Hiding how much you stake from family or friends",
  "Feeling anxious or low when you are not betting",
  "Betting to escape stress rather than for enjoyment",
  "Promising yourself you will stop after the next one, repeatedly",
];

const LIMITS = [
  {
    title: "Set the amount before you start",
    body: "Decide what you can lose without it changing your week, and treat that as the whole budget. Not a target to win back — a cost of entertainment.",
  },
  {
    title: "Never chase",
    body: "A loss is gone. Raising the stake to recover it is the single most reliable way to turn a small loss into a large one.",
  },
  {
    title: "Keep accumulators short",
    body: "Every leg you add multiplies the bookmaker's margin against you. The payout looks life-changing because it almost never pays.",
  },
  {
    title: "Track what you actually stake",
    body: "Write down every bet for a month. Most people are surprised, and the number itself is often enough to change behaviour.",
  },
  {
    title: "Take real breaks",
    body: "Use the self-exclusion and cooling-off tools your bookmaker offers. They exist precisely because they work.",
  },
];

export default function ResponsibleGamblingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Take care"
        title="Responsible gambling"
        description="This site exists to make betting better informed. It should never make it heavier."
      />

      <article className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber/25 bg-amber/5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-amber/40 text-sm font-bold text-amber">
              18+
            </span>
            <p className="text-sm leading-relaxed text-ink">
              Sports betting in Nigeria is legal and regulated, and restricted to adults aged 18 and
              over. BetriX does not accept bets or hold funds — it is an analytics product.
            </p>
          </div>
        </div>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">A prediction is not a promise</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">
            <p>
              Everything on this site is a probability estimated from past results. A selection at
              70% will still lose roughly three times in ten, and no amount of modelling changes
              that. Anyone telling you otherwise is selling something.
            </p>
            <p>
              Treat the numbers here as one input into your own decision, never as a signal to
              stake more than you had planned.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Warning signs</h2>
          <ul className="mt-4 space-y-2.5">
            {SIGNS.map((s) => (
              <li key={s} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            If more than one of these sounds familiar, it is worth talking to someone.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Practical limits that work</h2>
          <div className="mt-4 space-y-4">
            {LIMITS.map((l) => (
              <div key={l.title} className="card p-5">
                <h3 className="text-sm font-semibold">{l.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{l.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Getting help</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">
            <p>
              If betting has stopped being a choice, help is available. Speak to your doctor or a
              mental-health professional — problem gambling is treatable, and it is treated
              seriously.
            </p>
            <p>
              In Nigeria, the <strong className="text-ink">National Lottery Regulatory
              Commission</strong> oversees licensed operators, and every licensed bookmaker is
              required to offer self-exclusion. Ask them to close or freeze your account; they must
              act on it.
            </p>
            <p>
              Talking to someone you trust is not a small step. It is usually the one that
              works.
            </p>
          </div>
        </section>
      </article>
    </>
  );
}
