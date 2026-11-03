import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Crest } from "@/components/ui/crest";
import { containerClass } from "@/components/ui/container";
import { MatchTabs, type MatchTab } from "@/components/match/match-tabs";
import { JsonLd } from "@/components/seo/json-ld";
import { RatingChip } from "@/components/match/lineup-pitch";
import {
  EmptyCard,
  GameLog,
  HitRatesPanel,
  money,
  NextMatchCard,
  ProfilePanel,
  RatingStrip,
  SeasonTiles,
  ShotsPanel,
  StatsPanel,
} from "@/components/player/player-sections";
import { parsePlayerSegment, playerPage, playerSlug } from "@/lib/player-page";
import { GROUP_LABEL } from "@/lib/player-page-core";
import { playerPath, teamPath } from "@/lib/routes";
import { SITE_URL as SITE } from "@/lib/site-url";

/*
 * Public facts about a player, the same for every visitor: cached as ISR for
 * half an hour and rendered on first visit. No loading.tsx and no cookie read,
 * so a bad id is a real 404 and a stale name a real 308.
 */
export const revalidate = 1800;

export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ id: string }>;

async function load(segment: string) {
  const parsed = parsePlayerSegment(segment);
  if (!parsed) notFound();
  const page = await playerPage(parsed.id).catch(() => null);
  if (!page) notFound();
  if (parsed.slug !== playerSlug(page.player.name)) permanentRedirect(playerPath(page.player.id, page.player.name));
  return page;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const parsed = parsePlayerSegment(id);
  const page = parsed ? await playerPage(parsed.id).catch(() => null) : null;
  if (!page) return { title: "Player not found" };
  const p = page.player;
  const club = p.team?.name ?? p.teamName;
  const title = `${p.name}: stats, form and game log`;
  return {
    title,
    description:
      `${p.name}${club ? ` (${club})` : ""}: every game this season with minutes, rating, goals, assists, shots, ` +
      `tackles and passes; per-90 stats, percentiles against players in the same position, shot map and recent form.`,
    alternates: { canonical: playerPath(p.id, p.name) },
    openGraph: { title, type: "profile" },
  };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { id } = await params;
  const page = await load(id);
  const p = page.player;
  const keeper = p.group === "keeper";
  const all = page.season.find((l) => l.leagueCode === "all");
  const club = p.team?.name ?? p.teamName;

  const tabs: MatchTab[] = [
    {
      key: "overview",
      label: "Overview",
      panel: (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {page.next && <NextMatchCard next={page.next} teamName={club} />}
            <SeasonTiles line={all} keeper={keeper} />
            <RatingStrip games={page.games} />
          </div>
          <aside className="min-w-0 space-y-4">
            {p.injury && (
              <section className="card border-rose/30 bg-rose/[0.05] p-4 text-sm">
                <span className="font-semibold">Injured{p.injury.name ? `: ${p.injury.name}` : ""}.</span>{" "}
                {p.injury.expectedReturn && <span className="text-ink-muted">Expected back: {p.injury.expectedReturn}</span>}
              </section>
            )}
            <HitRatesPanel rates={page.hitRates} compact />
          </aside>
        </div>
      ),
    },
    { key: "games", label: "Game log", short: "Games", panel: <GameLog games={page.games} keeper={keeper} /> },
    { key: "stats", label: "Stats", panel: <StatsPanel page={page} /> },
    ...(page.shots.length > 0 ? [{ key: "shots", label: "Shots", panel: <ShotsPanel shots={page.shots} name={p.name} /> }] : []),
    { key: "lines", label: "Lines cleared", short: "Lines", panel: <HitRatesPanel rates={page.hitRates} /> },
    { key: "profile", label: "Profile", panel: <ProfilePanel player={p} /> },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${SITE}${playerPath(p.id, p.name)}#player`,
        name: p.name,
        url: `${SITE}${playerPath(p.id, p.name)}`,
        ...(p.birthDate ? { birthDate: p.birthDate } : {}),
        ...(p.country ? { nationality: { "@type": "Country", name: p.country } } : {}),
        ...(p.height ? { height: { "@type": "QuantitativeValue", value: p.height, unitCode: "CMT" } } : {}),
        ...(p.team ? { memberOf: { "@type": "SportsTeam", name: p.team.name, url: `${SITE}${teamPath(p.team.id, p.team.name)}` } } : {}),
      },
    ],
  };

  const chips: [string, string][] = [
    ...(p.positionShort || p.group ? [["Position", p.positionShort ?? GROUP_LABEL[p.group!]] as [string, string]] : []),
    ...(p.age ? [["Age", String(p.age)] as [string, string]] : []),
    ...(p.country ? [["Country", p.country] as [string, string]] : []),
    ...(money(p.marketValue) ? [["Value", money(p.marketValue)!] as [string, string]] : []),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_70%)]" />
        <div className={`${containerClass()} relative py-6 sm:py-9`}>
          <div className="stagger mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="relative grid size-20 shrink-0 place-items-center rounded-2xl border border-line bg-surface font-display text-2xl font-bold text-ink shadow-[0_8px_30px_rgb(0_0_0/0.25)] sm:size-24 sm:text-3xl" aria-hidden>
                {p.initials}
                {p.shirt !== null && (
                  <span className="tnum absolute -bottom-2 -right-2 rounded-lg border border-line bg-brand px-1.5 py-0.5 font-mono text-xs font-bold text-brand-ink">#{p.shirt}</span>
                )}
              </span>
              <div className="min-w-0">
                {club && (
                  <p className="text-xs font-medium text-ink-muted sm:text-sm">
                    {p.team ? (
                      <Link href={teamPath(p.team.id, p.team.name)} className="inline-flex items-center gap-1.5 hover:text-brand">
                        <Crest src={p.team.crest ?? undefined} name={p.team.name} size={16} />
                        {p.team.name}
                      </Link>
                    ) : (
                      club
                    )}
                    {p.onLoan && <span className="ml-1.5 text-ink-dim">(on loan)</span>}
                  </p>
                )}
                <h1 className="mt-1 font-display text-2xl font-bold leading-tight sm:text-4xl">{p.name}</h1>
                {p.position && <p className="mt-1.5 text-xs text-ink-dim sm:text-sm">{p.position}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              {chips.map(([label, value]) => (
                <HeroStat key={label} label={label}>
                  <span className="text-sm font-semibold">{value}</span>
                </HeroStat>
              ))}
              {all?.rating != null && (
                <HeroStat label="Rating">
                  <RatingChip rating={all.rating} />
                </HeroStat>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className={`${containerClass()} pb-10 sm:pb-14`}>
        <div className="mx-auto max-w-5xl">
          {page.games.length === 0 && !p.hasProfile ? (
            <div className="pt-6">
              <EmptyCard text="We don't have games for this player yet." />
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
