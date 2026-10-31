import type { Metadata } from "next";
import { getPreferences } from "@/lib/preferences";
import { loadPicks, parsePickQuery } from "@/lib/pick-feed";
import { PredictionsView, predictionsMetadata } from "@/components/match/predictions-view";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  return predictionsMetadata((await searchParams).league);
}

export const revalidate = 300;

/**
 * The live Picks page, for signed-in visitors: their plan decides what is
 * locked and the leagues they follow lead each day. Signed-out visitors never
 * reach this render; the proxy serves them the cached copy
 * (predictions/s/[filters]), which is the same view built for a free viewer.
 */
export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; tier?: string; risk?: string; sort?: string; family?: string }>;
}) {
  const q = parsePickQuery(await searchParams);
  const followed = getPreferences().then((p) => p.leagues);
  const data = await loadPicks({ ...q, followed }, { withBest: true });
  return <PredictionsView q={q} data={data} />;
}
