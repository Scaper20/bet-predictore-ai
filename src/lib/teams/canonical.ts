/**
 * One name per club for the model.
 *
 * The training history comes from several sources that spell clubs their own
 * way: football-data.co.uk writes "Leeds", "Nott'm Forest", "Ath Madrid",
 * while fixtures arrive under TheSportsDB's "Leeds United". The fit keys
 * teams on normaliseKey(name), so a fixture for Leeds United found no
 * history at all and was published as "not enough data". The ingestion
 * resolver already links every spelling to its club (team_aliases); this
 * module applies those links when the model reads the history.
 *
 * The Supabase client is imported lazily: this module sits under code the
 * unit tests import.
 */

import type { ResultRow } from "@/lib/types";
import { normaliseKey } from "@/lib/model/fit";
import type { LeagueDef } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";

/** The same key the ingestion resolver stores aliases under (loose_key in resolve.py). */
export function looseKey(name: string): string {
  return normaliseKey(name.replace(/\./g, ""));
}

/**
 * Where a competition's club names are unique: its country. National teams
 * share "international". Continental cups have no scope of their own (their
 * history is written under the clubs' canonical names already), so null.
 */
export function nameScope(def: LeagueDef): string | null {
  if (def.confederation) return "international";
  const country = def.country.toLowerCase();
  return ["europe", "africa", "world", "south america", "north america"].includes(country) ? null : country;
}

export interface NameBook {
  /** looseKey(any spelling) -> the club's canonical name. */
  canonical: Map<string, string>;
  /** canonical name -> every spelling stored for it (canonical included). */
  spellings: Map<string, string[]>;
}

const EMPTY: NameBook = { canonical: new Map(), spellings: new Map() };

/** Every club and stored spelling in one scope. */
export function nameBook(scope: string): Promise<NameBook> {
  return cached(`names:${scope}`, 30 * 60_000, async () => {
    const { supabasePublic } = await import("@/lib/supabase/public");
    const c = supabasePublic();
    if (!c) return EMPTY;
    // Paged: PostgREST caps a response at 1,000 rows, and the national-team
    // scope holds more spellings than that.
    const page = async <T,>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const all: T[] = [];
      for (let i = 0; i < 20; i++) {
        const { data, error } = await query(i * 1000, i * 1000 + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    };
    const [teamRows, aliasRows] = await Promise.all([
      page<{ name: string }>((a, b) => c.from("teams").select("name").eq("scope", scope).order("id").range(a, b)),
      page<{ alias: string; alias_key: string; team: { name: string } | null }>((a, b) =>
        c.from("team_aliases").select("alias, alias_key, team:teams(name)").eq("scope", scope).order("alias_key").range(a, b) as unknown as PromiseLike<{
          data: { alias: string; alias_key: string; team: { name: string } | null }[] | null;
          error: unknown;
        }>,
      ),
    ]);

    const canonical = new Map<string, string>();
    const spellings = new Map<string, string[]>();
    const add = (key: string, spelling: string, name: string) => {
      if (!key) return;
      if (!canonical.has(key)) canonical.set(key, name);
      const list = spellings.get(name) ?? [name];
      if (!list.includes(spelling)) list.push(spelling);
      spellings.set(name, list);
    };
    for (const t of teamRows) add(looseKey(t.name), t.name, t.name);
    for (const a of aliasRows) if (a.team?.name) add(a.alias_key, a.alias, a.team.name);
    return { canonical, spellings };
  }).catch(() => EMPTY);
}

/**
 * Training rows under each club's canonical name, one row per fixture.
 *
 * Two sources can hold the same game under two spellings (the legacy
 * football-data.co.uk import and the scheduled one); once the names agree,
 * the duplicate is dropped so no game counts twice in the fit.
 */
export function canonicaliseRows(rows: ResultRow[], book: NameBook): ResultRow[] {
  if (book.canonical.size === 0) return rows;
  const name = (n: string) => book.canonical.get(looseKey(n)) ?? n;
  const seen = new Set<string>();
  const out: ResultRow[] = [];
  for (const r of rows) {
    const homeName = name(r.homeName);
    const awayName = name(r.awayName);
    const key = `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseKey(homeName)}|${normaliseKey(awayName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...r,
      homeName,
      awayName,
      homeId: r.homeId === r.homeName ? homeName : r.homeId,
      awayId: r.awayId === r.awayName ? awayName : r.awayId,
    });
  }
  return out;
}
