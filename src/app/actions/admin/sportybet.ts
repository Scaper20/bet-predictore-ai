"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { LEAGUES } from "@/lib/leagues";
import { normaliseKey } from "@/lib/model/fit";
import type { Candidate } from "@/lib/odds/sportybet-match";
import { discoverTournaments, syncSportyBet } from "@/lib/odds/sportybet-sync";
import { forgetTournaments } from "@/lib/odds/sportybet-links";
import { verifyFinished } from "@/lib/odds/sportybet-verify";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The SportyBet matching screen's actions (/admin/sportybet): settle what the
 * matcher could not, and overrule what it got wrong.
 */

export type SportyBetActionState = { error: string | null; message: string | null };

const PATH = "/admin/sportybet";

/** Links an unresolved fixture to one of its candidate events, and teaches both clubs' ids. */
export async function linkFixture(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const matchId = String(formData.get("matchId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("sportybet_unresolved")
    .select("league_code, home_name, away_name, kickoff, candidates")
    .eq("match_id", matchId)
    .maybeSingle();
  const candidate = ((row?.candidates ?? []) as Candidate[]).find((c) => c.eventId === eventId);
  if (!row || !candidate) return { error: "That fixture or event is no longer on the list.", message: null };

  const { error } = await db.from("sportybet_event_links").upsert(
    {
      match_id: matchId,
      league_code: row.league_code,
      event_id: candidate.eventId,
      home_name: candidate.homeName,
      away_name: candidate.awayName,
      home_id: candidate.homeId ?? null,
      away_id: candidate.awayId ?? null,
      kickoff: new Date(candidate.kickoff).toISOString(),
      method: "manual",
      linked_at: new Date().toISOString(),
      verdict: null,
      verify_attempts: 0,
    },
    { onConflict: "match_id" },
  );
  if (error) return { error: "Couldn't save the link. Try again.", message: null };

  const now = new Date().toISOString();
  for (const [ourName, theirName, competitorId] of [
    [row.home_name, candidate.homeName, candidate.homeId],
    [row.away_name, candidate.awayName, candidate.awayId],
  ] as const) {
    if (!competitorId || !/^sr:competitor:\d+$/.test(competitorId)) continue;
    const teamKey = normaliseKey(ourName);
    // A manual link overrules whatever was believed about either side.
    await db
      .from("sportybet_competitors")
      .update({ status: "rejected", last_seen: now })
      .eq("league_code", row.league_code)
      .neq("status", "rejected")
      .or(`team_key.eq.${teamKey},competitor_id.eq.${competitorId}`);
    await db.from("sportybet_competitors").upsert(
      {
        competitor_id: competitorId,
        league_code: row.league_code,
        team_key: teamKey,
        team_name: ourName,
        sportybet_name: theirName,
        method: "manual",
        status: "trusted",
        last_seen: now,
      },
      { onConflict: "league_code,team_key,competitor_id" },
    );
  }
  await db.from("sportybet_unresolved").delete().eq("match_id", matchId);
  await logAdminAction(gate.identity, "sportybet.link", matchId, { eventId });
  revalidatePath(PATH);
  return { error: null, message: `Linked ${row.home_name} v ${row.away_name}.` };
}

/** Approves (trusts) or rejects one learned club link. */
export async function judgeLink(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const league = String(formData.get("league") ?? "");
  const teamKey = String(formData.get("teamKey") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "approve" && intent !== "reject") return { error: "Unknown action.", message: null };

  const db = supabaseAdmin();
  const { error } = await db
    .from("sportybet_competitors")
    .update({ status: intent === "approve" ? "trusted" : "rejected", last_seen: new Date().toISOString() })
    .eq("league_code", league)
    .eq("team_key", teamKey)
    .eq("competitor_id", competitorId);
  if (error) return { error: "Couldn't save that. Try again.", message: null };

  if (intent === "reject") {
    // Fixtures matched on structure may have leaned on this link: let the
    // next sync match them again without it.
    await db
      .from("sportybet_event_links")
      .delete()
      .eq("league_code", league)
      .in("method", ["anchor", "elimination", "id"])
      .gte("kickoff", new Date().toISOString());
  }
  await logAdminAction(gate.identity, `sportybet.${intent}`, `${league}:${teamKey}`, { competitorId });
  revalidatePath(PATH);
  return { error: null, message: intent === "approve" ? "Trusted." : "Rejected. It won't be learned again." };
}

/** Runs the sync now, for every competition or one. */
export async function runSync(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const league = String(formData.get("league") ?? "");
  const only = league && LEAGUES.some((l) => l.code === league) ? [league] : undefined;
  const reports = await syncSportyBet(only);
  if (!reports) return { error: "SportyBet direct is switched off.", message: null };
  await logAdminAction(gate.identity, "sportybet.sync", league || "all");
  revalidatePath(PATH);
  const matched = reports.reduce((n, r) => n + r.matched, 0);
  const fixtures = reports.reduce((n, r) => n + r.fixtures, 0);
  const failed = reports.filter((r) => r.error).map((r) => r.league);
  return {
    error: failed.length ? `Failed: ${failed.join(", ")}` : null,
    message: `Matched ${matched} of ${fixtures} upcoming fixtures across ${reports.length} competitions.`,
  };
}

/** Checks finished games' links against their results now, rather than at the next hourly run. */
export async function runVerify(_prev: SportyBetActionState, _formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const report = await verifyFinished();
  if (!report) return { error: "SportyBet direct is switched off.", message: null };
  await logAdminAction(gate.identity, "sportybet.verify", undefined, { ...report });
  revalidatePath(PATH);
  if (report.checked === 0) return { error: null, message: "No finished games waiting to be checked." };
  return {
    error: null,
    message:
      `Checked ${report.checked}: ${report.confirmed} confirmed, ${report.mismatch} mismatched, ` +
      `${report.noResult} with no result, ${report.waiting} not finished yet.`,
  };
}

/**
 * Removes a link that a result contradicted, and stops the matcher trusting
 * the club ids it relied on, so the next sync learns them afresh.
 */
export async function unlinkFixture(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const matchId = String(formData.get("matchId") ?? "");
  const db = supabaseAdmin();
  const { data: link } = await db
    .from("sportybet_event_links")
    .select("league_code, event_id, home_id, away_id")
    .eq("match_id", matchId)
    .maybeSingle();
  if (!link) return { error: "That link is already gone.", message: null };

  const ids = [link.home_id, link.away_id].filter((id): id is string => typeof id === "string" && /^sr:competitor:\d+$/.test(id));
  if (ids.length) {
    await db
      .from("sportybet_competitors")
      .update({ status: "rejected", last_seen: new Date().toISOString() })
      .eq("league_code", link.league_code)
      .in("competitor_id", ids)
      .neq("status", "rejected");
  }
  const { error } = await db.from("sportybet_event_links").delete().eq("match_id", matchId);
  if (error) return { error: "Couldn't remove the link. Try again.", message: null };
  await logAdminAction(gate.identity, "sportybet.unlink", matchId, { eventId: link.event_id, ids });
  revalidatePath(PATH);
  return { error: null, message: "Unlinked. Both clubs will be learned again." };
}

/** Finds SportyBet tournaments for every competition without a hand-set id, now. */
export async function runDiscover(_prev: SportyBetActionState, _formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const reports = await discoverTournaments();
  if (!reports) return { error: "SportyBet didn't answer, or direct is switched off.", message: null };
  await logAdminAction(gate.identity, "sportybet.discover", undefined, { found: reports.length });
  revalidatePath(PATH);
  const trusted = reports.filter((r) => r.decision === "trusted").length;
  const pending = reports.filter((r) => r.decision === "pending").length;
  return {
    error: null,
    message: `Checked ${reports.length} competitions with fixtures: ${trusted} found, ${pending} to check.`,
  };
}

/** Accepts or rejects a discovered tournament for one competition. */
export async function judgeTournament(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const league = String(formData.get("league") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "approve" && intent !== "reject") return { error: "Unknown action.", message: null };
  const { error } = await supabaseAdmin()
    .from("sportybet_tournaments")
    // An approval is final (manual); a rejection only blocks this tournament
    // id, so a different, right one can still be found later.
    .update({
      status: intent === "approve" ? "trusted" : "rejected",
      method: intent === "approve" ? "manual" : "discovered",
      updated_at: new Date().toISOString(),
    })
    .eq("league_code", league);
  if (error) return { error: "Couldn't save that. Try again.", message: null };
  forgetTournaments();
  await logAdminAction(gate.identity, `sportybet.tournament.${intent}`, league);
  revalidatePath(PATH);
  return { error: null, message: intent === "approve" ? "In use from the next sync." : "Rejected; it won't be proposed again." };
}

/** Takes a community code off the Code Hub (code_hub_posts). */
export async function removePost(_prev: SportyBetActionState, formData: FormData): Promise<SportyBetActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const id = Number(formData.get("postId"));
  if (!Number.isInteger(id)) return { error: "Unknown post.", message: null };
  const { error } = await supabaseAdmin().from("code_hub_posts").update({ status: "removed" }).eq("id", id);
  if (error) return { error: "Couldn't remove that. Try again.", message: null };
  await logAdminAction(gate.identity, "code_hub.post.remove", String(id));
  revalidatePath(PATH);
  return { error: null, message: "Removed. It leaves the Code Hub within a minute." };
}
