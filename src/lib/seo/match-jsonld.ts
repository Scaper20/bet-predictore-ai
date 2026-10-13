import { matchPath, sportPath } from "@/lib/routes";
import { percent } from "@/lib/format";
import type { Match, MatchStatus } from "@/lib/types";

/** Roughly how long a football match runs, kickoff to the final whistle. Google
 * asks for an end time on every event and the feeds do not give one. */
const MATCH_LENGTH_MS = 2 * 60 * 60 * 1000;

const EVENT_STATUS: Record<MatchStatus, string> = {
  scheduled: "https://schema.org/EventScheduled",
  live: "https://schema.org/EventScheduled",
  halftime: "https://schema.org/EventScheduled",
  finished: "https://schema.org/EventScheduled",
  postponed: "https://schema.org/EventPostponed",
  cancelled: "https://schema.org/EventCancelled",
};

interface Probabilities {
  home: number;
  draw: number;
  away: number;
}

/**
 * Structured data for a match page: a SportsEvent plus the breadcrumb trail.
 *
 * Google needs a start date and a place for every event, and it reads each
 * SportsEvent node as its own event. So the league is the organizer here and
 * never a second SportsEvent: that stub had no date or place and showed up in
 * Search Console as invalid. When the feed gives no venue the event is left
 * out and only the breadcrumb is published, since a made-up place would be
 * wrong for neutral-ground and cup games.
 *
 * There are deliberately no `offers`: the page sells no tickets.
 */
export function matchJsonLd(match: Match, markets: Probabilities, site: string) {
  const url = `${site}${matchPath(match.id)}`;
  const predictionsUrl = `${site}${sportPath("predictions")}`;
  const venue = match.venue?.trim();
  const kickoff = Date.parse(match.kickoff);
  const home = { "@type": "SportsTeam", name: match.home.name };
  const away = { "@type": "SportsTeam", name: match.away.name };

  const event =
    venue && Number.isFinite(kickoff)
      ? {
          "@type": "SportsEvent",
          name: `${match.home.name} vs ${match.away.name}`,
          // The canonical sport-scoped URL: /match/:id is a 308 to it, and
          // structured data should never point at a redirect.
          url,
          startDate: new Date(kickoff).toISOString(),
          endDate: new Date(kickoff + MATCH_LENGTH_MS).toISOString(),
          eventStatus: EVENT_STATUS[match.status],
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          sport: "Football",
          description:
            `${match.league.name}: ${match.home.name} vs ${match.away.name}. Model probabilities ` +
            `${percent(markets.home)} home win, ${percent(markets.draw)} draw, ${percent(markets.away)} away win.`,
          image: `${site}/brand/og.png`,
          location: {
            "@type": "Place",
            name: venue,
            ...(match.league.country
              ? { address: { "@type": "PostalAddress", addressCountry: match.league.country } }
              : {}),
          },
          organizer: { "@type": "SportsOrganization", name: match.league.name },
          homeTeam: home,
          awayTeam: away,
          competitor: [home, away],
          performer: [home, away],
        }
      : null;

  return {
    "@context": "https://schema.org",
    "@graph": [
      ...(event ? [event] : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: site },
          { "@type": "ListItem", position: 2, name: "Predictions", item: predictionsUrl },
          ...(match.league.code
            ? [{
                "@type": "ListItem",
                position: 3,
                name: match.league.name,
                item: `${predictionsUrl}?league=${match.league.code}`,
              }]
            : []),
          {
            "@type": "ListItem",
            position: match.league.code ? 4 : 3,
            name: `${match.home.name} vs ${match.away.name}`,
            item: url,
          },
        ],
      },
    ],
  };
}
