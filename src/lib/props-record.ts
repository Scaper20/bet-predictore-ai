import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { PROP_MARKETS, type PropMarketKey } from "@/lib/model/player-props";

/**
 * Every player-prop pick logged (shadow and published), graded, per market:
 * for the admin model-performance page, which decides when the player_props
 * switch goes on. Read by a verified admin only (requirePermission).
 */

export interface PropMarketRecord {
  market: PropMarketKey;
  graded: number;
  landed: number | null;
  stated: number | null;
  /** SportyBet's own chance on the same picks (margin out), where known. */
  bookStated: number | null;
  price: number | null;
  voids: number;
  pending: number;
}

export interface PropsRecord {
  firstLogged: string | null;
  /** Days since the first logged pick. */
  days: number;
  graded: number;
  landed: number | null;
  stated: number | null;
  bookStated: number | null;
  markets: PropMarketRecord[];
}

export async function getPropsRecord(): Promise<PropsRecord> {
  const { data, error } = await supabaseAdmin()
    .from("player_prop_picks")
    .select("market, probability, market_probability, price, result, logged_at")
    .gte("logged_at", new Date(Date.now() - 180 * 86_400_000).toISOString())
    .order("logged_at")
    .limit(20_000);
  const rows = error ? [] : (data ?? []);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const summarise = (rs: typeof rows) => {
    const g = rs.filter((r) => r.result === "win" || r.result === "lose");
    const withBook = g.filter((r) => r.market_probability !== null);
    return {
      graded: g.length,
      landed: g.length ? g.filter((r) => r.result === "win").length / g.length : null,
      stated: mean(g.map((r) => Number(r.probability))),
      bookStated: mean(withBook.map((r) => Number(r.market_probability))),
      price: mean(g.filter((r) => r.price !== null).map((r) => Number(r.price))),
      voids: rs.filter((r) => r.result === "void" || r.result === "push").length,
      pending: rs.filter((r) => r.result === null).length,
    };
  };
  const all = summarise(rows);
  return {
    firstLogged: rows[0]?.logged_at ?? null,
    days: rows[0]?.logged_at ? Math.floor((Date.now() - Date.parse(rows[0].logged_at)) / 86_400_000) : 0,
    graded: all.graded,
    landed: all.landed,
    stated: all.stated,
    bookStated: all.bookStated,
    markets: PROP_MARKETS.map((m) => ({ market: m, ...summarise(rows.filter((r) => r.market === m)) })).filter((m) => m.graded + m.pending + m.voids > 0),
  };
}
