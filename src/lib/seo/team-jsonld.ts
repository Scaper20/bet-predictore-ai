import { sportPath, teamPath } from "@/lib/routes";

/**
 * Structured data for a club page: a SportsTeam (name, sport, league, coach,
 * home ground when we know it) and the breadcrumb trail. Only facts we hold;
 * nothing is invented to fill a field.
 */
export function teamJsonLd(
  team: { id: string; name: string; crest?: string },
  extra: { league?: string | null; coach?: string | null; venue?: string | null; city?: string | null },
  site: string,
) {
  const url = `${site}${teamPath(team.id, team.name)}`;
  const node: Record<string, unknown> = {
    "@type": "SportsTeam",
    "@id": `${url}#team`,
    name: team.name,
    sport: "Soccer",
    url,
  };
  if (team.crest && /^https:\/\//.test(team.crest)) node.logo = team.crest;
  if (extra.league) node.memberOf = { "@type": "SportsOrganization", name: extra.league };
  if (extra.coach) node.coach = { "@type": "Person", name: extra.coach };
  if (extra.venue) {
    node.location = {
      "@type": "StadiumOrArena",
      name: extra.venue,
      ...(extra.city ? { address: { "@type": "PostalAddress", addressLocality: extra.city } } : {}),
    };
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      node,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Football", item: `${site}${sportPath("predictions")}` },
          { "@type": "ListItem", position: 2, name: "Team form", item: `${site}${sportPath("teamForm")}` },
          { "@type": "ListItem", position: 3, name: team.name, item: url },
        ],
      },
    ],
  };
}
