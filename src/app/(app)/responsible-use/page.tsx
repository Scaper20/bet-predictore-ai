import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  alternates: { canonical: "/responsible-use" },
  title: "Responsible Use",
  description:
    "Football should stay fun. Warning signs, practical limits, and where to get help, " +
    "wherever you are.",
};

const SIGNS = [
  "Spending more time or money on football than you planned",
  "Borrowing money, or dipping into rent or school fees, because of a prediction",
  "Hiding how much time or money it takes from family or friends",
  "Feeling anxious or low when you are not checking results",
  "Using football to escape stress rather than for enjoyment",
  "Promising yourself you will stop after the next match, repeatedly",
];

const LIMITS = [
  {
    title: "Decide your limits before you start",
    body: "Set how much time, and any money, football gets in a week, and keep to it. Not a target to make back, just the cost of a hobby.",
  },
  {
    title: "Never chase",
    body: "A bad result is gone. Trying to make up for it straight away is the most reliable way to turn a small setback into a large one.",
  },
  {
    title: "Keep combos short",
    body: "Every pick you add to a combo multiplies the chance of it going wrong. A long combo looks exciting because it almost never lands.",
  },
  {
    title: "Track what it actually costs you",
    body: "Write down the time and any money football takes for a month. Most people are surprised, and the number itself is often enough to change behaviour.",
  },
  {
    title: "Take real breaks",
    body: "Turn off notifications, log out, and step away for a few days. Breaks work precisely because they interrupt the habit.",
  },
];

export default function ResponsibleUsePage() {
  return (
    <>
      <PageHeader
        eyebrow="Take care"
        title="Responsible use"
        description="Stay informed. Stay in control."
      />

      <article className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber/25 bg-amber/5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-amber/40 text-sm font-bold text-amber">
              18+
            </span>
            <p className="text-sm leading-relaxed text-ink">
              KiqStat is for adults only: 18 and over, or older where local law requires. It is a
              sports analytics product. You cannot deposit money, place money on a match or win
              money on KiqStat.
            </p>
          </div>
        </div>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">A prediction is not a promise</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">
            <p>
              Everything on this site is a probability estimated from past results. A pick at 70%
              will still be wrong roughly three times in ten, and no amount of modelling changes
              that. Anyone telling you otherwise is selling something.
            </p>
            <p>
              Treat the numbers here as one input into your own view of a match, never as a reason
              to spend more than you had planned.
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
              If football is affecting your money, sleep, work or relationships, help is available.
              Speak to your doctor or a mental-health professional. Compulsive habits around money
              and sport are treatable, and they are taken seriously.
            </p>
            <p>
              Free, confidential support groups run in many countries, and many hold meetings
              online. A doctor or local health service can point you to one near you.
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
