import "server-only";

import { leagueByCode } from "@/lib/leagues";
import { dbMatch } from "@/lib/providers/db-source";
import { scoreVerdict, type EventResult } from "./sportybet-api";
import { directEnabled, fetchEventResult, fetchResults } from "./sportybet-direct";

/**
 * Checks each SportyBet link against the result, once the game is over.
 *
 * A link says "our fixture X is SportyBet's event Y". After full time both
 * sides record a score, and if the link were wrong they would almost always
 * disagree. So every finished link gets a verdict -- confirmed, mismatch, or
 * no-result for a game called off -- and /admin/sportybet reports accuracy
 * per matching method from them. This is the proof the matcher works, in the
 * only currency that counts: real results.
 *
 * Runs after every sync (hourly from the odds snapshot) and from the admin
 * page. One results call per competition per run, plus a detail call for any
 * event the list does not carry.
 */

/** Long enough for ninety minutes, stoppages and a delayed start. */
const AFTER_KICKOFF_MS = 150 * 60_000;

/** Past this, a game with no result on either side is written off. */
const GIVE_UP_MS = 3 * 86_400_000;

const MAX_ATTEMPTS = 6;

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

interface LinkRow {
  match_id: string;
  league_code: string;
  event_id: string;
  tournament_id: string | null;
  kickoff: string;
  verify_attempts: number;
}

export interface VerifyReport {
  checked: number;
  confirmed: number;
  mismatch: number;
  noResult: number;
  /** Not finished yet on our side or theirs; tried again next run. */
  waiting: number;
}

export async function verifyFinished(now = Date.now()): Promise<VerifyReport | null> {
  if (!(await directEnabled())) return null;
  const report: VerifyReport = { checked: 0, confirmed: 0, mismatch: 0, noResult: 0, waiting: 0 };
  const db = await admin();
  const { data, error } = await db
    .from("sportybet_event_links")
    .select("match_id, league_code, event_id, tournament_id, kickoff, verify_attempts")
    .is("verdict", null)
    .lt("kickoff", new Date(now - AFTER_KICKOFF_MS).toISOString())
    .lt("verify_attempts", MAX_ATTEMPTS)
    .order("kickoff")
    .limit(200);
  if (error || !data?.length) return report;

  const write = async (row: LinkRow, fields: Record<string, unknown>) => {
    await db.from("sportybet_event_links").update(fields).eq("match_id", row.match_id).eq("event_id", row.event_id);
  };
  const giveUp = (row: LinkRow) => now - Date.parse(row.kickoff) > GIVE_UP_MS;

  // Our side first: a verdict needs our final score.
  const ready: { row: LinkRow; ours: { home: number; away: number } }[] = [];
  for (const row of data as LinkRow[]) {
    report.checked++;
    const match = await dbMatch(row.match_id).catch(() => null);
    if (match?.status === "cancelled" || match?.status === "postponed") {
      await write(row, { verdict: "no-result", verified_at: new Date(now).toISOString() });
      report.noResult++;
      continue;
    }
    const { home, away } = match?.score ?? { home: null, away: null };
    if (match?.status !== "finished" || home === null || away === null) {
      if (giveUp(row)) {
        await write(row, { verdict: "no-result", verified_at: new Date(now).toISOString() });
        report.noResult++;
      } else {
        report.waiting++;
      }
      continue;
    }
    ready.push({ row, ours: { home, away } });
  }

  // Their side: one results call per competition over the links' span.
  const byTournament = new Map<string, typeof ready>();
  for (const item of ready) {
    const tid = item.row.tournament_id ?? leagueByCode(item.row.league_code)?.ids.sportyBet;
    if (!tid) continue;
    byTournament.set(tid, [...(byTournament.get(tid) ?? []), item]);
  }

  for (const [tid, items] of byTournament) {
    const kickoffs = items.map((i) => Date.parse(i.row.kickoff));
    const list = await fetchResults(tid, Math.min(...kickoffs) - 6 * 3_600_000, Math.min(now, Math.max(...kickoffs) + 6 * 3_600_000));
    const results = new Map<string, EventResult>((list ?? []).map((r) => [r.eventId, r]));

    for (const { row, ours } of items) {
      const theirs = results.get(row.event_id) ?? (await fetchEventResult(row.event_id));
      const ourScore = `${ours.home}:${ours.away}`;
      if (!theirs) {
        if (giveUp(row)) {
          await write(row, { verdict: "no-result", our_score: ourScore, verified_at: new Date(now).toISOString() });
          report.noResult++;
        } else {
          await write(row, { verify_attempts: row.verify_attempts + 1 });
          report.waiting++;
        }
        continue;
      }
      if (theirs.void) {
        await write(row, { verdict: "no-result", our_score: ourScore, verified_at: new Date(now).toISOString() });
        report.noResult++;
        continue;
      }
      const verdict = scoreVerdict(ours, theirs);
      await write(row, {
        verdict,
        our_score: ourScore,
        sportybet_score: theirs.setScore,
        verified_at: new Date(now).toISOString(),
      });
      if (verdict === "confirmed") report.confirmed++;
      else report.mismatch++;
    }
  }
  return report;
}
