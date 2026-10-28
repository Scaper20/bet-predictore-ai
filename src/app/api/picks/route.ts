import { NextResponse } from "next/server";
import { loadPicks, parsePickQuery } from "@/lib/pick-feed";
import { PICK_BATCH } from "@/lib/pick-list";
import { getPreferences } from "@/lib/preferences";

/**
 * The next batch of the Picks page's list, for components/match/pick-list.tsx
 * as the visitor scrolls. Same filters and order as the page (lib/pick-feed.ts),
 * so `offset` lines up with what is already on screen. Per viewer (locked
 * picks depend on the plan), so never cached by a CDN; the modelling behind
 * it is cached for five minutes in predictBatch.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = parsePickQuery({
    league: url.searchParams.get("league"),
    tier: url.searchParams.get("tier"),
    risk: url.searchParams.get("risk"),
    sort: url.searchParams.get("sort"),
    family: url.searchParams.get("family"),
  });
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const preferences = await getPreferences();
  const { rows } = await loadPicks({ ...q, followed: preferences.leagues });
  return NextResponse.json(
    { rows: rows.slice(offset, offset + PICK_BATCH), total: rows.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
