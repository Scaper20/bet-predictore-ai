import { NextResponse } from "next/server";
import { fairChanceOn, priceInSnapshot } from "@/lib/odds/market-prob";
import { priceOn, toSportyBet } from "@/lib/odds/markets";
import { listingsFor } from "@/lib/odds/sportybet";
import { latestSnapshots } from "@/lib/odds/sportybet-links";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { upcomingFeed, predictBatch } from "@/lib/service";
import { runSettlementPass } from "@/lib/settlement-runner";
import { modelIdForMarket } from "@/lib/model/router";
import { pickTier } from "@/lib/model/tiers";
import { leagueByCode } from "@/lib/leagues";
import { newMarketShadow, shadowPicks } from "@/lib/model/shadow";
import { marketTotalPicks } from "@/lib/model/market-total";

// Runs the football providers and Supabase's service-role client — both
// Node-only. Proxy (src/proxy.ts) doesn't touch /api/ at all, so no session
// cookie handling is relevant here either.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Track Record maintenance: log today/tomorrow's headline picks, then settle
 * any previously-logged pick whose kickoff has passed.
 *
 * Wired up via vercel.json as a daily Vercel Cron job (Hobby plan caps cron
 * to once/day regardless of the schedule string). This is now just the
 * full-backlog safety net — the actual near-real-time settlement runs
 * opportunistically off of every /api/live poll (src/app/api/live/route.ts),
 * which isn't bound by cron frequency at all. This route still matters for
 * matches nobody had a live view open for.
 *
 * Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET` when
 * that env var is set — required here (not optional like the rest of this
 * app's Supabase config) because, unlike a read-only page, this endpoint
 * writes to the DB.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const logged = await logUpcomingPicks(admin);
  const settled = await runSettlementPass(admin);
  // The training archive tops up in its own job (cron/refresh-archive).
  return NextResponse.json({ logged, settled });
}

async function logUpcomingPicks(admin: ReturnType<typeof supabaseAdmin>): Promise<number> {
  const { matches: feed } = await upcomingFeed(2);
  // Only games that have not started. The upsert below overwrites by match
  // id, so a game already under way must never be re-logged: its pick and
  // tier are frozen at the last pre-kickoff run.
  const now = Date.now();
  const matches = feed.filter((m) => m.status === "scheduled" && Date.parse(m.kickoff) > now);
  if (matches.length === 0) return 0;

  const predictions = await predictBatch(matches, matches.length);
  const rows = predictions
    .filter((p) => p.sufficiency.publishable && p.topPick)
    .map((p) => ({
      match_id: p.match.id,
      // The catalogue's own name wherever the code is known, so one league is
      // spelled one way on the record whichever feed answered. The code is
      // still what every aggregate groups on (0013_league_code.sql); the
      // feed's name is only the fallback for a league outside the catalogue.
      league: (p.match.league.code && leagueByCode(p.match.league.code)?.name) || p.match.league.name,
      league_code: p.match.league.code ?? null,
      home_name: p.match.home.name,
      away_name: p.match.away.name,
      kickoff: p.match.kickoff,
      market: p.topPick!.market,
      label: p.topPick!.label,
      probability: p.topPick!.probability,
      fair_odds: p.topPick!.fairOdds,
      // Stamped from the MARKET rather than from whichever model happens to
      // be active, so the attribution is already correct on the day a second
      // model starts publishing — its picks separate from KiqStat Strike's
      // without this line changing. The column default only exists to
      // backfill rows written before 0012.
      model_id: modelIdForMarket(p.topPick!.market),
      // Fixed before kickoff, like everything else on the row; the Strong
      // record is only honest because nothing decides a tier after a result.
      confidence: Math.round(p.topPick!.confidence),
      pick_tier: pickTier(p.topPick!.confidence, p.match.league.code),
    }));

  if (rows.length === 0) return 0;

  // SportyBet's price beside each pick, as it stood at this (last pre-kickoff)
  // log run, with the market's fair probability. Closing prices are stamped
  // at settlement; the pair is what closing line value is measured from.
  // Where no snapshot was taken, the competition's stored board carries the
  // same prices (and every market, so handicaps and stat legs too).
  const [latest, listings] = await Promise.all([
    latestSnapshots(predictions.map((p) => p.match.id)),
    listingsFor(predictions.map((p) => p.match), 10_000).catch(() => new Map()),
  ]);
  const priced = (matchId: string, market: string) => {
    const snap = latest.get(matchId);
    const price = snap ? priceInSnapshot(snap.prices, market) : null;
    if (price) return { price_at_publish: price.odds, market_prob_at_publish: price.fairProbability };
    const listed = listings.get(matchId)?.markets;
    const sel = toSportyBet(market);
    const fair = listed ? fairChanceOn(market, listed) : null;
    const odds = listed && sel ? priceOn(sel, listed) : undefined;
    return {
      price_at_publish: fair !== null ? (odds ?? null) : null,
      market_prob_at_publish: fair !== null ? Math.round(fair * 10_000) / 10_000 : null,
    };
  };
  for (const row of rows) Object.assign(row, priced(row.match_id, row.market));

  const { error } = await admin.from("predictions_log").upsert(rows, { onConflict: "match_id" });
  if (error) throw error;

  // Watched, not published: the paused handicaps and GG/NG. Best effort, so a
  // missing table (before 0059) never stops the real log.
  const shadow = predictions
    .filter((p) => p.sufficiency.publishable)
    .flatMap((p) =>
      shadowPicks(p).map((s) => ({
        match_id: p.match.id,
        market: s.market,
        label: s.label,
        probability: Math.round(s.probability * 10_000) / 10_000,
        reason: s.reason,
        league_code: p.match.league.code ?? null,
        home_name: p.match.home.name,
        away_name: p.match.away.name,
        kickoff: p.match.kickoff,
        logged_at: new Date().toISOString(),
        ...priced(p.match.id, s.market),
      })),
    );
  // Market-informed totals, watched beside the model (model/market-total.ts):
  // only where SportyBet prices over/under 2.5 for the game.
  const marketTotals = predictions
    .filter((p) => p.sufficiency.publishable)
    .flatMap((p) => {
      const snap = latest.get(p.match.id);
      const over = snap ? priceInSnapshot(snap.prices, "ou:over:2.5")?.fairProbability : undefined;
      if (over === undefined) return [];
      return marketTotalPicks(p.markets.expectedGoals, p.model.rho, over).map((m) => ({
        match_id: p.match.id,
        market: m.market,
        label: m.label,
        probability: m.probability,
        model_probability: m.modelProbability,
        reason: "market-total",
        league_code: p.match.league.code ?? null,
        home_name: p.match.home.name,
        away_name: p.match.away.name,
        kickoff: p.match.kickoff,
        logged_at: new Date().toISOString(),
        ...priced(p.match.id, m.market),
      }));
    });
  if (marketTotals.length > 0) {
    await admin.from("shadow_picks").upsert(marketTotals, { onConflict: "match_id,market" }).then(
      () => undefined,
      () => undefined,
    );
  }
  if (shadow.length > 0) {
    await admin.from("shadow_picks").upsert(shadow, { onConflict: "match_id,market" }).then(
      () => undefined,
      () => undefined,
    );
  }
  // The new goal markets (halves, goal bounds), on their own call: before 0079
  // allows their reason, the rows are refused without touching the ones above.
  const newMarkets = predictions
    .filter((p) => p.sufficiency.publishable)
    .flatMap((p) =>
      newMarketShadow(p).map((s) => ({
        match_id: p.match.id,
        market: s.market,
        label: s.label,
        probability: s.probability,
        reason: s.reason,
        league_code: p.match.league.code ?? null,
        home_name: p.match.home.name,
        away_name: p.match.away.name,
        kickoff: p.match.kickoff,
        logged_at: new Date().toISOString(),
      })),
    );
  if (newMarkets.length > 0) {
    await admin.from("shadow_picks").upsert(newMarkets, { onConflict: "match_id,market" }).then(
      () => undefined,
      () => undefined,
    );
  }
  return rows.length;
}
