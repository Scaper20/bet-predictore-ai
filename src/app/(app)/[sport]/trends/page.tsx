import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ButtonLink } from "@/components/ui/primitives";
import { TrendsBoard } from "@/components/stats/trends-board";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { streakTrends } from "@/lib/stats/trends";
import { trends } from "@/lib/service";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  alternates: { canonical: "/football/trends" },
  title: "Football Trends and Streaks",
  description:
    "The streaks worth knowing before kick-off: winning runs, over 2.5 and GG streaks, clean sheets and slumps " +
    "for every team playing in the next three days.",
};

export const revalidate = 600;

export default async function TrendsPage() {
  const [streaks, slate] = await Promise.all([streakTrends(3).catch(() => []), trends(3).catch(() => null)]);

  return (
    <>
      <PageHeader
        eyebrow="Trends"
        title="Streaks to know before kick-off"
        description="Streaks for teams playing in the next three days."
      />
      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        {slate && slate.total > 0 && (
          <section className="stagger grid gap-3 sm:grid-cols-3">
            <Glance i={0} value={slate.total} label="games we rated for the next three days" />
            <Glance i={1} value={Math.round(slate.overLeaning * 100)} suffix="%" label="of them we expect to have three or more goals" />
            <Glance i={2} value={Math.round(slate.bttsLeaning * 100)} suffix="%" label="of them we expect both teams to score" />
          </section>
        )}

        {streaks.length === 0 ? (
          <EmptyState
            icon="📈"
            title="No streaks to show yet"
            description="Check back closer to the next games."
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">Browse fixtures</ButtonLink>}
          />
        ) : (
          <TrendsBoard trends={streaks} />
        )}

        <p className="text-xs leading-relaxed text-ink-dim">
          A streak is history, not a forecast: runs end. Our predictions weigh the whole record, so a streak here and our pick can
          disagree. Last ten finished games in any competition.
        </p>
      </div>
    </>
  );
}

function Glance({ value, suffix = "", label, i }: { value: number; suffix?: string; label: string; i: number }) {
  return (
    <div style={{ ["--i" as string]: i }} className="card flex items-center gap-4 p-4">
      <span className="font-display text-3xl font-extrabold text-brand">
        <AnimatedNumber value={value} suffix={suffix} />
      </span>
      <span className="text-sm leading-snug text-ink-muted">{label}</span>
    </div>
  );
}
