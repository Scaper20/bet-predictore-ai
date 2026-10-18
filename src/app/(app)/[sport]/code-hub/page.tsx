import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { HubCard } from "@/components/code-hub/hub-card";
import { getEntitlement, meets } from "@/lib/entitlements";
import { finishedScores, pastHub, runningHub, todayHub } from "@/lib/code-hub-feed";
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
import { checkAdmin } from "@/lib/admin";
import { switchOn } from "@/lib/switches";
import { parsebotLive } from "@/lib/odds/parsebot";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { WaitlistWall } from "@/components/code-hub/waitlist-wall";

export const metadata: Metadata = {
  alternates: { canonical: "/football/code-hub" },
  title: "Code Hub: Today's Ready-Made Combos",
  description:
    "Ready-made codes every day from the KiqStat model, from 2 to 20 odds, each with a SportyBet booking code and the model's chance of it landing.",
};

// Per viewer: which codes are open depends on the plan.
export const dynamic = "force-dynamic";

export default async function CodeHubPage() {
  const [entitlement, open, admin] = await Promise.all([
    getEntitlement(),
    switchOn("code_hub_open"),
    checkAdmin().then((g) => g.ok),
  ]);

  // Behind the waitlist until it opens from /admin/parsebot. Admins see
  // through it, so the real page can be checked before launch.
  if (!open && !admin) {
    return (
      <>
        <PageHeader eyebrow="Code Hub" title="Code Hub" description="Ready-made combos with SportyBet codes." />
        <Container className="py-10 sm:py-14">
          <WaitlistWall email={entitlement.email} joined={await onWaitlist(entitlement.userId)} />
        </Container>
      </>
    );
  }

  const [today, running, past, live] = await Promise.all([todayHub(), runningHub(), pastHub(7), parsebotLive()]);
  const paid = meets(entitlement.tier, "pro");
  const now = today.now;
  // Today's codes, then earlier four-day codes whose games are still on.
  const all = [...today.codes, ...running];
  const scores = await finishedScores([...new Set(all.flatMap((c) => c.legs.map((l) => l.matchId)))]);
  // A code leaves the board the moment a leg misses: there is nothing left to
  // follow. It moves straight into the record below, so it is never hidden.
  const missed = (c: (typeof all)[number]) =>
    hubStatus(c.legs.map((l) => hubLegResult(l, scores[l.matchId])), c.firstKickoff, now) === "lost";
  const codes = all.filter((c) => !missed(c));
  const record = withMissed(past.days, all.filter(missed));

  return (
    <>
      <PageHeader
        eyebrow="Code Hub"
        title="Today's codes"
        description="Ready-made codes from 2 to 20 odds, each with a SportyBet code."
        actions={
          !open ? (
            <Badge tone="amber">Admin view: visitors see the waitlist</Badge>
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
          {codes.length === 0 ? (
            <EmptyState
              icon="⏱"
              title="No codes left for today"
              description={
                all.length > 0
                  ? "Today's codes have settled; see how they finished below. Tomorrow's codes go up after midnight."
                  : "Today's games have started or there were too few strong reads to build from. Tomorrow's codes go up after midnight."
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

        <PastCodes days={record} scores={{ ...past.scores, ...scores }} now={now} />

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

async function onWaitlist(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { count } = await supabaseAdmin()
      .from("code_hub_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
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

/** The record with today's missed codes added at the top of their day. */
function withMissed<C extends { day: string }>(days: { day: string; codes: C[] }[], missed: C[]): { day: string; codes: C[] }[] {
  const out = days.map((d) => ({ ...d, codes: [...d.codes] }));
  for (const c of missed) {
    const hit = out.find((d) => d.day === c.day);
    if (hit) hit.codes.unshift(c);
    else out.push({ day: c.day, codes: [c] });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}

function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
