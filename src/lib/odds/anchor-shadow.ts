/**
 * Reads the 1X2 and over/under 2.5 prices out of one sportybet_price_history
 * row ({"1|": {"1": [odds, p], "2": ..., "3": ...}, "18|total=2.5": {"12": over, "13": under}}).
 * Pure; null where either market is missing or a price is not a real one.
 */
export interface BoardPrices {
  oneXTwo: { home: number; draw: number; away: number };
  overUnder: { over: number; under: number };
}

type Prices = Record<string, Record<string, [number, number] | undefined> | undefined>;

export function boardPrices(prices: unknown): BoardPrices | null {
  const p = prices as Prices | null;
  const odds = (market: string, id: string) => Number(p?.[market]?.[id]?.[0]);
  const out = {
    oneXTwo: { home: odds("1|", "1"), draw: odds("1|", "2"), away: odds("1|", "3") },
    overUnder: { over: odds("18|total=2.5", "12"), under: odds("18|total=2.5", "13") },
  };
  const all = [...Object.values(out.oneXTwo), ...Object.values(out.overUnder)];
  return all.every((x) => Number.isFinite(x) && x > 1.01 && x < 200) ? out : null;
}
