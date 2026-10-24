/**
 * Shots and shots on target from ESPN's public scoreboard, for competitions
 * whose archive source carries none.
 *
 * The fit reads shots on target where a result has them (fit.ts shotWeight,
 * 0.5). Walk-forward over the last 12 months on ESPN's results
 * (scripts/shots-lab.ts), adding them improved both log losses on these
 * competitions, as it does on the Premier League where football-data.co.uk
 * supplies them:
 *
 *                       1X2 log loss      O/U 2.5 log loss   published pick
 *   MLS                1.0472 -> 1.0428   0.6487 -> 0.6451   73.5% -> 74.6%
 *   Argentina          1.0652 -> 1.0611   0.6571 -> 0.6541   71.3% -> 71.3%
 *   Liga MX            1.0525 -> 1.0452   0.6994 -> 0.6956   72.4% -> 73.4%
 *   UEFA cups          0.9578 -> 0.9541   0.6759 -> 0.6703   77.2% -> 79.0%
 *
 * The Brasileirão is left out: there the same weight made both log losses
 * slightly worse.
 *
 * ESPN and the archive spell clubs differently ("Pumas UNAM" / "UNAM Pumas",
 * "Estudiantes de La Plata" / "Estudiantes L.P."), so a result is matched on
 * competition, kick-off within 30 hours, the exact score, and at least one
 * shared name word that belongs to one club only; a row with shots already is
 * never overwritten.
 */

export const ESPN_SHOT_LEAGUES: Record<string, string> = {
  mls: "usa.1",
  "argentina-liga-profesional": "arg.1",
  "liga-mx": "mex.1",
  "champions-league": "uefa.champions",
  "europa-league": "uefa.europa",
  "conference-league": "uefa.europa.conf",
};

/**
 * Competitions whose corners come from ESPN. Wider than ESPN_SHOT_LEAGUES:
 * shots feed the goal model's fit, so they are added only where they were
 * shown to help it; corners feed only the corners model, which needs 200
 * games of history per competition before it prices anything, and
 * football-data.co.uk carries corners for eight leagues only.
 */
export const ESPN_CORNER_LEAGUES: Record<string, string> = {
  ...ESPN_SHOT_LEAGUES,
  brasileirao: "bra.1",
  "scottish-premiership": "sco.1",
  "super-lig": "tur.1",
  "belgian-pro-league": "bel.1",
  "greek-super-league": "gre.1",
  "league-one": "eng.3",
  "la-liga-2": "esp.2",
  "ligue-2": "fra.2",
  "bundesliga-2": "ger.2",
  "serie-b": "ita.2",
};

export interface CornerUpdate {
  id: string;
  hc: number;
  ac: number;
}

/** ESPN lists a game it has no statistics for as nil for both sides; a real 0-0 on corners is too rare to be worth the risk. */
export const hasCorners = (g: EspnResult) => g.hc !== undefined && g.ac !== undefined && g.hc + g.ac > 0;

export interface EspnResult {
  date: number;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hsot?: number;
  asot?: number;
  hs?: number;
  as?: number;
  /** Corners won. */
  hc?: number;
  ac?: number;
}

export interface ArchiveRow {
  id: string;
  kickoff: number;
  home: string;
  away: string;
  hg: number;
  ag: number;
}

export interface ShotUpdate {
  id: string;
  hsot: number;
  asot: number;
  hs: number | null;
  as: number | null;
}

const STOP = new Set(["fc", "cf", "sc", "ac", "as", "cd", "club", "de", "del", "la", "le", "the", "and", "atl", "dep", "sk", "fk", "if", "bk", "united", "city"]);

/** Distinctive words of a club name, accents and punctuation stripped. */
export function nameWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

const WINDOW_MS = 30 * 3600_000;

/**
 * ESPN lists a game it has no statistics for as nil shots for both sides
 * (Liverpool 0-1 Paris SG, March 2025, "0 shots" at Anfield): about one game
 * in 35 in Liga MX, fewer elsewhere.
 */
export const hasShots = (g: EspnResult) =>
  g.hsot !== undefined && g.asot !== undefined && (g.hsot + g.asot > 0 || (g.hs ?? 0) + (g.as ?? 0) > 0);

/**
 * Archive rows to fill from ESPN results. Both names agreeing beats one, and
 * a row goes to one game only; several sources can hold the same game, so a
 * game fills every copy that matches it as well as its best.
 */
export function matchShots(espn: EspnResult[], rows: ArchiveRow[]): ShotUpdate[] {
  return matchEspn(espn, rows, hasShots).map(({ g, r }) => ({ id: r.id, hsot: g.hsot!, asot: g.asot!, hs: g.hs ?? null, as: g.as ?? null }));
}

/** Archive rows to fill with ESPN's corners, matched the same way as shots. */
export function matchCorners(espn: EspnResult[], rows: ArchiveRow[]): CornerUpdate[] {
  return matchEspn(espn, rows, hasCorners).map(({ g, r }) => ({ id: r.id, hc: g.hc!, ac: g.ac! }));
}

function matchEspn(espn: EspnResult[], rows: ArchiveRow[], has: (g: EspnResult) => boolean): { g: EspnResult; r: ArchiveRow }[] {
  // A word names a club only if no other club in the competition carries it:
  // "Central" is Rosario, Barracas and Central Córdoba; "Juniors" is Boca and
  // Argentinos.
  const clubs = new Map<string, number>();
  for (const name of new Set(espn.flatMap((g) => [g.home, g.away]))) {
    for (const w of nameWords(name)) clubs.set(w, (clubs.get(w) ?? 0) + 1);
  }
  const shares = (archive: string, espnName: string) => {
    const wa = nameWords(archive);
    for (const w of nameWords(espnName)) if (clubs.get(w) === 1 && wa.has(w)) return true;
    return false;
  };

  const pairs: { g: EspnResult; r: ArchiveRow; score: number }[] = [];
  for (const g of espn) {
    if (!has(g)) continue;
    for (const r of rows) {
      if (Math.abs(r.kickoff - g.date) > WINDOW_MS || r.hg !== g.hg || r.ag !== g.ag) continue;
      const score = (shares(r.home, g.home) ? 1 : 0) + (shares(r.away, g.away) ? 1 : 0);
      if (score > 0) pairs.push({ g, r, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const out: { g: EspnResult; r: ArchiveRow }[] = [];
  const used = new Set<string>();
  const best = new Map<EspnResult, number>();
  for (const { g, r, score } of pairs) {
    if (used.has(r.id) || score < (best.get(g) ?? 0)) continue;
    used.add(r.id);
    best.set(g, score);
    out.push({ g, r });
  }
  return out;
}

/** One day of a competition's finished games from ESPN, with shots where listed (and games in play, when asked). */
export async function espnDay(slug: string, day: Date, opts: { live?: boolean } = {}): Promise<EspnResult[]> {
  const ymd = day.toISOString().slice(0, 10).replace(/-/g, "");
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${ymd}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return [];
  const data = (await r.json()) as {
    events?: {
      date: string;
      competitions?: {
        status?: { type?: { completed?: boolean; state?: string } };
        competitors: { homeAway: string; score?: string; team: { displayName: string }; statistics?: { name: string; displayValue?: string }[] }[];
      }[];
    }[];
  };
  const out: EspnResult[] = [];
  for (const e of data.events ?? []) {
    const c = e.competitions?.[0];
    if (!c) continue;
    const done = c.status?.type?.completed === true;
    if (!done && !(opts.live && c.status?.type?.state === "in")) continue;
    const h = c.competitors.find((x) => x.homeAway === "home");
    const a = c.competitors.find((x) => x.homeAway === "away");
    if (!h || !a) continue;
    const stat = (x: typeof h, n: string) => {
      const v = Number(x.statistics?.find((s) => s.name === n)?.displayValue);
      return Number.isFinite(v) ? v : undefined;
    };
    const hg = Number(h.score);
    const ag = Number(a.score);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    out.push({
      date: Date.parse(e.date),
      home: h.team.displayName,
      away: a.team.displayName,
      hg,
      ag,
      hsot: stat(h, "shotsOnTarget"),
      asot: stat(a, "shotsOnTarget"),
      hs: stat(h, "totalShots"),
      as: stat(a, "totalShots"),
      hc: stat(h, "wonCorners"),
      ac: stat(a, "wonCorners"),
    });
  }
  return out;
}

/**
 * ESPN's game for a fixture, matched on kick-off within 30 hours, the exact
 * score and at least one name word that belongs to one club only (as in
 * matchShots); null when no game, or more than one, fits.
 */
export function findEspnGame(espn: EspnResult[], fixture: { home: string; away: string; kickoff: number; hg: number; ag: number }): EspnResult | null {
  const clubs = new Map<string, number>();
  for (const name of new Set(espn.flatMap((g) => [g.home, g.away]))) {
    for (const w of nameWords(name)) clubs.set(w, (clubs.get(w) ?? 0) + 1);
  }
  const shares = (ours: string, theirs: string) => {
    const mine = nameWords(ours);
    for (const w of nameWords(theirs)) if (clubs.get(w) === 1 && mine.has(w)) return true;
    return false;
  };
  const fits = espn.filter(
    (g) =>
      Math.abs(g.date - fixture.kickoff) <= WINDOW_MS &&
      g.hg === fixture.hg &&
      g.ag === fixture.ag &&
      (shares(fixture.home, g.home) || shares(fixture.away, g.away)),
  );
  return fits.length === 1 ? fits[0] : null;
}

/**
 * Whether ESPN's counts look complete. It sometimes lists a game with a shot
 * or two a side (Rayo v Athletic, October 2026: one shot each) where the
 * statistics never came through; a real game has ten shots or more.
 */
export function espnStatsComplete(g: EspnResult): boolean {
  const all = [g.hs, g.as, g.hsot, g.asot, g.hc, g.ac];
  if (all.some((x) => x === undefined)) return false;
  return g.hs! + g.as! >= 10 && g.hsot! <= g.hs! && g.asot! <= g.as!;
}
