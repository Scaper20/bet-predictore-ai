import { evaluatePick } from "@/lib/settlement";

export type LiveState = "won" | "lost" | "winning" | "losing" | "level";

/**
 * A goal pick against the score so far. Goals only ever go up, so a total
 * already past an over line has won and past an under line has lost, and both
 * teams having scored settles that market; every other pick is only "winning"
 * or "losing" until full time.
 */
export function liveState(market: string, home: number, away: number): LiveState | null {
  const [family, side, l] = market.split(":");
  const total = home + away;
  if (family === "ou") {
    const n = Number(l);
    if (total > n) return side === "over" ? "won" : "lost";
    return side === "over" ? "losing" : "winning";
  }
  if (family === "btts") {
    const both = home > 0 && away > 0;
    if (both) return side === "yes" ? "won" : "lost";
    return side === "yes" ? "losing" : "winning";
  }
  const now = evaluatePick(market, home, away);
  if (!now) return null;
  return now === "win" ? "winning" : now === "lose" ? "losing" : "level";
}
