/**
 * The sport seam.
 *
 * Everything in this app is football today, and the model layer genuinely is
 * football: poisson.ts counts goals, fit.ts is Dixon-Coles, and Pick.group is
 * a closed union of football markets. None of that is generalised here and
 * pretending otherwise would be dishonest.
 *
 * What this descriptor buys is the layer above the model — URLs, the league
 * catalogue, the words on the page and the provider coordinates. Those are
 * where a second sport would otherwise mean touching every file, so they get
 * a seam now while there is exactly one implementation to keep honest.
 */

export type SportId = "football";

export interface SportDescriptor {
  id: SportId;
  /** Used in headings and metadata. */
  label: string;
  /** Empty states and list glyphs, so the ⚽ isn't hardcoded at call sites. */
  icon: string;
  /** "team" / "player" / "fighter" — what two of these things are called. */
  participant: string;
  participantPlural: string;
  /** "goal" / "point" / "run" — what the score counts. */
  scoreUnit: string;
  scoreUnitPlural: string;
  /**
   * Regulation length and period length in minutes. service.ts derives the
   * live clock from these rather than assuming 90 and 45.
   */
  regulationMinutes: number;
  periodMinutes: number;
  /** Whether a drawn result is possible — drives 1X2 vs two-way markets. */
  hasDraw: boolean;
  /** Whether a league table is meaningful for this sport. */
  hasStandings: boolean;
  /**
   * Provider coordinates. API-Sports runs a separate host per sport and
   * TheSportsDB filters on a sport name, so both live here rather than as
   * literals inside the adapters.
   */
  providers: {
    theSportsDb?: string;
    apiFootballHost?: string;
  };
}

export const SPORTS: SportDescriptor[] = [
  {
    id: "football",
    label: "Football",
    icon: "⚽",
    participant: "team",
    participantPlural: "teams",
    scoreUnit: "goal",
    scoreUnitPlural: "goals",
    regulationMinutes: 90,
    periodMinutes: 45,
    hasDraw: true,
    hasStandings: true,
    providers: {
      theSportsDb: "Soccer",
      apiFootballHost: "https://v3.football.api-sports.io",
    },
  },
];

/**
 * The sport a bare, unprefixed URL means, and the sport any surface that
 * cannot see the route segment assumes — the footer, for one, renders above
 * the [sport] segment and so has no param to read.
 */
export const DEFAULT_SPORT: SportId = "football";

const BY_ID = new Map(SPORTS.map((s) => [s.id, s]));

export function sportById(id: string): SportDescriptor | undefined {
  return BY_ID.get(id as SportId);
}

export function isSportId(value: string): value is SportId {
  return BY_ID.has(value as SportId);
}

/** Never returns undefined — for call sites that just need the nouns. */
export function sportOrDefault(id?: string): SportDescriptor {
  return (id ? BY_ID.get(id as SportId) : undefined) ?? BY_ID.get(DEFAULT_SPORT)!;
}
