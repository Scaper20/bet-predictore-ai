/**
 * Attaches FotMob xG (scripts/fotmob-xg-fetch.ts) to football-data.co.uk rows.
 *
 * The two feeds name clubs differently ("Man City", "Nott'm Forest" against
 * "Manchester City", "Nottingham Forest"), so a row is matched on the day (one
 * day either way), the final score, and a club-name similarity: the longest
 * shared token prefix, so "Nott'm" meets "Nottingham" and "Man" meets "Manchester".
 * A row with no candidate, or a tie, gets no xG and fits on goals and shots alone.
 */
import fs from "node:fs";

export interface XgRow {
  league: number;
  date: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hxg: number;
  axg: number;
}

const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "bk", "sk", "if", "de", "the", "club", "fk", "ud", "cd", "rc"]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

/** The longest shared prefix between any token of a and any of b; short tokens must be equal or a prefix of the other. */
export function nameSimilarity(a: string, b: string): number {
  let best = 0;
  for (const x of tokens(a))
    for (const y of tokens(b)) {
      let k = 0;
      while (k < x.length && k < y.length && x[k] === y[k]) k++;
      const prefixOfOther = k === Math.min(x.length, y.length);
      if (k >= 4 || (k >= 3 && prefixOfOther)) best = Math.max(best, k);
    }
  return best;
}

export interface XgMatcher {
  (date: number, home: string, away: string, hg: number, ag: number): [number, number] | undefined;
  stats: { asked: number; matched: number; ambiguous: number };
}

export function loadXgRows(file: string): XgRow[] {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function makeXgMatcher(rows: XgRow[], league: number): XgMatcher {
  const mine = rows.filter((r) => r.league === league).map((r) => ({ ...r, t: Date.parse(r.date) }));
  const stats = { asked: 0, matched: 0, ambiguous: 0 };
  const fn = ((date, home, away, hg, ag) => {
    stats.asked++;
    let best: { score: number; r: (typeof mine)[number] } | null = null;
    let tied = false;
    for (const r of mine) {
      if (r.hg !== hg || r.ag !== ag || Math.abs(r.t - date) > 1.2 * 86_400_000) continue;
      const score = nameSimilarity(home, r.home) + nameSimilarity(away, r.away);
      if (score < 3) continue;
      if (!best || score > best.score) {
        best = { score, r };
        tied = false;
      } else if (score === best.score) tied = true;
    }
    if (!best) return undefined;
    if (tied) {
      stats.ambiguous++;
      return undefined;
    }
    stats.matched++;
    return [best.r.hxg, best.r.axg];
  }) as XgMatcher;
  fn.stats = stats;
  return fn;
}
