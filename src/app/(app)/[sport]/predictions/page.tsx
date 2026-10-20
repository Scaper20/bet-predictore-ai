import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { ProLeaguesBanner } from "@/components/entitlements/pro-league-lock";
import { isProLeague } from "@/lib/pro-leagues";
import { PickList } from "@/components/match/pick-list";
import type { RiskLevel } from "@/lib/model/risk";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { getPreferences } from "@/lib/preferences";
import { leagueByCode } from "@/lib/leagues";
import { FixtureRow } from "@/components/match/fixture-row";
import { containerClass } from "@/components/ui/container";
import { sportPath, scoresPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import { LiveScoresProvider } from "@/components/match/pick-action";
import { loadPicks, parsePickQuery } from "@/lib/pick-feed";
import { PICK_BATCH } from "@/lib/pick-list";
import { ProductIcon } from "@/components/icons/product-icon";

/**
 * One title per league view. Without this every ?league= variant shared the
 * same title and description, so to a search engine they were duplicates of
 * the unfiltered page instead of "AFCON predictions", "NPFL predictions"...
 * An unknown league param canonicalises back to the unfiltered page.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}): Promise<Metadata> {
  const { league } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;
  const base = sportPath("predictions");
  if (!def) {
    return {
      title: "Today's Football Predictions",
      description:
        "Football predictions fitted on real completed matches: match result, over/under, both teams to score and " +
        "correct score probabilities with the sample size behind every number.",
      alternates: { canonical: base },
    };
  }
  return {
    title: `${def.name} Predictions Today`,
    description:
      `${def.name} predictions from a statistical model fitted on real results: win, draw, ` +
      `over/under 2.5, both teams to score and correct score probabilities, with the sample size behind each.`,
    alternates: { canonical: `${base}?league=${def.code}` },
  };
}

export const revalidate = 300;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; tier?: string; risk?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const q = parsePickQuery(params);
  /*
   * Followed competitions float to the top of each day on the unfiltered
   * view, so the leagues someone picked at sign-up visibly change what they
   * see. A re-ordering, not a filter. getPreferences() reads cookies, which
   * makes this route dynamic; the in-memory provider and prediction caches
   * are what keep the feeds safe.
   */
  const preferences = await getPreferences();
  const { def, feed, predictions, rows, withheld, bestBet, counts, proHeld, paid } = await loadPicks(
    { ...q, followed: preferences.leagues },
    { withBest: true },
  );
  const { strongOnly, risk, byChance } = q;
  const league = def?.code;
  // The query the list sends back for each next batch, so its offsets line up.
  const query = new URLSearchParams(
    Object.entries({ league, tier: strongOnly ? "strong" : undefined, risk, sort: byChance ? "chance" : undefined }).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  ).toString();

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title={def ? `${def.name} picks` : "Picks"}
        description="Data insights from analysed football matches."
      />

      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter proTags={!paid} counts={counts} />
        </Suspense>

        {!paid && def && isProLeague(def.code) ? (
          <ProLeaguesBanner league={{ code: def.code, name: def.name }} held={proHeld} />
        ) : !paid && proHeld > 0 ? (
          <ProLeaguesBanner held={proHeld} />
        ) : null}

        <PickFilters strongOnly={strongOnly} risk={risk} byChance={byChance} league={league} />

        {feed && <CoverageNotice coverage={feed.coverage} />}

        {bestBet?.topPick && (!strongOnly || isStrong(bestBet.topPick, bestBet.match.league.code)) && (
          <LiveScoresProvider matches={[{ id: bestBet.match.id, kickoff: bestBet.match.kickoff, status: bestBet.match.status }]}>
            <BestBetOfDay prediction={bestBet} />
          </LiveScoresProvider>
        )}

        {predictions.length === 0 ? (
          <EmptyState
            icon={<ProductIcon name="calendar" className="size-6" />}
            title="No fixtures to model right now"
            description="Check back when the next fixtures are out."
            action={<ButtonLink href={scoresPath("fixtures")} variant="secondary">Browse fixtures</ButtonLink>}
          />
        ) : (
          <>
            {(strongOnly || risk) && rows.length === 0 && (
              <EmptyState
                icon={<ProductIcon name={strongOnly ? "star" : "scale"} className="size-6" />}
                title={strongOnly ? "No Strong picks right now" : `No ${risk} risk picks right now`}
                description={strongOnly ? "Strong picks are our most confident. Some days there are none." : "Try another risk level or all picks."}
              />
            )}
            {/* Keyed on the filters, so a new filter starts a fresh list. */}
            <PickList key={query} initial={rows.slice(0, PICK_BATCH)} total={rows.length} query={query} />

            {!strongOnly && !risk && withheld.length > 0 && (
              <details className="card group overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
                  <Badge tone="amber">{withheld.length}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">Not enough history to call</span>
                    <span className="block text-xs text-ink-dim">Real fixtures in competitions too new to the model to stand a pick on.</span>
                  </span>
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-dim transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {withheld.slice(0, 60).map((p) => (
                    <li key={p.match.id}>
                      <FixtureRow match={p.match} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * Which picks and in what order: all or Strong only, one risk level, and
 * kick-off order or highest chance first. All in the URL, so a filtered view
 * can be shared and the page stays server-rendered.
 */
function PickFilters({
  strongOnly,
  risk,
  byChance,
  league,
}: {
  strongOnly: boolean;
  risk?: RiskLevel;
  byChance: boolean;
  league?: string;
}) {
  const href = (next: { strong?: boolean; risk?: RiskLevel | null; chance?: boolean }) => {
    const q = new URLSearchParams();
    if (league) q.set("league", league);
    const strong = next.strong ?? strongOnly;
    const r = next.risk === undefined ? risk : next.risk;
    const c = next.chance ?? byChance;
    if (strong) q.set("tier", "strong");
    if (r) q.set("risk", r);
    if (c) q.set("sort", "chance");
    const qs = q.toString();
    return `${sportPath("predictions")}${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
      active ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:text-ink"
    }`;
  const dot = { low: "bg-brand", medium: "bg-amber", high: "bg-rose" } as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Which picks" className="flex flex-wrap items-center gap-2">
        <Link href={href({ strong: false, risk: null })} className={chip(!strongOnly && !risk)} aria-current={!strongOnly && !risk ? "page" : undefined}>
          All picks
        </Link>
        <Link href={href({ strong: !strongOnly })} className={chip(strongOnly)} aria-current={strongOnly ? "page" : undefined}>
          <span className="text-amber" aria-hidden>★</span> Strong
        </Link>
        {(["low", "medium", "high"] as const).map((r) => (
          <Link key={r} href={href({ risk: risk === r ? null : r })} className={chip(risk === r)} aria-current={risk === r ? "page" : undefined}>
            <span className={`size-1.5 rounded-full ${dot[r]}`} aria-hidden />
            {r === "low" ? "Low risk" : r === "medium" ? "Medium" : "High"}
          </Link>
        ))}
      </nav>
      <nav aria-label="Order" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
        <Link href={href({ chance: false })} className={`rounded-md px-3 py-1.5 ${!byChance ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>
          Kick-off
        </Link>
        <Link href={href({ chance: true })} className={`rounded-md px-3 py-1.5 ${byChance ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>
          Best chance
        </Link>
      </nav>
    </div>
  );
}
