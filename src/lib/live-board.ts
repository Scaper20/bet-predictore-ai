/**
 * Organises the live feed for the Live page: one group per competition,
 * catalogued leagues first in their usual order, everything else after.
 *
 * Pure so the board and its tests agree on the order.
 */

import type { Match } from "@/lib/types";
import { leagueByCode, leagueByProviderName } from "@/lib/leagues";

export interface LiveGroup {
  key: string;
  name: string;
  /** For the jump chips — the catalogue's short name where there is one. */
  shortName: string;
  country?: string;
  logo?: string;
  flag?: string;
  /** One of the competitions BetriX models (lib/leagues.ts). */
  tracked: boolean;
  rank: number;
  matches: Match[];
}

function catalogued(m: Match) {
  return (m.league.code ? leagueByCode(m.league.code) : undefined) ?? leagueByProviderName(m.league.name);
}

/** Minutes played, for ordering: half-time sits at 45, an unknown clock at the start. */
function clock(m: Match): number {
  if (m.status === "halftime") return 45;
  return m.minute ?? 0;
}

export function groupLiveMatches(matches: Match[]): LiveGroup[] {
  const groups = new Map<string, LiveGroup>();
  for (const m of matches) {
    const def = catalogued(m);
    const key = def ? def.code : `${m.league.id}|${m.league.name}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: def?.name ?? m.league.name,
        shortName: def?.shortName ?? m.league.name,
        country: def?.country ?? m.league.country,
        logo: m.league.logo,
        flag: def?.flag,
        tracked: Boolean(def),
        rank: def?.rank ?? Number.POSITIVE_INFINITY,
        matches: [],
      };
      groups.set(key, group);
    }
    group.logo ??= m.league.logo;
    group.matches.push(m);
  }

  for (const g of groups.values()) {
    // Furthest-on first, so the games about to finish lead each group.
    g.matches.sort((a, b) => clock(b) - clock(a) || a.home.name.localeCompare(b.home.name));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
    if (a.tracked) return a.rank - b.rank;
    return b.matches.length - a.matches.length || a.name.localeCompare(b.name);
  });
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Narrows the groups to matches whose teams or competition contain the query. */
export function searchLiveGroups(groups: LiveGroup[], query: string): LiveGroup[] {
  const q = normalise(query.trim());
  if (!q) return groups;
  return groups.flatMap((g) => {
    if (normalise(`${g.name} ${g.country ?? ""}`).includes(q)) return [g];
    const matches = g.matches.filter((m) =>
      normalise(`${m.home.name} ${m.away.name} ${m.home.shortName} ${m.away.shortName}`).includes(q),
    );
    return matches.length ? [{ ...g, matches }] : [];
  });
}

/** How far through the 90 a game is, 0–1, for the little progress line under the clock. */
export function matchProgress(m: Match): number {
  if (m.status === "halftime") return 0.5;
  if (!m.minute) return 0;
  return Math.min(1, m.minute / 90);
}
