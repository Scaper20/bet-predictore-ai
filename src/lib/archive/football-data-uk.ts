/**
 * Parsing for the football-data.co.uk season archives.
 *
 * Pure, and separate from the fetching for the reason the rest of this repo
 * splits that way: this needs unit tests, and the fetcher does network I/O.
 *
 * Why this source at all, when there are three provider adapters already: it
 * is the only free one that returns a COMPLETE season. TheSportsDB's public
 * key truncates every season endpoint to about fifteen rows, and SportAPI7's
 * free tier allows fifty requests a month against the thirteen pages one
 * season costs. Measured through the production path, the model was training
 * on 15-35 matches per competition, which the backtest puts at 51.6% accuracy
 * against 66.3% on full history. This closes that gap for nine of the twelve
 * catalogued competitions, at no cost and no rate limit.
 *
 * Two file formats, because the site has two:
 *
 *   mmz4281/{season}/{div}.csv   one division, one season, wide columns
 *   new/{country}.csv            many seasons and leagues in one file
 *
 * Both carry closing prices, which is what makes them worth more than a bare
 * results feed — see src/lib/model/backtest.ts, which already reads them.
 */

export interface ArchiveRow {
  /** Catalogue slug. */
  leagueCode: string;
  /** Epoch milliseconds, UTC. */
  kickoff: number;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

/** Splits a CSV line, honouring the quoted fields the referee column uses. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * dd/mm/yy or dd/mm/yyyy, with an optional HH:MM.
 *
 * Two-digit years are read as 20xx: the archives start in the 1990s but the
 * files that still use a two-digit year are all recent, and a match kicking
 * off in 1925 is not a case this product has.
 */
export function parseArchiveDate(date: string, time?: string): number | null {
  const [d, m, y] = (date ?? "").split("/");
  if (!d || !m || !y) return null;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  // Number("") is 0, not NaN, so an absent time cannot be detected by
  // coercing it — it has to be tested as a string first, or every timeless
  // row silently lands at midnight and can cross a date boundary.
  const [hh, mm] = (time ?? "").split(":");
  const hour = hh?.trim() ? Number(hh) : Number.NaN;
  const minute = mm?.trim() ? Number(mm) : Number.NaN;
  const ms = Date.UTC(
    year,
    Number(m) - 1,
    Number(d),
    Number.isFinite(hour) ? hour : 12,
    Number.isFinite(minute) ? minute : 0,
  );
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The per-division files: one season, one competition, results in FTHG/FTAG.
 */
export function parseDivisionCsv(body: string, leagueCode: string): ArchiveRow[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);

  const iDate = at("Date");
  const iTime = at("Time");
  const iHome = at("HomeTeam");
  const iAway = at("AwayTeam");
  const iHg = at("FTHG");
  const iAg = at("FTAG");
  if (iDate < 0 || iHome < 0 || iAway < 0 || iHg < 0 || iAg < 0) return [];

  const rows: ArchiveRow[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const row = toRow(leagueCode, f[iDate], iTime >= 0 ? f[iTime] : undefined,
      f[iHome], f[iAway], f[iHg], f[iAg]);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The per-country files: many seasons and sometimes several competitions in
 * one file, results in HG/AG, and a `League` column that has to be matched.
 */
export function parseCountryCsv(
  body: string,
  leagueCode: string,
  leagueName: string,
): ArchiveRow[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);

  const iLeague = at("League");
  const iDate = at("Date");
  const iTime = at("Time");
  const iHome = at("Home");
  const iAway = at("Away");
  const iHg = at("HG");
  const iAg = at("AG");
  if (iDate < 0 || iHome < 0 || iAway < 0 || iHg < 0 || iAg < 0) return [];

  const wanted = leagueName.trim().toLowerCase();
  const rows: ArchiveRow[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    // A country file can hold several divisions; take only the one asked for.
    if (iLeague >= 0 && f[iLeague]?.trim().toLowerCase() !== wanted) continue;
    const row = toRow(leagueCode, f[iDate], iTime >= 0 ? f[iTime] : undefined,
      f[iHome], f[iAway], f[iHg], f[iAg]);
    if (row) rows.push(row);
  }
  return rows;
}

function toRow(
  leagueCode: string,
  date: string,
  time: string | undefined,
  home: string,
  away: string,
  hg: string,
  ag: string,
): ArchiveRow | null {
  const homeName = home?.trim();
  const awayName = away?.trim();
  if (!homeName || !awayName) return null;

  /*
   * A fixture with no score has not been played. The current-season file
   * carries those, and admitting them as 0-0 would feed the fit a goalless
   * draw for every match still to come.
   *
   * The blank has to be caught as a STRING. Number("") is 0 and
   * Number.isInteger(0) is true, so coercing first lets every unplayed
   * fixture through as a real result — the same trap as the missing kickoff
   * time above, and the reason both are tested.
   */
  if (!hg?.trim() || !ag?.trim()) return null;
  const homeGoals = Number(hg);
  const awayGoals = Number(ag);
  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) return null;
  if (homeGoals < 0 || awayGoals < 0) return null;

  const kickoff = parseArchiveDate(date, time);
  if (kickoff === null) return null;

  return { leagueCode, kickoff, homeName, awayName, homeGoals, awayGoals };
}

/**
 * Drops rows that describe the same match twice.
 *
 * Keyed on the kickoff DAY rather than the timestamp, matching the unique
 * index in 0014: archives disagree about kickoff times by minutes and
 * occasionally hours, so a timestamp key admits duplicates that a day key
 * catches.
 */
export function dedupe(rows: ArchiveRow[]): ArchiveRow[] {
  const seen = new Map<string, ArchiveRow>();
  for (const r of rows) {
    const day = new Date(r.kickoff).toISOString().slice(0, 10);
    const key = `${r.leagueCode}|${day}|${r.homeName.toLowerCase()}|${r.awayName.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()].sort((a, b) => a.kickoff - b.kickoff);
}
