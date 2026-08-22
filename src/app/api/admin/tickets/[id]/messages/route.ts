import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Lets an open admin ticket view poll for the user's incoming replies
 * without a full page refresh — same "feels live" requirement as the
 * user-facing widget, gated the admin way (checkAdmin, not RLS). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });

  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from("support_messages")
    .select("id, sender_role, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Could not load messages." }, { status: 502, headers: NO_STORE });
  return NextResponse.json({ messages: data ?? [] }, { headers: NO_STORE });
}
