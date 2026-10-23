import type { Metadata } from "next";
import Link from "next/link";
import { sportPath } from "@/lib/routes";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { HubCard } from "@/components/code-hub/hub-card";
import { getEntitlement, meets } from "@/lib/entitlements";
import { finishedScores, runningHub, todayHub } from "@/lib/code-hub-feed";
import { codeState, hubAccess, hubLegResult, hubStatus } from "@/lib/code-hub";
import { GENERATOR_ALLOWANCE } from "@/lib/code-hub-plans";
import { checkAdmin } from "@/lib/admin";
import { switchOn } from "@/lib/switches";
import { bookingAvailable } from "@/lib/odds/booking-code";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { WaitlistWall } from "@/components/code-hub/waitlist-wall";
import { CodeEditor } from "@/components/code-hub/code-editor";
import { CommunityCodes } from "@/components/code-hub/community-codes";
import { communityPosts } from "@/lib/code-hub-posts";

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
  // through it, and so does every Vercel preview build, so the real page can
  // be checked (and screenshotted) before launch.
  const preview = process.env.VERCEL_ENV === "preview";
  if (!open && !admin && !preview) {
    return (
      <>
        <PageHeader eyebrow="Code Hub" title="Code Hub" description="Ready-made combos with SportyBet codes." />
        <Container className="py-10 sm:py-14">
          <WaitlistWall email={entitlement.email} joined={await onWaitlist(entitlement.userId)} />
        </Container>
      </>
    );
  }

  const [today, running, live, community] = await Promise.all([todayHub(), runningHub(), bookingAvailable(), communityPosts()]);
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

  return (
    <>
      <PageHeader
        eyebrow="Code Hub"
        title="Today's codes"
        description="Ready-made codes from 2 to 20 odds, each with a SportyBet code."
        actions={
          !open ? (
            <Badge tone="amber">{admin ? "Admin view" : "Preview"}: visitors see the waitlist until launch</Badge>
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
                  ? "Today's codes are under way or settled. Tomorrow's codes go up after midnight."
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

        <CodeEditor signedIn={entitlement.signedIn || preview} />

        <CommunityCodes initial={community.open} recent={community.recent} signedIn={entitlement.signedIn} />

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
