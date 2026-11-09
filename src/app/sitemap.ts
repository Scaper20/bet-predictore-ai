import type { MetadataRoute } from "next";
import { LEAGUES } from "@/lib/leagues";
import { SITE_URL as SITE } from "@/lib/site-url";
import { competitionPath, matchPath, playerPath, sportPath, scoresPath, teamPath } from "@/lib/routes";
import { seasonLeaders } from "@/lib/team-page";
import type { Leader } from "@/lib/team-page-core";
import { leagueTeams, type TeamRef } from "@/lib/stats/queries";
import { upcomingFeed } from "@/lib/service";
import { publicLiveOffers } from "@/lib/offers-server";
import { offerPath } from "@/lib/offers";
import { ARTICLES } from "@/lib/guides/articles";
import { hasTablePage } from "@/lib/stats/leagues";

/**
 * Static routes, a landing page per league, and the next few days of match
 * pages.
 *
 * Match pages are where search traffic actually lands ("<home> vs <away>
 * prediction"), so they belong here — but only upcoming ones, regenerated
 * hourly, so the sitemap never advertises a fixture long gone. A feed outage
 * just drops them for that hour; the static part always renders.
 */
export const revalidate = 3600;

const MATCH_WINDOW_DAYS = 3;
/** The windows the league pages themselves show (predictions and fixtures pages). */
const PREDICTIONS_WINDOW_DAYS = 5;
const FIXTURES_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
/** Player pages listed: regulars only (this many appearances this season), so thin pages stay out. */
const PLAYER_MIN_APPS = 8;
const PLAYER_MAX = 4000;

/** Each club's season leaders, ten clubs at a time so the sitemap never fans out 200 queries at once. */
async function regulars(clubIds: string[]): Promise<Leader[]> {
  const out: Leader[] = [];
  for (let i = 0; i < clubIds.length; i += 10) {
    const batch = await Promise.all(clubIds.slice(i, i + 10).map((id) => seasonLeaders(id).catch(() => [] as Leader[])));
    for (const list of batch) for (const l of list) if (l.apps >= PLAYER_MIN_APPS) out.push(l);
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Sport-scoped URLs only. The flat paths these replaced still 308 (see
  // next.config.ts) but a sitemap should advertise the canonical URL, never
  // one that redirects. Pages whose content changes with the fixtures carry
  // today's date; evergreen pages carry none, because a lastmod that is
  // always "now" teaches Google to ignore the field for the whole sitemap.
  const core: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}${sportPath("predictions")}`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}${sportPath("live")}`, lastModified: now, changeFrequency: "always", priority: 0.8 },
    { url: `${SITE}${scoresPath("fixtures")}`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}${sportPath("trends")}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}${scoresPath("results")}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}${sportPath("tables")}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}${sportPath("h2h")}`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}${sportPath("teamForm")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("goals")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("ratings")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("props")}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/guides`, changeFrequency: "monthly", priority: 0.5 },
    ...ARTICLES.map((a) => ({ url: `${SITE}/guides/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE}/help`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}${sportPath("trackRecord")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/refunds`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/responsible-use`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Club pages: only clubs in the leagues with full match details (lineups,
  // squads, player stats), which are the pages with something to say. Bounded:
  // eight competitions, about two hundred clubs.
  const clubLeagues = LEAGUES.filter((l) => l.ids.fotMob);
  const [leagueFeed, matchFeed, liveOffers, clubLists] = await Promise.all([
    upcomingFeed(FIXTURES_WINDOW_DAYS).catch(() => null),
    upcomingFeed(MATCH_WINDOW_DAYS).catch(() => null),
    publicLiveOffers().catch(() => []),
    Promise.all(clubLeagues.map((l) => leagueTeams(l.code).catch(() => [] as TeamRef[]))),
  ]);
  const clubs = new Map<string, TeamRef>();
  for (const list of clubLists) for (const t of list) clubs.set(t.id, t);
  const teams: MetadataRoute.Sitemap = [...clubs.values()].map((t) => ({
    url: `${SITE}${teamPath(t.id, t.name)}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));
  // Player pages: regulars at those clubs (FotMob data), deduplicated, bounded.
  const seen = new Set<string>();
  const players: MetadataRoute.Sitemap = [];
  for (const l of await regulars([...clubs.keys()]).catch(() => [] as Leader[])) {
    if (seen.has(l.playerId) || players.length >= PLAYER_MAX) continue;
    seen.add(l.playerId);
    players.push({ url: `${SITE}${playerPath(l.playerId, l.name)}`, changeFrequency: "daily" as const, priority: 0.5 });
  }
  // Public offers (the day pass) only while they run; a closed one drops out within the hour.
  const offers: MetadataRoute.Sitemap = liveOffers.map((o) => ({
    url: `${SITE}${offerPath(o.slug)}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  const upcoming = (leagueFeed?.matches ?? []).filter((m) => m.league.code);
  const codesIn = (days: number) => {
    const until = now.getTime() + days * DAY_MS;
    return new Set(upcoming.filter((m) => Date.parse(m.kickoff) <= until).map((m) => m.league.code));
  };
  const withFixtures = codesIn(FIXTURES_WINDOW_DAYS);
  const withPredictions = codesIn(PREDICTIONS_WINDOW_DAYS);

  /*
   * A league's fixtures and predictions pages are only listed while they have
   * games to show. Off-season and between-tournament pages (NPFL, AFCON, the
   * World Cup in October 2026) render the same empty-state boilerplate, and
   * Google crawled those and declined to index them; listing them also spends
   * crawl budget the live leagues need. They stay reachable and indexable,
   * just not advertised. If the feed fails, no league pages are listed for
   * that hour rather than all of them. Tables always have standings to show.
   */
  const leagues: MetadataRoute.Sitemap = LEAGUES.flatMap((l) => [
    // The permanent hub is listed year-round, fixtures or not (CTO checklist 4.6).
    { url: `${SITE}${competitionPath(l.code, l.sport)}`, changeFrequency: "daily" as const, priority: 0.7 },
    // Only leagues with a table of their own: a cup's /tables URL canonicalises
    // to another league, and Search Console flags listed URLs that do.
    ...(!hasTablePage(l.code)
      ? []
      : [{
          url: `${SITE}${sportPath("tables", l.sport)}?league=${l.code}`,
          lastModified: now,
          changeFrequency: "hourly" as const,
          priority: 0.6,
        }]),
    ...(withFixtures.has(l.code)
      ? [{
          url: `${SITE}${scoresPath("fixtures", { league: l.code, sport: l.sport })}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.6,
        }]
      : []),
    ...(withPredictions.has(l.code)
      ? [{
          url: `${SITE}${sportPath("predictions", l.sport)}?league=${l.code}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.7,
        }]
      : []),
  ]);

  // Catalogued competitions only: the day-scan feeds also carry youth and
  // lower-division games nobody searches for, and a sitemap of thin pages
  // spends crawl budget the big fixtures need.
  const matches: MetadataRoute.Sitemap = (matchFeed?.matches ?? []).filter((m) => m.league.code).map((m) => ({
    url: `${SITE}${matchPath(m.id)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  // Next writes <loc> verbatim, and the scores page's URLs carry two query
  // parameters: a bare & would make the whole sitemap invalid XML.
  return [...core, ...offers, ...leagues, ...teams, ...players, ...matches].map((e) => ({ ...e, url: e.url.replace(/&/g, "&amp;") }));
}
