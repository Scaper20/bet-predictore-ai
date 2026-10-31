import { NextResponse } from "next/server";
import { loadPicks, parsePickQuery } from "@/lib/pick-feed";
import { PICK_BATCH } from "@/lib/pick-list";
import { freeViewer } from "@/lib/service";

/**
 * The next batch of the Picks list as a signed-out visitor sees it. The
 * proxy sends signed-out requests for /api/picks here; nothing in it depends
 * on who asks, so the CDN may hold each batch for five minutes and serve it
 * stale while it refreshes, like the cached page it continues.
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
  const { rows } = await loadPicks(q, { viewer: await freeViewer() });
  return NextResponse.json(
    { rows: rows.slice(offset, offset + PICK_BATCH), total: rows.length },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
  );
}
