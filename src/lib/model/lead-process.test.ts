import { describe, expect, it } from "vitest";
import event from "@/lib/odds/__fixtures__/sportybet-event-markets.json";
import { parseEventMarkets } from "@/lib/odds/sportybet-api";
import { halfRates } from "./halves";
import { leadChance } from "./lead-process";

/* Milan v Bologna as SportyBet priced it (59% / 23% / 18%), and the model's split of a 1.75 v 0.85 game. */
const markets = parseEventMarkets(event)!;
const rates = halfRates(1.75, 0.85, { home: 0.443, away: 0.443 }, 0.1, 0.1);
const book = (marketId: string, outcomeId: string, specifier?: string) =>
  Number(
    markets
      .find((m) => String(m.market_id) === marketId && (m.specifier ?? undefined) === specifier)
      ?.outcomes?.find((o) => String(o.id) === outcomeId)?.probability,
  );

describe("leadChance", () => {
  it("lands near SportyBet's own book on the markets people play", () => {
    for (const [id, outcome, spec] of [
      ["60200", "1"], ["60200", "2"], ["60100", "1"], ["60100", "3"], ["60110", "9"], ["60110", "11"],
      ["60300", "74"], ["60301", "74"], ["60304", "74"], ["8", "6", "goalnr=1"], ["8", "7", "goalnr=1"], ["100", "584", "goalnr=1"], ["101", "604", "goalnr=1"],
      ["60010", "74"], ["60011", "74"], ["900069", "1", "minute=50"], ["900313", "30", "minute=25|total=0.5"],
    ] as const) {
      const mine = leadChance({ marketId: id, outcomeId: outcome, ...(spec ? { specifier: spec } : {}) }, rates)!;
      expect(Math.abs(mine - book(id, outcome, spec)), `${id} ${outcome}`).toBeLessThan(0.05);
    }
  });

  it("keeps 1UP's rule: a side that goes a goal up has won, whatever the score after", () => {
    const up = leadChance({ marketId: "60200", outcomeId: "1" }, rates)!;
    const led = leadChance({ marketId: "60303", outcomeId: "74" }, rates)!;
    expect(up).toBeCloseTo(led, 10);
    // More than the plain home win: some leads are lost.
    expect(up).toBeGreaterThan(book("1", "1") + 0.08);
  });

  it("leaves Never Down and early goals to SportyBet's read", () => {
    expect(leadChance({ marketId: "60210", outcomeId: "1" }, rates)).toBeNull();
    expect(leadChance({ marketId: "60180", outcomeId: "12", specifier: "minsnr=10|total=1.5" }, rates)).toBeNull();
  });
});
