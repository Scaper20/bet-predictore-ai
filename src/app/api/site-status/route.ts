import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Whether maintenance mode is on — polled by every open tab
 * (components/layout/maintenance-watcher.tsx) so people already on the site
 * are moved to the maintenance page without having to click anything.
 *
 * The same answer for everyone, so it's shared-cached for a few seconds:
 * thousands of open tabs cost the database one read per cache window.
 */
export async function GET() {
  const db = supabasePublic();
  let maintenance = false;
  if (db) {
    const { data } = await db.from("site_settings").select("maintenance_enabled").maybeSingle();
    maintenance = data?.maintenance_enabled === true;
  }
  return NextResponse.json(
    { maintenance },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } },
  );
}
