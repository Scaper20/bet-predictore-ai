import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { isPaidTier } from "@/lib/access";
import { matchRowId } from "@/lib/match-details";
import { matchPropRows, playerPropRows, propsLive } from "@/lib/props-board";
import { viewProps } from "@/lib/props-view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A match's public id, as in its URL (fd:575377, sdb:2594616, db:<uuid>). */
const PUBLIC_ID = /^(fd|sdb|db):[0-9a-z-]{1,60}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * One game's or one player's props for the viewer's plan (match and player
 * pages load them here so those pages stay cached). Redacted on the server:
 * a free viewer gets facts only (src/lib/props-view.ts).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const match = url.searchParams.get("match");
  const player = url.searchParams.get("player");
  const byMatch = Boolean(match && PUBLIC_ID.test(match));
  if (!byMatch && (!player || !UUID.test(player))) {
    return NextResponse.json({ error: "match or player id required" }, { status: 400, headers: NO_STORE });
  }
  const load = async () => {
    if (!byMatch) return playerPropRows(player!);
    const rowId = await matchRowId(match!);
    return rowId ? matchPropRows(rowId) : [];
  };
  const [entitlement, rows, live] = await Promise.all([getEntitlement(), load().catch(() => []), propsLive()]);
  const paid = isPaidTier(entitlement.tier);
  return NextResponse.json({ paid, live, rows: viewProps(rows, paid) }, { headers: NO_STORE });
}
