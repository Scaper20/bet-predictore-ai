import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Love and comment counts for a page of For You picks: ?ids=a,b,c */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 120)
    .slice(0, 40);
  if (!supabaseConfigured || ids.length === 0) return NextResponse.json({ counts: {} }, { headers: NO_STORE });

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("pick_social_counts", { p_match_ids: ids });
  if (error) return NextResponse.json({ counts: {} }, { headers: NO_STORE });

  const counts: Record<string, { loves: number; comments: number; loved: boolean }> = {};
  for (const r of (data ?? []) as { match_id: string; loves: number; comments: number; loved: boolean }[]) {
    counts[r.match_id] = { loves: Number(r.loves), comments: Number(r.comments), loved: r.loved };
  }
  return NextResponse.json({ counts }, { headers: NO_STORE });
}
