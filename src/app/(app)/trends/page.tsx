import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PredictionCard } from "@/components/match/prediction-card";
import { EmptyState, ButtonLink, ProbabilityBar } from "@/components/ui/primitives";
import { trends } from "@/lib/service";
import { percent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Betting Trends",
  description:
    "What the model reads across the whole upcoming slate: goal expectation, over/under lean, " +
    "BTTS lean and the fixtures it feels most strongly about.",
};

export const revalidate = 300;

export default async function TrendsPage() {
  const snapshot = await trends(3).catch(() => null);

  if (!snapshot || snapshot.total === 0) {
    return (
      <>
        <PageHeader eyebrow="Trends" title="Betting trends" />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <EmptyState
            icon="📈"
            title="No slate to analyse yet"
            description="Trends are computed across the upcoming fixtures the feeds return. When there are none, there is nothing honest to summarise."
            action={<ButtonLink href="/fixtures" variant="secondary">Browse fixtures</ButtonLink>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Trends"
        title="What the slate looks like"
        description={`Aggregated across ${snapshot.total} upcoming fixtures over the next three days, of which ${snapshot.publishable} have enough history to model properly.`}
      />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <TrendCard
            label="Average expected goals"
            value={snapshot.avgExpectedGoals.toFixed(2)}
            hint="Per match across the modelled slate"
            meter={Math.min(1, snapshot.avgExpectedGoals / 4)}
            tone="brand"
          />
          <TrendCard
            label="Leaning over 2.5"
            value={percent(snapshot.overLeaning)}
            hint="Fixtures the model puts above 55% for over 2.5"
            meter={snapshot.overLeaning}
            tone="amber"
          />
          <TrendCard
            label="Leaning BTTS"
            value={percent(snapshot.bttsLeaning)}
            hint="Fixtures the model puts above 55% for BTTS"
            meter={snapshot.bttsLeaning}
            tone="cyan"
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Fixtures the model feels most strongly about
          </h2>
          <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-dim">
            Ranked by how far the outcome spread sits from a three-way coin flip. These are the
            matches where the ratings are actually saying something — not necessarily the ones
            offering the best price.
          </p>

          {snapshot.standouts.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="Nothing stands out yet"
              description="No upcoming fixture currently has enough history behind it to make a confident read."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.standouts.map((p) => (
                <PredictionCard key={p.match.id} prediction={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function TrendCard({
  label,
  value,
  hint,
  meter,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  meter: number;
  tone: "brand" | "amber" | "cyan";
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="tnum mt-2 font-display text-3xl font-extrabold">{value}</p>
      <div className="mt-4">
        <ProbabilityBar value={meter} tone={tone} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">{hint}</p>
    </div>
  );
}
