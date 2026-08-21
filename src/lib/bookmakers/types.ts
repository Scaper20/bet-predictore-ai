import type { SlipLeg } from "@/lib/slip";

export type MarketFamily = "1x2" | "dc" | "ou" | "btts" | "cs" | "ah";

/** `leg.market` ids are colon-delimited, e.g. "1x2:home", "ou:over:2.5", "ah:home:-1". */
export function marketFamily(marketId: string): MarketFamily | null {
  const prefix = marketId.split(":")[0];
  return prefix === "1x2" || prefix === "dc" || prefix === "ou" || prefix === "btts" || prefix === "cs" || prefix === "ah"
    ? prefix
    : null;
}

export interface BookmakerAdapter {
  id: string;
  name: string;
  /**
   * How this bookmaker's app labels each market family in its own menu —
   * best-effort, based on how these markets are commonly labelled, not a
   * guarantee of the exact current wording (apps change their copy). The
   * point is pointing a user at the right section fast, not a pixel-perfect
   * replica. A future `generateBookingCode?(legs)` could plug in per-adapter
   * if a real partner API is ever secured — deliberately not built now (see
   * the Quick-Slip feature note in the /slip page).
   */
  marketMenuLabel: Record<MarketFamily, string>;
}

export interface FormattedSelection {
  fixture: string;
  menu: string;
  selection: string;
}

export function formatForBookmaker(adapter: BookmakerAdapter, leg: SlipLeg): FormattedSelection | null {
  const family = marketFamily(leg.market);
  if (!family) return null;
  return { fixture: leg.fixture, menu: adapter.marketMenuLabel[family], selection: leg.label };
}
