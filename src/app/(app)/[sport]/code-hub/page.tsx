import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { HubCard } from "@/components/code-hub/hub-card";
import { getEntitlement, meets } from "@/lib/entitlements";
import { finishedScores, pastHub, todayHub } from "@/lib/code-hub-feed";
import {
  codeState,
  hubAccess,
  hubLegResult,
  hubStatus,
  hubTier,
  type FinalScore,
  type HubTierId,
} from "@/lib/code-hub";
import { odds } from "@/lib/format";
import { GENERATOR_ALLOWANCE } from "@/lib/code-hub-plans";

export const metadata: Metadata = {
  alternates: { canonical: "/football/code-hub" },
  title: "Code Hub: Today's Ready-Made Combos",
  description:
    "Five combos a day from the KiqStat model, from about 2 to 20 odds, each with a SportyBet booking code and the model's chance of it landing.",
};

// Per viewer: which codes are open depends on the plan.
export const dynamic = "force-dynamic";

export default async function CodeHubPage() {
  const [entitlement, today, past] = await Promise.all([getEntitlement(), todayHub(), pastHub(7)]);
  const paid = meets(entitlement.tier, "pro");
  const now = today.now;
  const scores = await finishedScores([...new Set(today.codes.flatMap((c) => c.legs.map((l) => l.matchId)))]);

  return (
    <>
      <PageHeader
        eyebrow="Code Hub"
        title="Today's codes"
        description="Ready-made combos from the model, about 2 to 20 odds, each with a SportyBet code."
        actions={
          !today.stored ? (
            <Badge tone="amber">Preview: codes switch on at launch</Badge>
          ) : paid ? (
            <Badge tone="brand">All codes open</Badge>
          ) : null
        }
      />

      <Container className="space-y-12 py-8 sm:py-10">
        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="sr-only">
            Today&apos;s codes
          </h2>
          {today.codes.length === 0 ? (
            <EmptyState
              icon="⏱"
              title="No codes left for today"
              description="Today's games have started or there were too few strong reads to build from. Tomorrow's codes go up after midnight."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {today.codes.map((c) => {
                const results = c.legs.map((l) => hubLegResult(l, scores[l.matchId]));
                return (
                  <HubCard
                    key={c.tier}
                    tier={c.tier}
                    legs={c.legs}
                    odds={c.odds}
                    probability={c.probability}
                    firstKickoff={c.firstKickoff}
                    access={hubAccess(c.tier, c.firstKickoff, paid, now)}
                    status={hubStatus(results, c.firstKickoff, now)}
                    results={results}
                    code={codeState({ bookingCode: c.bookingCode, deadline: c.bookingDeadline }, c.firstKickoff, now)}
                    preview={!today.stored}
                  />
                );
              })}
              <GeneratorPanel paid={paid} />
            </div>
          )}
        </section>

        <PastCodes days={past.days} scores={past.scores} now={now} />

        <section className="grid gap-4 text-sm text-ink-muted sm:grid-cols-3">
          <HowItem title="Built by the model">
            Every game and pick comes from the same numbers as the predictions pages. The chance shown is the model&apos;s
            chance of every pick landing together.
          </HowItem>
          <HowItem title="Load it on SportyBet">
            Copy the code, open SportyBet and use Load code. A code stops working once its first game starts.
          </HowItem>
          <HowItem title="Graded in public">
            Every code stays on this page with its result, landed or missed.{" "}
            <Link href="/responsible-use" className="text-brand hover:underline">
              Keep it fun
            </Link>
            : 18+ only.
          </HowItem>
        </section>
      </Container>
    </>
  );
}

function HowItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}

/** The per-person generator, announced here until it launches with the new plans. */
function GeneratorPanel({ paid }: { paid: boolean }) {
  return (
    <article className="card flex flex-col justify-between border-dashed p-5">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-violet">Coming soon</p>
        <h3 className="mt-2 font-display text-lg font-bold text-ink">Your own combo as a code</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          Build a combo in Forge or My combos and turn it into a SportyBet code in one tap.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {GENERATOR_ALLOWANCE.map((a) => (
            <li key={a.tier} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span className="font-semibold text-ink">{a.label}</span>
              <span className="text-ink-muted">{a.perWeek} codes a week</span>
            </li>
          ))}
        </ul>
      </div>
      {!paid && (
        <Link href="/pricing" className="mt-4 text-sm font-semibold text-brand hover:underline">
          Compare plans →
        </Link>
      )}
    </article>
  );
}

function PastCodes({
  days,
  scores,
  now,
}: {
  now: number;
  days: { day: string; codes: { tier: HubTierId; legs: import("@/lib/code-hub").HubLeg[]; odds: number; firstKickoff: number }[] }[];
  scores: Record<string, FinalScore>;
}) {
  const graded = days.flatMap((d) =>
    d.codes.map((c) => {
      const results = c.legs.map((l) => hubLegResult(l, scores[l.matchId]));
      return { day: d.day, ...c, results, status: hubStatus(results, c.firstKickoff, now) };
    }),
  );
  const settled = graded.filter((g) => g.status === "won" || g.status === "lost");
  const landed = settled.filter((g) => g.status === "won").length;

  return (
    <section aria-labelledby="past-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="past-heading" className="font-display text-xl font-bold sm:text-2xl">
            Last 7 days
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Every code we published, with how it finished.</p>
        </div>
        {settled.length > 0 && (
          <p className="font-mono text-sm text-ink-muted">
            <strong className="text-ink">{landed}</strong> of {settled.length} landed
          </p>
        )}
      </div>

      {graded.length === 0 ? (
        <p className="card mt-4 px-5 py-6 text-sm text-ink-muted">
          The record starts on launch day. From then on, every code stays here with its result.
        </p>
      ) : (
        <div className="card mt-4 divide-y divide-line">
          {graded.map((g) => {
            const hits = g.results.filter((r) => r === "win").length;
            return (
              <div key={`${g.day}-${g.tier}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-dim">{shortDay(g.day)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{hubTier(g.tier)?.name}</span>
                <span className="hidden font-mono text-xs text-ink-dim sm:inline">
                  {hits}/{g.legs.length} picks
                </span>
                <span className="w-14 text-right font-mono text-ink-muted">{odds(g.odds)}</span>
                <span className="w-20 text-right">
                  {g.status === "won" ? (
                    <Badge tone="brand">Landed</Badge>
                  ) : g.status === "lost" ? (
                    <Badge tone="rose">Missed</Badge>
                  ) : (
                    <Badge>Pending</Badge>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
