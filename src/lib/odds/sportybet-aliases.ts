import { normaliseKey } from "@/lib/model/fit";

/**
 * Names the feeds and SportyBet spell so differently that no rule could
 * safely join them: an acronym, a nickname, a city in another language.
 *
 * Each group is one club. These only seed the matcher; once a club has been
 * matched once, its Sportradar competitor id takes over and its name is never
 * compared again (sportybet-match.ts). So this list only needs the clubs whose
 * first match would otherwise fail, not every club SportyBet abbreviates.
 */
const GROUPS: readonly (readonly string[])[] = [
  ["Paris Saint-Germain", "PSG", "Paris SG", "Paris Saint Germain"],
  ["Bayern Munich", "Bayern München", "Bayern Munchen", "FC Bayern München"],
  ["Tottenham Hotspur", "Tottenham", "Spurs"],
  ["Nottingham Forest", "Nott'm Forest", "Nottm Forest"],
  ["Wolverhampton Wanderers", "Wolves", "Wolverhampton"],
  ["Brighton & Hove Albion", "Brighton", "Brighton and Hove Albion"],
  ["West Ham United", "West Ham"],
  ["Sheffield United", "Sheffield Utd"],
  ["Sheffield Wednesday", "Sheffield Wed"],
  ["Queens Park Rangers", "QPR"],
  ["West Bromwich Albion", "West Brom", "WBA"],
  ["Internazionale", "Inter", "Inter Milan", "Inter Milano"],
  ["AC Milan", "Milan"],
  ["Hellas Verona", "Verona"],
  ["Borussia Mönchengladbach", "Gladbach", "Borussia M'gladbach", "B. Monchengladbach", "Monchengladbach"],
  ["Borussia Dortmund", "Dortmund", "BVB"],
  ["Bayer Leverkusen", "Leverkusen", "Bayer 04 Leverkusen"],
  ["RB Leipzig", "Leipzig", "RasenBallsport Leipzig"],
  ["Eintracht Frankfurt", "Frankfurt"],
  ["1. FC Köln", "FC Koln", "Cologne", "Koln", "1. FC Koeln"],
  ["Atlético Madrid", "Atletico Madrid", "Atl. Madrid", "Atletico de Madrid", "Atleti"],
  ["Athletic Club", "Athletic Bilbao", "Ath Bilbao"],
  ["Real Betis", "Betis"],
  ["Real Sociedad", "Sociedad"],
  ["Olympique de Marseille", "Marseille", "Olympique Marseille", "OM"],
  ["Olympique Lyonnais", "Lyon", "Olympique Lyon", "OL"],
  ["PSV Eindhoven", "PSV"],
  ["AZ Alkmaar", "AZ"],
  ["Sporting CP", "Sporting Lisbon", "Sporting"],
];

/** normaliseKey -> every key of the same club, itself included. */
const BY_KEY: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of GROUPS) {
    const keys = [...new Set(group.map(normaliseKey).filter(Boolean))];
    for (const key of keys) map.set(key, keys);
  }
  return map;
})();

/** Every key this club is known by in the seed list, or just its own. */
export function seedKeys(name: string): readonly string[] {
  const key = normaliseKey(name);
  return BY_KEY.get(key) ?? (key ? [key] : []);
}
