import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Crest } from "@/components/ui/crest";
import { containerClass } from "@/components/ui/container";
import { FormPips } from "@/components/stats/form-pips";
import { RatingDial } from "@/components/stats/rating-dial";
import { LeagueTable } from "@/components/stats/league-table";
import { MatchTabs, type MatchTab } from "@/components/match/match-tabs";
import { JsonLd } from "@/components/seo/json-ld";
import {
  ClubPanel,
  EmptyCard,
  FixtureList,
  FormCard,
  InjuriesCard,
  LeadersPanel,
  NextMatchCard,
  SquadPanel,
  ordinal,
} from "@/components/team/team-sections";
import { parseTeamSegment, teamBySlug, teamPage, teamSlug } from "@/lib/team-page";
import { teamJsonLd } from "@/lib/seo/team-jsonld";
import { sportPath, teamPath } from "@/lib/routes";
import { SITE_URL as SITE } from "@/lib/site-url";
import { topBy } from "@/lib/team-page-core";

/*
 * Public facts about a club, the same for every visitor: cached as ISR for
 * half an hour (the data under it changes a few times a day at most), with
 * no cookie read, so the page stays static between regenerations.
 */
export const revalidate = 1800;

type Params = Promise<{ id: string }>;

async function load(segment: string) {
  const parsed = parseTeamSegment(segment);
  if (!parsed) notFound();
  const page = await teamPage(parsed.id).catch(() => null);
  if (!page) {
    // A club merged into another keeps working links: find it again by name.
    const again = parsed.slug ? await teamBySlug(parsed.slug) : null;
    if (again) permanentRedirect(teamPath(again.id, again.name));
    notFound();
  }
  if (parsed.slug !== teamSlug(page.team.name)) permanentRedirect(teamPath(page.team.id, page.team.name));
  return page;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const parsed = parseTeamSegment(id);
  const page = parsed ? await teamPage(parsed.id).catch(() => null) : null;
  if (!page) return { title: "Club not found" };
  const name = page.team.name;
  const where = page.league ? ` in the ${page.league.name}` : "";
  const title = `${name}: fixtures, form, squad and stats`;
  return {
    title,
    description:
      `${name}${where}: next match and prediction, last results and form, ` +
      `${page.profile ? "squad, injuries, season leaders, transfers and honours" : "goals and league position"}.`,
    alternates: { canonical: teamPath(page.team.id, name) },
    openGraph: { title, type: "website" },
  };
}

export default async function TeamPage({ params }: { params: Params }) {
  const { id } = await params;
  const page = await load(id);
  const { team, league, form, goals, results, upcoming, table, position, rating, profile, leaders } = page;
  const next = upcoming[0] ?? null;
  const topScorer = topBy(leaders, (l) => l.goals, 1)[0] ?? null;

  const tabs: MatchTab[] = [
    {
      key: "overview",
      label: "Overview",
      panel: (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {next && <NextMatchCard next={next} teamName={team.name} />}
            {form && <FormCard form={form} goals={goals} />}
            <FixtureList title="Last results" fixtures={results.slice(0, 5)} empty="No finished games yet." results />
          </div>
          <aside className="min-w-0 space-y-4">
            {table && (
              <section className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                  <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{league?.name ?? "Table"}</h2>
                  <Link href={`${sportPath("tables")}?league=${league?.code ?? ""}`} className="text-xs font-medium text-brand hover:underline">
                    Full table →
                  </Link>
                </div>
                <LeagueTable initial={table} highlight={[team.id]} compact />
              </section>
            )}
            {profile && <InjuriesCard injured={profile.injured} />}
          </aside>
        </div>
      ),
    },
    {
      key: "fixtures",
      label: "Fixtures & results",
      short: "Fixtures",
      panel: (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <FixtureList title="Coming up" fixtures={upcoming} empty="No games scheduled yet." />
          <FixtureList title="Results" fixtures={results} empty="No finished games yet." results />
        </div>
      ),
    },
    ...(profile ? [{ key: "squad", label: "Squad", panel: <SquadPanel profile={profile} /> }] : []),
    { key: "stats", label: "Player stats", short: "Players", panel: <LeadersPanel leaders={leaders} /> },
    ...(profile ? [{ key: "club", label: "Club", panel: <ClubPanel profile={profile} /> }] : []),
  ];

  return (
    <>
      <JsonLd data={teamJsonLd(team, { league: league?.name, coach: profile?.coach, venue: profile?.venue, city: profile?.city }, SITE)} />
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_70%)]" />
        <div className={`${containerClass()} relative py-6 sm:py-9`}>
          <div className="stagger mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="inline-flex shrink-0 rounded-2xl border border-line bg-surface p-3 shadow-[0_8px_30px_rgb(0_0_0/0.25)]">
                <Crest src={team.crest} name={team.name} size={64} />
              </span>
              <div className="min-w-0">
                {league && (
                  <p className="text-xs font-medium text-ink-muted sm:text-sm">
                    {league.name}
                    {position && <span className="text-ink"> · {ordinal(position)}</span>}
                  </p>
                )}
                <h1 className="mt-1 font-display text-2xl font-bold leading-tight sm:text-4xl">{team.name}</h1>
                {(profile?.coach || profile?.venue) && (
                  <p className="mt-1.5 truncate text-xs text-ink-dim sm:text-sm">
                    {[profile?.coach && `Coach: ${profile.coach}`, profile?.venue].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              {form && (
                <HeroStat label="Form">
                  <FormPips letters={form.letters.slice(0, 5)} size="sm" />
                </HeroStat>
              )}
              {rating !== null && (
                <HeroStat label="Rating">
                  <RatingDial score={rating} size={34} />
                </HeroStat>
              )}
              {topScorer && (
                <HeroStat label="Top scorer">
                  <span className="max-w-32 truncate text-sm font-semibold">
                    {topScorer.name.split(" ").slice(-1)[0]} <span className="tnum font-mono text-brand">{topScorer.goals}</span>
                  </span>
                </HeroStat>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className={`${containerClass()} pb-10 sm:pb-14`}>
        <div className="mx-auto max-w-5xl">
          {results.length === 0 && upcoming.length === 0 && !profile ? (
            <div className="pt-6">
              <EmptyCard text="We don't have games for this club yet." />
            </div>
          ) : (
            <MatchTabs tabs={tabs} />
          )}
        </div>
      </div>
    </>
  );
}

function HeroStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-1 rounded-xl border border-line bg-surface/70 px-3.5 py-2 backdrop-blur">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-dim">{label}</span>
      {children}
    </div>
  );
}
