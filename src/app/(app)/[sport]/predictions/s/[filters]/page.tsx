import type { Metadata } from "next";
import { loadPicks, parsePickQuery } from "@/lib/pick-feed";
import { pickParams } from "@/lib/pick-query";
import { freeViewer } from "@/lib/service";
import { PredictionsView, predictionsMetadata } from "@/components/match/predictions-view";

/**
 * The Picks page as a signed-out visitor sees it, cached and refreshed every
 * five minutes in the background (ISR). src/proxy.ts rewrites signed-out
 * requests for /<sport>/predictions?<filters> here, keeping the address bar
 * as it was, so nobody waits on the modelling behind it: the page that
 * answers was built before they arrived. Signed-in visitors get the live
 * render instead (predictions/page.tsx), where their plan and leagues apply.
 *
 * Nothing in this render may read cookies or headers, or it stops being
 * cacheable. The filters come in as one path segment (lib/pick-query.ts).
 */

export const revalidate = 300;

export function generateStaticParams() {
  return [{ filters: "all" }];
}

export async function generateMetadata({ params }: { params: Promise<{ filters: string }> }): Promise<Metadata> {
  // Never noindex: search engines are signed out, so this IS the Picks page
  // they read. The canonical points at the real address, which also covers
  // anyone reaching this one directly.
  return predictionsMetadata(pickParams((await params).filters).league);
}

export default async function CachedPredictionsPage({ params }: { params: Promise<{ filters: string }> }) {
  const q = parsePickQuery(pickParams((await params).filters));
  const data = await loadPicks(q, { withBest: true, viewer: await freeViewer() });
  return <PredictionsView q={q} data={data} />;
}
