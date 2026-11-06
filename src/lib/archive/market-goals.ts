import "server-only";

import { marketGoals } from "@/lib/model/market-goals";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Fills historical_results.home_mkt_goals / away_mkt_goals (0102) from the
 * closing prices in odds_snapshots.
 *
 * The same football-data.co.uk file that supplies a finished game's score
 * supplies its market-average closing 1X2 and over/under 2.5 prices, both
 * keyed by league, kickoff day and club names, so the two join exactly (94-96%
 * of the top leagues' games over the last two seasons, about half in the other
 * leagues, whose odds history is shorter). Runs nightly for the recent weeks
 * after the archive top-up, and with a large window to backfill the past
 * (scripts/backfill-market-goals.ts). Idempotent: a rerun solves the same
 * numbers and rewrites the same values.
 */
const PAGE = 1000;
const WRITE_BATCH = 400;

interface Closing {
  league_code: string;
  kickoff: string;
  home_name: string;
  away_name: string;
  market: string;
  prices: Record<string, number>;
  captured_at: string;
}

/**
 * @param sinceDays  how far back to look
 * @param skipDays   leave out the most recent days, to backfill a window at a time
 */
export async function fillMarketGoals(sinceDays = 60, skipDays = 0, now = new Date()): Promise<{ priced: number; written: number }> {
  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    return { priced: 0, written: 0 };
  }
  const since = new Date(now.getTime() - (sinceDays + skipDays) * 86_400_000).toISOString();
  const until = new Date(now.getTime() - skipDays * 86_400_000).toISOString();

  // One closing snapshot a fixture and market from the market average; paged, as
  // the API returns at most a thousand rows a request.
  const byGame = new Map<string, { row: Closing; one?: { home: number; draw: number; away: number }; ou?: { over: number; under: number } }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("odds_snapshots")
      .select("league_code, kickoff, home_name, away_name, market, prices, captured_at")
      .eq("is_closing", true)
      .eq("bookmaker", "market_avg")
      .in("market", ["1x2", "over_under"])
      .gte("kickoff", since)
      .lt("kickoff", until)
      .order("kickoff", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as Closing[]) {
      const day = new Date(r.kickoff).toISOString().slice(0, 10);
      const key = `${r.league_code}|${day}|${r.home_name}|${r.away_name}`;
      const slot = byGame.get(key) ?? { row: r };
      if (r.market === "1x2") {
        const { home, draw, away } = r.prices;
        slot.one = { home, draw, away };
      } else if (Number(r.prices.line) === 2.5) {
        slot.ou = { over: r.prices.over, under: r.prices.under };
      }
      byGame.set(key, slot);
    }
    if (data.length < PAGE) break;
  }

  const solved: { league_code: string; day: string; home_name: string; away_name: string; home: number; away: number }[] = [];
  for (const { row, one, ou } of byGame.values()) {
    if (!one || !ou) continue;
    const g = marketGoals(one, ou);
    if (!g) continue;
    solved.push({
      league_code: row.league_code,
      day: new Date(row.kickoff).toISOString().slice(0, 10),
      home_name: row.home_name,
      away_name: row.away_name,
      home: Math.round(g[0] * 1000) / 1000,
      away: Math.round(g[1] * 1000) / 1000,
    });
  }

  let written = 0;
  for (let i = 0; i < solved.length; i += WRITE_BATCH) {
    const { data, error } = await admin.rpc("set_market_goals", { p_rows: solved.slice(i, i + WRITE_BATCH) });
    if (error) {
      console.error("market goals write failed:", error.message);
      break;
    }
    written += typeof data === "number" ? data : 0;
  }
  return { priced: solved.length, written };
}
