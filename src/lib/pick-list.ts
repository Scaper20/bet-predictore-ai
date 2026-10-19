import type { Prediction, Pick } from "@/lib/model/predict";
import type { ViewedPrediction } from "@/lib/access";
import type { Match } from "@/lib/types";
import { isStrong } from "@/lib/model/tiers";

/**
 * One Picks-page row, reduced to what the row shows. The page loads its list
 * in batches as the visitor scrolls (components/match/pick-list.tsx), so a
 * row travels as data rather than as rendered markup, and has to be small.
 */
export interface PickRowData {
  id: string;
  kickoff: string;
  status: Match["status"];
  minute: number | null;
  score: Match["score"];
  league: { code: string | null; name: string };
  proLeague: boolean;
  home: { name: string; crest?: string; p: number };
  away: { name: string; crest?: string; p: number };
  pick: Pick;
  locked: boolean;
  strong: boolean;
  /** The day section the row sits in, already ordered on the server. */
  section: { key: string; title: string; live: boolean; count: number };
}

export function toPickRow(p: Prediction | ViewedPrediction, section: PickRowData["section"]): PickRowData | null {
  const pick = p.topPick;
  if (!pick) return null;
  const locked = "locked" in p ? p.locked : { pick: false, proLeague: false };
  const { match, markets } = p;
  return {
    id: match.id,
    kickoff: match.kickoff,
    status: match.status,
    minute: match.minute ?? null,
    score: match.score,
    league: { code: match.league.code ?? null, name: match.league.name },
    proLeague: Boolean(locked.proLeague),
    home: { name: match.home.name, crest: match.home.crest, p: markets.home },
    away: { name: match.away.name, crest: match.away.crest, p: markets.away },
    // A locked pick's label and chance never reach the browser (lib/access.ts
    // already blanks them); the row only needs its group for the blur.
    pick: locked.pick
      ? { ...pick, label: "", probability: 0, fairOdds: 0 }
      : pick,
    locked: locked.pick,
    strong: isStrong(pick, match.league.code),
    section,
  };
}

/** How many rows the page sends at first, and each time the visitor nears the bottom. */
export const PICK_BATCH = 40;
