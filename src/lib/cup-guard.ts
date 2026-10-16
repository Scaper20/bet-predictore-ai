/**
 * The UEFA cups host guard: no published pick on the host's side when a
 * club from outside the five biggest leagues hosts one from inside them.
 *
 * The cup model rates clubs on their European games alone, so a host from a
 * league we do not carry (Austria, Poland, Norway) looks far stronger than it
 * is against a big-league visitor. Walk-forward over the last 12 months of
 * UEFA cup games (scripts/cups-lab.ts), the model gave such hosts 69.9% to
 * win or draw and they managed 53.8%; picks on the host's side landed 46.7%.
 * With the guard (and unders paused) the published pick in those games landed
 * 78.4%, and 76.9% across every cup game against 74.6% before. It would have
 * stopped Salzburg or draw (lost 0-4 to Milan) and Lech or draw (lost 0-4 to
 * Leverkusen), both October 2026.
 *
 * A club counts as top-five when its name matches a club in the last 400 days
 * of those leagues' results. Cup fixtures use TheSportsDB's spellings and the
 * league archive football-data.co.uk's, so names match exactly, by containment
 * for keys of six letters or more ("leverkusen" in "bayerleverkusen"), or
 * through ALIASES. Short names match exactly only, so "Inter" never claims
 * Inter Club d'Escaldes.
 */

import { normaliseKey } from "@/lib/model/fit";
import type { ResultRow } from "@/lib/types";

export const UEFA_CUP_CODES = ["champions-league", "europa-league", "conference-league"] as const;
export const TOP_FIVE_LEAGUES = ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"] as const;

/** Cup spelling -> league-archive spelling, where neither holds the other. */
const ALIASES: Record<string, string> = {
  "Atlético Madrid": "Ath Madrid",
  "Atletico Madrid": "Ath Madrid",
  "Athletic Bilbao": "Ath Bilbao",
  "Athletic Club": "Ath Bilbao",
  "Eintracht Frankfurt": "Ein Frankfurt",
  "Borussia Mönchengladbach": "M'gladbach",
  "Borussia Monchengladbach": "M'gladbach",
  "Paris Saint-Germain": "Paris SG",
  "Inter Milan": "Inter",
  Internazionale: "Inter",
  "Nottingham Forest": "Nott'm Forest",
  "Celta Vigo": "Celta",
  "Real Betis": "Betis",
  "Mainz 05": "Mainz",
  "1. FSV Mainz 05": "Mainz",
  Espanyol: "Espanol",
  "Bayern München": "Bayern Munich",
  "1. FC Köln": "FC Koln",
  "Union Berlin": "Union Berlin",
};

const MIN_CONTAIN = 6;

/** Normalised names of every club in the given league results. */
export function clubKeys(rows: ResultRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(normaliseKey(r.homeName));
    keys.add(normaliseKey(r.awayName));
  }
  return keys;
}

export function inLeagues(name: string, keys: ReadonlySet<string>): boolean {
  const alias = ALIASES[name];
  if (alias && keys.has(normaliseKey(alias))) return true;
  const k = normaliseKey(name);
  if (keys.has(k)) return true;
  if (k.length < MIN_CONTAIN) return false;
  for (const d of keys) {
    if (d.length >= MIN_CONTAIN && (k.includes(d) || d.includes(k))) return true;
  }
  return false;
}

/** Selections that need the host to win or avoid defeat. */
export const HOST_SIDE_MARKETS = ["1x2:home", "dc:home-draw"] as const;

/**
 * The selections to bar from a cup fixture's headline pick, or none. Every
 * name a club goes by may be passed (the fixture's and the training's).
 */
export function hostGuard(
  leagueCode: string | undefined,
  home: string[],
  away: string[],
  topFive: ReadonlySet<string> | undefined,
): string[] {
  if (!leagueCode || !topFive || !(UEFA_CUP_CODES as readonly string[]).includes(leagueCode)) return [];
  const hostTop = home.some((n) => inLeagues(n, topFive));
  const visitorTop = away.some((n) => inLeagues(n, topFive));
  return !hostTop && visitorTop ? [...HOST_SIDE_MARKETS] : [];
}
