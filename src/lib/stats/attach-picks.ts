import { normaliseKey } from "@/lib/model/fit";

export interface PickRow {
  match_id: string;
  label: string;
  result: string | null;
  kickoff: string;
  home_name: string;
  away_name: string;
}

export interface AttachedPick {
  matchId: string;
  label: string;
  result: string | null;
}

/**
 * Pairs logged picks with the games on a page.
 *
 * By id first. A pick is logged under whichever feed's id the predictions
 * page used ("fd:554948" for São Paulo v Santos), while the stored match
 * may only carry another feed's id ("sdb:2398399"), so failing that, the
 * same kickoff (within two hours) and the same two clubs by name.
 */
export function attachPicks(
  matches: { id: string; kickoff: string; home: { name: string }; away: { name: string } }[],
  picks: PickRow[],
): Map<string, AttachedPick> {
  const byId = new Map(picks.map((p) => [p.match_id, p]));
  const out = new Map<string, AttachedPick>();
  const used = new Set<string>();
  const toPick = (p: PickRow): AttachedPick => ({ matchId: p.match_id, label: p.label, result: p.result });

  for (const m of matches) {
    const p = byId.get(m.id);
    if (p) {
      out.set(m.id, toPick(p));
      used.add(p.match_id);
    }
  }
  for (const m of matches) {
    if (out.has(m.id)) continue;
    const k = Date.parse(m.kickoff);
    const home = normaliseKey(m.home.name);
    const away = normaliseKey(m.away.name);
    const p = picks.find(
      (x) =>
        !used.has(x.match_id) &&
        Math.abs(Date.parse(x.kickoff) - k) <= 2 * 3_600_000 &&
        normaliseKey(x.home_name) === home &&
        normaliseKey(x.away_name) === away,
    );
    if (p) {
      out.set(m.id, toPick(p));
      used.add(p.match_id);
    }
  }
  return out;
}
