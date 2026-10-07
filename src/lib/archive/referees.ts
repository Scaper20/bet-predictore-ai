import "server-only";

import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { parseArchiveDate, splitCsvLine } from "@/lib/archive/football-data-uk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cached } from "@/lib/providers/cache";
import { looseKey, nameBook, nameScope } from "@/lib/teams/canonical";
import type { Match } from "@/lib/types";

/**
 * Referees for upcoming fixtures, from football-data.co.uk's fixtures.csv.
 *
 * The file lists the next few days of fixtures for the divisions it covers
 * and names the referee where one is appointed (the English and Scottish
 * divisions, usually about a week ahead). Stored in match_referees (0049);
 * the match page shows the name and the cards model uses it, since some
 * referees book far more than others (docs/stats-markets.md).
 */

export interface FixtureReferee {
  leagueCode: string;
  kickoff: number;
  homeName: string;
  awayName: string;
  referee: string;
}

/** Pure: the fixtures file to rows for catalogued divisions with a referee named. */
export function parseFixtureReferees(body: string, divisionToLeague: Map<string, string>): FixtureReferee[] {
  const lines = body.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const at = (n: string) => header.indexOf(n);
  const iDiv = at("Div"), iDate = at("Date"), iTime = at("Time"), iHome = at("HomeTeam"), iAway = at("AwayTeam"), iRef = at("Referee");
  if ([iDiv, iDate, iHome, iAway, iRef].some((i) => i < 0)) return [];
  const out: FixtureReferee[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const league = divisionToLeague.get(f[iDiv]?.trim());
    const referee = f[iRef]?.trim();
    const kickoff = parseArchiveDate(f[iDate], iTime >= 0 ? f[iTime] : undefined);
    if (!league || !referee || kickoff === null) continue;
    out.push({ leagueCode: league, kickoff, homeName: f[iHome].trim(), awayName: f[iAway].trim(), referee: referee.slice(0, 60) });
  }
  return out;
}

/** Daily: fetch and store the referees named for upcoming fixtures. */
export async function refreshReferees(): Promise<{ fetched: number; stored: number }> {
  const divisions = new Map<string, string>();
  for (const l of LEAGUES) if (l.archive?.footballDataUk) divisions.set(l.archive.footballDataUk, l.code);
  let body: string | null = null;
  try {
    const r = await fetch("https://www.football-data.co.uk/fixtures.csv", { signal: AbortSignal.timeout(15_000) });
    body = r.ok ? await r.text() : null;
  } catch {
    body = null;
  }
  if (!body) return { fetched: 0, stored: 0 };
  const rows = parseFixtureReferees(body, divisions);
  if (rows.length === 0) return { fetched: 0, stored: 0 };
  const { data, error } = await supabaseAdmin().rpc("upsert_match_referees", {
    p_rows: rows.map((r) => ({
      league_code: r.leagueCode,
      kickoff: new Date(r.kickoff).toISOString(),
      home_name: r.homeName,
      away_name: r.awayName,
      referee: r.referee,
    })),
  });
  return { fetched: rows.length, stored: error ? 0 : Number(data ?? 0) };
}

/** The referee named for a fixture, when the source has one. */
export async function refereeFor(match: Match): Promise<string | null> {
  const code = match.league.code;
  if (!code) return null;
  const def = leagueByCode(code);
  if (!def?.archive?.footballDataUk) return null;
  const kickoff = Date.parse(match.kickoff);
  if (!Number.isFinite(kickoff)) return null;

  const rows = await cached(`referees:${code}`, 30 * 60_000, async () => {
    try {
      const { data } = await supabaseAdmin()
        .from("match_referees")
        .select("kickoff, home_name, away_name, referee")
        .eq("league_code", code)
        .gte("kickoff", new Date(Date.now() - 3 * 86_400_000).toISOString())
        .limit(500);
      return (data ?? []) as { kickoff: string; home_name: string; away_name: string; referee: string }[];
    } catch {
      return [];
    }
  });
  if (rows.length === 0) return null;

  const scope = nameScope(def);
  const book = scope ? await nameBook(scope) : null;
  const canon = (n: string) => (book?.canonical.get(looseKey(n)) ?? n);
  const key = (n: string) => looseKey(canon(n));
  const home = key(match.home.name);
  const away = key(match.away.name);
  const hit = rows.find(
    (r) => Math.abs(Date.parse(r.kickoff) - kickoff) < 36 * 3_600_000 && key(r.home_name) === home && key(r.away_name) === away,
  );
  return hit?.referee ?? null;
}
