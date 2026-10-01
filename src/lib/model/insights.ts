/**
 * The "why" behind a prediction, as discrete, checkable observations.
 *
 * The probabilities say what the model thinks; these say what in the data it
 * is reacting to. Every insight is computed from the same training slice the
 * ratings were fitted on, so nothing here can disagree with the numbers above
 * it — and anything that would rest on fewer than a handful of matches is left
 * out rather than dressed up.
 *
 * Insights feed three places: the deterministic write-up's factor list, the
 * brief handed to Claude (which may only explain what is in it), and the
 * match page itself.
 */

import type { Match, ResultRow } from "@/lib/types";
import { normaliseKey, type LeagueFit, type TeamRating } from "./fit";
import type { MarketProbabilities } from "./poisson";

export type InsightLean = "home" | "away" | "neutral" | "caution";

export interface Insight {
  /** Stable id, so the UI and tests can find a specific observation. */
  kind:
    | "strength"
    | "matchup"
    | "venue"
    | "momentum"
    | "drought"
    | "clean-sheets"
    | "edge"
    | "neutral-venue"
    | "thin-rating";
  /** Which side the observation favours, or a caveat. */
  lean: InsightLean;
  text: string;
}

/** Venue/form splits below this many matches are noise, not a pattern. */
const MIN_SPLIT = 4;
/** A rating fitted on fewer appearances than this gets an explicit caveat. */
const THIN_RATING = 8;
/** Matches in the recent-form window. */
const FORM_WINDOW = 6;

export interface InsightInput {
  match: Match;
  results: ResultRow[];
  fit: LeagueFit;
  markets: MarketProbabilities;
  topPick: { market: string; label: string; probability: number } | null;
  baselines: Record<string, number>;
  neutralVenue: boolean;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { match, results, fit, markets, topPick, baselines, neutralVenue } = input;
  const home = match.home.name;
  const away = match.away.name;
  const hr = fit.ratings.get(normaliseKey(home));
  const ar = fit.ratings.get(normaliseKey(away));

  const out: Insight[] = [];

  // ---------------------------------------------------------- Strength table
  const table = rankTable(fit);
  if (hr && ar && table.size >= 6) {
    const h = table.get(normaliseKey(home));
    const a = table.get(normaliseKey(away));
    if (h && a) {
      out.push({
        kind: "strength",
        lean: h.overall < a.overall ? "home" : h.overall > a.overall ? "away" : "neutral",
        text:
          `On overall strength the model rates ${home} ${ordinal(h.overall)} and ` +
          `${away} ${ordinal(a.overall)} of the ${table.size} sides in this sample.`,
      });

      // The single biggest attack-vs-defence mismatch in the fixture.
      const homeEdge = hr.attack - ar.defence; // home attack against away defence
      const awayEdge = ar.attack - hr.defence;
      const biggest = Math.abs(homeEdge) >= Math.abs(awayEdge)
        ? { side: "home" as const, edge: homeEdge, atk: h.attack, def: a.defence, attacker: home, defender: away }
        : { side: "away" as const, edge: awayEdge, atk: a.attack, def: h.defence, attacker: away, defender: home };
      if (Math.abs(biggest.edge) >= 0.3) {
        const favours = biggest.edge > 0 ? biggest.side : biggest.side === "home" ? "away" : "home";
        out.push({
          kind: "matchup",
          lean: favours,
          text:
            biggest.edge > 0
              ? `Key mismatch: ${biggest.attacker}'s attack (${superlative(biggest.atk, "best")}) meets ` +
                `${biggest.defender}'s defence (${superlative(table.size - biggest.def + 1, "weakest")}).`
              : `Key mismatch: ${biggest.attacker}'s attack (${superlative(table.size - biggest.atk + 1, "weakest")}) ` +
                `runs into ${biggest.defender}'s defence (${superlative(biggest.def, "best")}).`,
        });
      }
    }
  }

  // ------------------------------------------------------------ Venue split
  if (!neutralVenue) {
    const hv = split(results, home, "home");
    const av = split(results, away, "away");
    if (hv.played >= MIN_SPLIT && av.played >= MIN_SPLIT) {
      const diff = hv.ppg - av.ppg;
      out.push({
        kind: "venue",
        lean: diff > 0.5 ? "home" : diff < -0.5 ? "away" : "neutral",
        text:
          `${home} at home: ${record(hv)}, ${hv.gf.toFixed(1)} scored and ${hv.ga.toFixed(1)} conceded a game. ` +
          `${away} away: ${record(av)}, ${av.gf.toFixed(1)} scored and ${av.ga.toFixed(1)} conceded.`,
      });
    }
  } else {
    out.push({
      kind: "neutral-venue",
      lean: "neutral",
      text: "Tournament fixture at a neutral venue, so no home advantage is applied to either side.",
    });
  }

  // --------------------------------------------------------------- Momentum
  for (const [name, side] of [[home, "home"], [away, "away"]] as const) {
    const all = split(results, name, "any");
    const recent = split(results, name, "any", FORM_WINDOW);
    if (all.played < FORM_WINDOW * 2 || recent.played < FORM_WINDOW) continue;
    const delta = recent.ppg - all.ppg;
    if (Math.abs(delta) < 0.6) continue;
    out.push({
      kind: "momentum",
      lean: delta > 0 ? side : side === "home" ? "away" : "home",
      text:
        `${name} are ${delta > 0 ? "running hotter" : "running colder"} than their season: ` +
        `${recent.ppg.toFixed(1)} points a game over the last ${FORM_WINDOW} against ` +
        `${all.ppg.toFixed(1)} across the sample. Recency weighting already prices part of this in.`,
    });
  }

  // -------------------------------------------------- Droughts, clean sheets
  for (const [name, side] of [[home, "home"], [away, "away"]] as const) {
    const recent = lastN(results, name, FORM_WINDOW);
    if (recent.length < FORM_WINDOW) continue;
    const blanks = recent.filter((r) => r.gf === 0).length;
    const shutouts = recent.filter((r) => r.ga === 0).length;
    if (blanks >= 3) {
      out.push({
        kind: "drought",
        lean: side === "home" ? "away" : "home",
        text: `${name} have failed to score in ${blanks} of their last ${FORM_WINDOW}.`,
      });
    }
    if (shutouts >= 3) {
      out.push({
        kind: "clean-sheets",
        lean: side,
        text: `${name} have kept ${shutouts} clean sheets in their last ${FORM_WINDOW}.`,
      });
    }
  }

  // ------------------------------------------------------- Edge on the pick
  if (topPick) {
    const norm = baselines[topPick.market];
    if (norm !== undefined && topPick.probability - norm >= 0.05) {
      out.push({
        kind: "edge",
        lean: "neutral",
        text:
          `${topPick.label} comes out at ${pct(topPick.probability)} against a ${pct(norm)} norm ` +
          `in this competition. That gap, not the raw percentage, is why it is the strongest read.`,
      });
    }
  }

  // ------------------------------------------------------------ Thin ratings
  for (const [name, r] of [[home, hr], [away, ar]] as const) {
    if (r && r.played < THIN_RATING) {
      out.push({
        kind: "thin-rating",
        lean: "caution",
        text: `${name}'s rating rests on only ${r.played} matches in our data, so it is pulled toward average.`,
      });
    }
  }

  // Goal-shape context only when nothing more specific was found, so the
  // list never comes back empty for a fixture the model did rate.
  if (out.length === 0) {
    out.push({
      kind: "edge",
      lean: "neutral",
      text: `${markets.expectedGoals.total.toFixed(2)} goals expected in total; nothing in the venue or form splits stands out.`,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ helpers */

interface Ranks {
  overall: number;
  attack: number;
  defence: number;
}

/**
 * 1-based ranks for every rated side with enough appearances to mean
 * something. Defence is ranked best-first like attack (higher = concedes less).
 */
export function rankTable(fit: LeagueFit, minPlayed = 3): Map<string, Ranks> {
  const rated: [string, TeamRating][] = [...fit.ratings.entries()].filter(([, r]) => r.played >= minPlayed);
  const order = (score: (r: TeamRating) => number) => {
    const sorted = [...rated].sort((a, b) => score(b[1]) - score(a[1]));
    return new Map(sorted.map(([k], i) => [k, i + 1]));
  };
  const overall = order((r) => r.attack + r.defence);
  const attack = order((r) => r.attack);
  const defence = order((r) => r.defence);
  const out = new Map<string, Ranks>();
  for (const [k] of rated) {
    out.set(k, { overall: overall.get(k)!, attack: attack.get(k)!, defence: defence.get(k)! });
  }
  return out;
}

interface Split {
  played: number;
  w: number;
  d: number;
  l: number;
  ppg: number;
  /** Per-game averages. */
  gf: number;
  ga: number;
}

function lastN(results: ResultRow[], team: string, n: number) {
  const key = normaliseKey(team);
  return results
    .filter((r) => normaliseKey(r.homeName) === key || normaliseKey(r.awayName) === key)
    .sort((a, b) => b.date - a.date)
    .slice(0, n)
    .map((r) => {
      const isHome = normaliseKey(r.homeName) === key;
      return { gf: isHome ? r.homeGoals : r.awayGoals, ga: isHome ? r.awayGoals : r.homeGoals };
    });
}

function split(
  results: ResultRow[],
  team: string,
  venue: "home" | "away" | "any",
  limit = Number.POSITIVE_INFINITY,
): Split {
  const key = normaliseKey(team);
  const rows = results
    .filter((r) =>
      venue === "home"
        ? normaliseKey(r.homeName) === key
        : venue === "away"
          ? normaliseKey(r.awayName) === key
          : normaliseKey(r.homeName) === key || normaliseKey(r.awayName) === key,
    )
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);

  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const r of rows) {
    const isHome = normaliseKey(r.homeName) === key;
    const f = isHome ? r.homeGoals : r.awayGoals;
    const a = isHome ? r.awayGoals : r.homeGoals;
    gf += f;
    ga += a;
    if (f > a) w++;
    else if (f === a) d++;
    else l++;
  }
  const n = rows.length || 1;
  return { played: rows.length, w, d, l, ppg: (3 * w + d) / n, gf: gf / n, ga: ga / n };
}

function record(s: Split): string {
  return `${s.w}W ${s.d}D ${s.l}L`;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** "the best", "2nd best" — never "1st best". */
function superlative(rank: number, word: "best" | "weakest"): string {
  return rank === 1 ? `the ${word}` : `${ordinal(rank)} ${word}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
