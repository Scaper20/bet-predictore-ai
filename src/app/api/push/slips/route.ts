import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sourceKeyForId } from "@/lib/providers/db-source";
import { isAllowedPushEndpoint } from "@/lib/push/subscription";
import { readJson, rejectCrossSite } from "@/lib/push/request";
import { MAX_SLIPS_PER_DEVICE, parseSlip } from "@/lib/push/slips";

export const dynamic = "force-dynamic";

/**
 * The slips this device is tracking, copied to the server so a result can
 * reach it with the app closed (lib/push/events.ts grades them as games
 * finish).
 *
 * POST adds a slip, or refreshes one already held. DELETE removes it. Like
 * the other push routes the device's own endpoint is the proof of ownership,
 * and it works signed out: tracking itself does.
 */

type Db = ReturnType<typeof supabaseAdmin>;

/** Our matches row behind a public match id (fd:123, sdb:456, db:uuid), or null when none is known. */
async function matchUuid(db: Db, id: string): Promise<string | null> {
  const key = sourceKeyForId(id);
  if (!key) return null;
  if (key.kind === "id") return /^[0-9a-f-]{36}$/i.test(key.value) ? key.value : null;
  const { data } = await db.from("matches").select("id").contains("source_ids", key.value).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

async function subscriptionId(db: Db, endpoint: unknown): Promise<string | null | "invalid"> {
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) return "invalid";
  const { data } = await db.from("push_subscriptions").select("id").eq("endpoint", endpoint).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  if (!supabaseConfigured) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await readJson(request);
  const slip = parseSlip(body?.slip);
  if (!slip) return NextResponse.json({ error: "Invalid slip" }, { status: 400 });

  const db = supabaseAdmin();
  const sub = await subscriptionId(db, body?.endpoint);
  if (sub === "invalid") return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  if (sub === null) return NextResponse.json({ error: "Turn notifications on first" }, { status: 404 });

  const uuids = await Promise.all([...new Set(slip.legs.map((l) => l.matchId))].map((id) => matchUuid(db, id)));
  const known = uuids.filter((u): u is string => u !== null);
  // A game we cannot watch through the matches table is looked at on a timer instead.
  const needsPoll = slip.needsPoll || uuids.some((u) => u === null);

  const { data: existing } = await db
    .from("push_tracked_slips")
    .select("id, results")
    .eq("subscription_id", sub)
    .eq("slip_id", slip.slipId)
    .maybeSingle();

  const fields = {
    legs: slip.legs,
    match_uuids: known,
    needs_poll: needsPoll,
    first_kickoff: slip.firstKickoff,
    last_kickoff: slip.lastKickoff,
  };
  const { error } = existing
    ? // Games the device watched finish are not announced again: its results join the server's.
      await db
        .from("push_tracked_slips")
        .update({ ...fields, results: { ...slip.results, ...(existing.results as object) } })
        .eq("id", existing.id)
    : // Only a new row is seeded with what the device already shows as settled.
      await db.from("push_tracked_slips").insert({ subscription_id: sub, slip_id: slip.slipId, results: slip.results, ...fields });
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  // The newest few stay; the oldest give way.
  const { data: all } = await db
    .from("push_tracked_slips")
    .select("id")
    .eq("subscription_id", sub)
    .order("created_at", { ascending: false });
  const extra = (all ?? []).slice(MAX_SLIPS_PER_DEVICE).map((r) => r.id as string);
  if (extra.length > 0) await db.from("push_tracked_slips").delete().in("id", extra);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  if (!supabaseConfigured) return NextResponse.json({ ok: true });

  const body = await readJson(request);
  const slipId = body?.slipId;
  if (typeof slipId !== "string" || slipId.length > 64) return NextResponse.json({ error: "Invalid slip" }, { status: 400 });

  const db = supabaseAdmin();
  const sub = await subscriptionId(db, body?.endpoint);
  if (sub === "invalid") return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  if (sub !== null) await db.from("push_tracked_slips").delete().eq("subscription_id", sub).eq("slip_id", slipId);
  return NextResponse.json({ ok: true });
}
