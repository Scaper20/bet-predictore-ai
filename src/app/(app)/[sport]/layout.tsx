import { notFound } from "next/navigation";
import { SPORTS, isSportId } from "@/lib/sports";

/**
 * The sport segment.
 *
 * Prerendering the known sports keeps every child on the caching behaviour it
 * had before the segment existed: `params` is not a dynamic API, so the
 * revalidate windows on /fixtures, /predictions, /trends and /match/[id]
 * survive the move untouched. Nothing here reads cookies() or a Supabase
 * session — see the comment in the parent layout for why that matters.
 */
export function generateStaticParams() {
  return SPORTS.map((sport) => ({ sport: sport.id }));
}

export default async function SportLayout({ children, params }: LayoutProps<"/[sport]">) {
  const { sport } = await params;

  // An unknown sport is a 404, not an empty football page. Deliberately not
  // `dynamicParams = false`: that cascades to child segments and 404s every
  // /match/[id] page not prerendered at build — i.e. all of them.
  if (!isSportId(sport)) notFound();

  return <>{children}</>;
}
