import "server-only";

import { normaliseKey } from "@/lib/model/fit";
import { cached } from "@/lib/providers/cache";
import type { LearnedLink, MatchInput, MatchMethod, UnresolvedFixture } from "./sportybet-match";
import type { SportyBetEvent } from "./sportybet-api";

/**
 * What the SportyBet matcher remembers, in the tables from migration 0066.
 *
 * Every read degrades to "nothing remembered" (the matcher then works from
 * names alone, as it always did), and every write is best effort: losing a
 * link costs a re-match next time, never a wrong match.
 */

const PENDING_TO_TRUSTED = 2;

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

interface CompetitorRow {
  competitor_id: string;
  team_key: string;
  team_name: string;
  sportybet_name: string;
  method: string;
  status: "trusted" | "pending" | "rejected";
  confirmations: number;
}

async function competitorRows(leagueCode: string): Promise<CompetitorRow[]> {
  try {
    const { data, error } = await (await admin())
      .from("sportybet_competitors")
      .select("competitor_id, team_key, team_name, sportybet_name, method, status, confirmations")
      .eq("league_code", leagueCode);
    return error ? [] : ((data ?? []) as CompetitorRow[]);
  } catch {
    return [];
  }
}

/** Our extra names for these clubs, from team_aliases, keyed by team key. */
async function aliasesFor(names: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (names.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("teams")
      .select("name, team_aliases(alias)")
      .in("name", [...new Set(names)]);
    for (const row of (data ?? []) as { name: string; team_aliases: { alias: string }[] | null }[]) {
      const key = normaliseKey(row.name);
      const list = out.get(key) ?? [];
      for (const a of row.team_aliases ?? []) if (a.alias && !list.includes(a.alias)) list.push(a.alias);
      out.set(key, list);
    }
  } catch {
    // Names alone, then.
  }
  return out;
}

/** The matcher's memory for one competition, cached briefly per instance. */
export function memoryFor(
  leagueCode: string,
  names: readonly string[],
): Promise<Pick<MatchInput, "links" | "aliases" | "rejected">> {
  const sorted = [...new Set(names)].sort();
  return cached(`sportybet:memory:${leagueCode}:${sorted.join("|")}`, 5 * 60_000, async () => {
    const [rows, aliases] = await Promise.all([competitorRows(leagueCode), aliasesFor(sorted)]);
    return {
      links: new Map(rows.filter((r) => r.status === "trusted").map((r) => [r.team_key, r.competitor_id])),
      rejected: new Set(rows.filter((r) => r.status === "rejected").map((r) => `${r.team_key}|${r.competitor_id}`)),
      aliases,
    };
  });
}

/**
 * Stores what a match taught. A link already pending is confirmed; it turns
 * trusted on its second sighting. A different id for a club with a pending
 * link replaces it, since neither sighting was sure.
 */
export async function saveLearned(leagueCode: string, learned: readonly LearnedLink[]): Promise<void> {
  if (learned.length === 0) return;
  try {
    const db = await admin();
    const existing = await competitorRows(leagueCode);
    const now = new Date().toISOString();
    for (const link of learned) {
      const same = existing.find((r) => r.team_key === link.teamKey && r.competitor_id === link.competitorId);
      if (same?.status === "rejected") continue;
      if (same) {
        const confirmations = same.confirmations + 1;
        const status = same.status === "trusted" || confirmations >= PENDING_TO_TRUSTED || link.status === "trusted"
          ? "trusted"
          : "pending";
        await db
          .from("sportybet_competitors")
          .update({ confirmations, status, last_seen: now, sportybet_name: link.sportybetName })
          .eq("league_code", leagueCode)
          .eq("team_key", link.teamKey)
          .eq("competitor_id", link.competitorId);
        continue;
      }
      // A pending guess for either side gives way to this sighting.
      const stale = existing.filter(
        (r) =>
          r.status === "pending" && (r.team_key === link.teamKey || r.competitor_id === link.competitorId),
      );
      for (const r of stale) {
        await db
          .from("sportybet_competitors")
          .delete()
          .eq("league_code", leagueCode)
          .eq("team_key", r.team_key)
          .eq("competitor_id", r.competitor_id);
      }
      const blocked = existing.some(
        (r) => r.status === "trusted" && (r.team_key === link.teamKey || r.competitor_id === link.competitorId),
      );
      if (blocked) continue;
      await db.from("sportybet_competitors").insert({
        competitor_id: link.competitorId,
        league_code: leagueCode,
        team_key: link.teamKey,
        team_name: link.teamName,
        sportybet_name: link.sportybetName,
        method: link.method,
        status: link.status,
        first_seen: now,
        last_seen: now,
      });
    }
  } catch {
    // Relearned next time.
  }
}

export interface StoredEventLink {
  eventId: string;
  method: MatchMethod | "manual";
}

/** The SportyBet event already matched to this fixture, if any. */
export async function storedEventLink(matchId: string): Promise<StoredEventLink | null> {
  try {
    const { data } = await (await admin())
      .from("sportybet_event_links")
      .select("event_id, method")
      .eq("match_id", matchId)
      .maybeSingle();
    return data ? { eventId: data.event_id, method: data.method } : null;
  } catch {
    return null;
  }
}

/** Stored links for many fixtures at once, by match id. */
export async function storedEventLinks(matchIds: readonly string[]): Promise<Map<string, StoredEventLink>> {
  const out = new Map<string, StoredEventLink>();
  if (matchIds.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("sportybet_event_links")
      .select("match_id, event_id, method")
      .in("match_id", [...matchIds]);
    for (const r of data ?? []) out.set(r.match_id, { eventId: r.event_id, method: r.method });
  } catch {
    // Matched afresh.
  }
  return out;
}

export async function saveEventLinks(
  leagueCode: string,
  links: readonly { matchId: string; event: SportyBetEvent; method: MatchMethod | "manual" }[],
): Promise<void> {
  if (links.length === 0) return;
  try {
    const db = await admin();
    await db.from("sportybet_event_links").upsert(
      links.map((l) => ({
        match_id: l.matchId,
        league_code: leagueCode,
        event_id: l.event.eventId,
        tournament_id: l.event.tournamentId ?? null,
        home_name: l.event.homeName,
        away_name: l.event.awayName,
        home_id: l.event.homeId ?? null,
        away_id: l.event.awayId ?? null,
        kickoff: new Date(l.event.kickoff).toISOString(),
        method: l.method,
        linked_at: new Date().toISOString(),
        // A new or changed link has not been checked against a result yet.
        verdict: null,
        our_score: null,
        sportybet_score: null,
        verified_at: null,
        verify_attempts: 0,
      })),
      { onConflict: "match_id" },
    );
    await db
      .from("sportybet_unresolved")
      .delete()
      .in(
        "match_id",
        links.map((l) => l.matchId),
      );
  } catch {
    // Re-matched next time.
  }
}

export async function saveUnresolved(
  leagueCode: string,
  fixtures: ReadonlyMap<string, { homeName: string; awayName: string; kickoff: number }>,
  unresolved: readonly UnresolvedFixture[],
): Promise<void> {
  if (unresolved.length === 0) return;
  try {
    await (await admin()).from("sportybet_unresolved").upsert(
      unresolved.flatMap((u) => {
        const f = fixtures.get(u.matchId);
        if (!f) return [];
        return [
          {
            match_id: u.matchId,
            league_code: leagueCode,
            home_name: f.homeName,
            away_name: f.awayName,
            kickoff: new Date(f.kickoff).toISOString(),
            candidates: u.candidates,
            seen_at: new Date().toISOString(),
          },
        ];
      }),
      { onConflict: "match_id" },
    );
  } catch {
    // The admin list is a convenience.
  }
}

export interface BookingLogEntry {
  source: "slip" | "code-hub";
  userId?: string | null;
  legs: number;
  outcome: "booked" | "cached" | "problems" | "refused" | "unavailable";
  via?: "direct" | "parsebot" | null;
  code?: string | null;
  readBack?: boolean | null;
  problems?: unknown;
  durationMs?: number;
}

/** Records one booking attempt for /admin/sportybet. Best effort. */
export async function logBooking(entry: BookingLogEntry): Promise<void> {
  try {
    await (await admin()).from("sportybet_booking_log").insert({
      source: entry.source,
      user_id: entry.userId ?? null,
      legs: entry.legs,
      outcome: entry.outcome,
      via: entry.via ?? null,
      code: entry.code ?? null,
      read_back: entry.readBack ?? null,
      problems: entry.problems ?? null,
      duration_ms: entry.durationMs ?? null,
    });
  } catch {
    // The log is for the admin page; a lost row costs nothing else.
  }
}
