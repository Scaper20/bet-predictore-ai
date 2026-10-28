import type { Metadata } from "next";
import Link from "next/link";
import { sportPath } from "@/lib/routes";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { HubCard } from "@/components/code-hub/hub-card";
import { meets } from "@/lib/entitlements";
import { finishedScores, pastHub, runningHub, todayHub } from "@/lib/code-hub-feed";
import { codeState, hubAccess, hubLegResult, hubStatus } from "@/lib/code-hub";
import { GENERATOR_ALLOWANCE } from "@/lib/code-hub-plans";
import { bookingAvailable } from "@/lib/odds/booking-code";
import { WaitlistWall } from "@/components/code-hub/waitlist-wall";
import { HubTabs } from "@/components/code-hub/hub-tabs";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { hubGate, onWaitlist } from "@/lib/code-hub-gate";

export const metadata: Metadata = {
  alternates: { canonical: "/football/code-hub" },
  title: "Code Hub: Today's Ready-Made Combos",
  description:
    "Ready-made codes every day from the KiqStat model, from 2 to 20 odds, each with a SportyBet booking code and the model's chance of it landing.",
};

// Per viewer: which codes are open depends on the plan.
export const dynamic = "force-dynamic";

export default async function CodeHubPage() {
  const { entitlement, open, admin, allowed } = await hubGate();
  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Code Hub" title="Code Hub" />
        <Container className="py-10 sm:py-14">
          <WaitlistWall email={entitlement.email} joined={await onWaitlist(entitlement.userId)} />
        </Container>
      </>
    );
  }

  const [today, running, live, past] = await Promise.all([todayHub(), runningHub(), bookingAvailable(), pastHub(7)]);
  const paid = meets(entitlement.tier, "pro");
  const now = today.now;
  // Today's codes, then earlier four-day codes whose games are still on.
  const all = [...today.codes, ...running];
  const scores = await finishedScores([...new Set(all.flatMap((c) => c.legs.map((l) => l.matchId)))]);
  // A code leaves the board the moment a leg misses: there is nothing left
  // to follow, and the board is for codes still worth loading.
  const missed = (c: (typeof all)[number]) =>
    hubStatus(c.legs.map((l) => hubLegResult(l, scores[l.matchId])), c.firstKickoff, now) === "lost";
  const codes = all.filter((c) => !missed(c));
  // The record, newest first, won and lost alike: earlier codes whose games
  // are over, and today's or running codes already beaten by a leg. Settled,
  // so open to everyone.
  const settled = [
    ...all.filter(missed).map((c) => ({ code: c, results: c.legs.map((l) => hubLegResult(l, scores[l.matchId])) })),
    ...past.days.flatMap((d) => d.codes.map((c) => ({ code: c, results: c.legs.map((l) => hubLegResult(l, past.scores[l.matchId])) }))),
  ].map((x) => ({ ...x, status: hubStatus(x.results, x.code.firstKickoff, now) }));
  const landed = settled.filter((x) => x.status === "won");
  const lost = settled.filter((x) => x.status === "lost");

  return (
    <>
      <PageHeader
        eyebrow="Code Hub"
        title="Today's codes"
        actions={
          !open ? (
            <Badge tone="amber">{admin ? "Admin view" : "Preview"}: visitors see the waitlist until launch</Badge>
          ) : paid ? (
            <Badge tone="brand">All codes open</Badge>
          ) : null
        }
      />

      <Container className="space-y-6 py-4 sm:space-y-12 sm:py-10">
        <HubTabs active="codeHub" />
        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="sr-only">
            Today&apos;s codes
          </h2>
          {codes.length === 0 ? (
            <EmptyState
              icon="⏱"
              title="No codes left for today"
              description={
                all.length > 0
                  ? "Today's codes are under way or settled. Tomorrow's codes go up after midnight."
                  : "Today's games have started or there were too few strong reads to build from. Tomorrow's codes go up after midnight."
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {codes.map((c) => {
                const results = c.legs.map((l) => hubLegResult(l, scores[l.matchId]));
                return (
                  <HubCard
                    key={`${c.day}-${c.tier}`}
                    publishedOn={c.day === today.day ? undefined : shortDay(c.day)}
                    tier={c.tier}
                    legs={c.legs}
                    odds={c.odds}
                    probability={c.probability}
                    firstKickoff={c.firstKickoff}
                    access={hubAccess(c.tier, c.firstKickoff, paid, now)}
                    status={hubStatus(results, c.firstKickoff, now)}
                    results={results}
                    code={codeState({ bookingCode: c.bookingCode, deadline: c.bookingDeadline }, c.firstKickoff, now)}
                    preview={!live}
                  />
                );
              })}
              <GeneratorPanel paid={paid} />
            </div>
          )}
        </section>

        {landed.length + lost.length > 0 && (
          <section aria-labelledby="results-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="results-heading" className="font-display text-lg font-bold text-ink">
                Results, last 7 days
              </h2>
              <p className="tnum text-sm text-ink-muted">
                <span className="font-semibold text-brand">{landed.length} won</span> ·{" "}
                <span className="font-semibold text-rose">{lost.length} lost</span> · {Math.round((100 * landed.length) / (landed.length + lost.length))}% landed
              </p>
            </div>
            <ChipTabs
              ariaLabel="Results"
              sections={[
                { key: "won", label: `Won · ${landed.length}`, node: <ResultGrid items={landed} empty="No code landed in the last 7 days." /> },
                { key: "lost", label: `Lost · ${lost.length}`, node: <ResultGrid items={lost} empty="No code lost in the last 7 days." /> },
              ]}
            />
          </section>
        )}

        <section className="grid gap-4 text-sm text-ink-muted sm:grid-cols-3">
          <HowItem title="Built by the model">
            Every game and pick comes from the same numbers as the predictions pages. The chance shown is the model&apos;s
            chance of every pick landing together.
          </HowItem>
          <HowItem title="Load it on SportyBet">
            Copy the code, open SportyBet and use Load code. A code stops working once its first game starts.
          </HowItem>
          <HowItem title="Honest chances">
            Every code shows the model&apos;s real chance of landing, and long codes usually miss. A code holds the picks,
            not the prices: SportyBet shows its own odds when you load it.{" "}
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

type Settled = { code: Awaited<ReturnType<typeof todayHub>>["codes"][number]; results: ReturnType<typeof hubLegResult>[]; status: "won" | "lost" | "live" | "pending" };

/** Settled codes, each with its games and how every leg went. */
function ResultGrid({ items, empty }: { items: Settled[]; empty: string }) {
  if (items.length === 0) return <p className="card p-5 text-sm text-ink-dim">{empty}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ code: c, results, status }) => (
        <HubCard
          key={`${c.day}-${c.tier}`}
          settledOn={shortDay(c.day)}
          tier={c.tier}
          legs={c.legs}
          odds={c.odds}
          probability={c.probability}
          firstKickoff={c.firstKickoff}
          access="open"
          status={status}
          results={results}
          code={{ state: "closed" }}
          preview={false}
        />
      ))}
    </div>
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

/** The per-person generator: where to find it, and each plan's weekly allowance. */
function GeneratorPanel({ paid }: { paid: boolean }) {
  return (
    <article className="card flex flex-col justify-between p-5">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-violet">Pro and VIP</p>
        <h3 className="mt-2 font-display text-lg font-bold text-ink">Your own combo as a code</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          Build a combo in{" "}
          <Link href={sportPath("forge")} className="font-semibold text-brand hover:underline">
            Forge
          </Link>{" "}
          or your combo, or open any match, and tap <span className="font-semibold text-ink">Get SportyBet code</span>.
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

function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
