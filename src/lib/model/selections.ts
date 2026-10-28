import { rawMarket } from "@/lib/odds/markets";

/**
 * Which selections are published where: the headline (and the picks lists
 * built from it) and the Code Hub's daily codes.
 *
 * The rules in code (model/paused.ts, predict.ts headlineEligible,
 * code-hub.ts hubMarketAllowed) are the defaults. The owner can switch any
 * selection in SELECTIONS on or off for either surface from /admin (stored
 * in public.selection_switches, 0084); the server loads those overrides
 * into this module before it models (selection-policy.ts), and the rules
 * above consult `override` first. Pure apart from that one held value.
 */

export type Surface = "headline" | "codeHub";

export interface SelectionDef {
  market: string;
  label: string;
  group: "Result" | "Goals" | "Handicap" | "Both score" | "Halves" | "Goal bounds";
  /**
   * Priced off the scoreline grids but not one of the model's own picks
   * (the halves, the goal bounds): when switched on it is offered beside
   * them (selection-extras.ts).
   */
  extra?: boolean;
  /**
   * Can't go in a Code Hub code: a code is graded from the final score, and
   * a halves market needs the half-time score, so it would never settle.
   */
  noCodeHub?: boolean;
}

const raw = (marketId: string, outcomeId: string, specifier?: string) => rawMarket({ marketId, outcomeId, specifier });

/** What the owner can switch. Every other selection follows the rules in code. */
export const SELECTIONS: readonly SelectionDef[] = [
  { market: "1x2:home", label: "Home win", group: "Result" },
  { market: "1x2:away", label: "Away win", group: "Result" },
  { market: "1x2:draw", label: "Draw", group: "Result" },
  { market: "dc:home-draw", label: "Home or draw", group: "Result" },
  { market: "dc:away-draw", label: "Away or draw", group: "Result" },
  { market: "dc:home-away", label: "Home or away", group: "Result" },
  { market: "ou:over:1.5", label: "Over 1.5 goals", group: "Goals" },
  { market: "ou:over:2.5", label: "Over 2.5 goals", group: "Goals" },
  { market: "ou:over:3.5", label: "Over 3.5 goals", group: "Goals" },
  { market: "ou:under:1.5", label: "Under 1.5 goals", group: "Goals" },
  { market: "ou:under:2.5", label: "Under 2.5 goals", group: "Goals" },
  { market: "ou:under:3.5", label: "Under 3.5 goals", group: "Goals" },
  { market: "ah:home:-0.5", label: "Home -0.5", group: "Handicap" },
  { market: "ah:away:-0.5", label: "Away -0.5", group: "Handicap" },
  { market: "ah:home:1", label: "Home +1", group: "Handicap" },
  { market: "ah:away:1", label: "Away +1", group: "Handicap" },
  { market: "ah:home:1.5", label: "Home +1.5", group: "Handicap" },
  { market: "ah:away:1.5", label: "Away +1.5", group: "Handicap" },
  { market: "ah:home:-1.5", label: "Home -1.5", group: "Handicap" },
  { market: "ah:away:-1.5", label: "Away -1.5", group: "Handicap" },
  { market: "btts:yes", label: "GG (both teams score)", group: "Both score" },
  { market: "btts:no", label: "NG (not both teams score)", group: "Both score" },
  { market: raw("68", "12", "total=0.5"), label: "1st half over 0.5", group: "Halves", extra: true, noCodeHub: true },
  { market: raw("90", "12", "total=0.5"), label: "2nd half over 0.5", group: "Halves", extra: true, noCodeHub: true },
  { market: raw("900984", "74"), label: "Both halves over 0.5", group: "Halves", extra: true, noCodeHub: true },
  { market: raw("450001", "14"), label: "Goal bounds 1-4", group: "Goal bounds", extra: true },
  { market: raw("450001", "3"), label: "Goal bounds 0-3", group: "Goal bounds", extra: true },
];

export type SelectionPolicy = Readonly<Record<string, Partial<Record<Surface, boolean>>>>;

let policy: SelectionPolicy = {};

/** Replaces the overrides; selection-policy.ts calls this with what is stored. */
export function setSelectionPolicy(next: SelectionPolicy): void {
  policy = next;
}

/** The owner's switch for this selection on this surface: true on, false off, undefined when the rules in code decide. */
export function override(market: string, surface: Surface): boolean | undefined {
  if (surface === "codeHub" && NO_CODE_HUB.has(market)) return false;
  return policy[market]?.[surface];
}

const NO_CODE_HUB = new Set(SELECTIONS.filter((s) => s.noCodeHub).map((s) => s.market));

/** The extra selections switched on for a surface. */
export function extrasOn(surface: Surface): SelectionDef[] {
  return SELECTIONS.filter((s) => s.extra && override(s.market, surface) === true);
}
