import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_TIER_ID, HUB_LIVE_TIERS, hubDay, hubTier } from "@/lib/code-hub";
import { paidUserIds } from "@/lib/paid-users";
import {
  communityPayload,
  hubCodesPayload,
  slipPayload,
  type CommunityNote,
  type HubCodeNote,
  type PushPayload,
} from "@/lib/push/messages";
import { pushConfigured, sendPushBatch, summarise, type BatchResult } from "@/lib/push/send";
import { loadDevices, recordOutcome, type StoredSubscription } from "@/lib/push/store";
import { legScoresFor } from "@/lib/slip-scores";
import { legsToPoll, type LegResult, type LegScore, type TrackedLeg } from "@/lib/slip-tracker";
import { gradeSlip } from "@/lib/push/slips";
import { statKindOf } from "@/lib/settlement";
import { switchOn } from "@/lib/switches";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The real-time notifications: today's Code Hub codes, community codes, and
 * the results of slips a device is tracking.
 *
 * Each dispatcher finds what has happened and not yet been announced, claims
 * it (push_events_sent, a primary key, so two overlapping runs cannot both
 * send), and sends to the devices that want it. They are called twice over:
 * straight away by whatever made the event (booking a code, posting one) and
 * every minute by /api/cron/push-events, which catches whatever the first
 * missed. Claiming makes that safe.
 *
 * Everything here degrades to "nothing sent": no VAPID keys, no devices, the
 * Code Hub still on its waitlist.
 */

const iso = (t: number) => new Date(t).toISOString();

/** Community notifications are grouped: at most one this often. */
export const COMMUNITY_GAP_MS = 5 * 60_000;
/** A code the cron finds this soon after booking may be one of several still being booked. */
const BOOKING_SETTLE_MS = 90_000;
/** Slips graded in one run. */
const SLIP_BATCH = 500;
/** The margin taken off "checked at", so a game finishing in the same second as a run is looked at again. */
const CHECK_MARGIN_MS = 30_000;

export interface Dispatched {
  /** Events found and claimed. */
  events: number;
  sent: number;
  gone: number;
  failed: number;
  note?: string;
}

const NOTHING: Dispatched = { events: 0, sent: 0, gone: 0, failed: 0 };

/** Which of these keys were not claimed before: the ones this run owns. */
async function claim(admin: SupabaseClient, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { data } = await admin
    .from("push_events_sent")
    .upsert(keys.map((key) => ({ key })), { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  return new Set((data ?? []).map((r) => r.key as string));
}

async function deliver(
  admin: SupabaseClient,
  items: { id: string; target: StoredSubscription; payload: PushPayload }[],
  ttlSeconds: number,
  topic?: string,
): Promise<BatchResult> {
  // High urgency wakes the phone: these are worth hearing at once, and useless late.
  const result = await sendPushBatch(items, { ttl: ttlSeconds, urgency: "high", topic });
  await recordOutcome(admin, result);
  return result;
}

/* --------------------------------------------------------------- codes */

/**
 * Today's Code Hub codes, as each gets its SportyBet code. `settled` is true
 * when the caller has just finished booking the day's codes, so they go out
 * together; the cron leaves anything booked in the last minute and a half to
 * the booking run that is probably still going.
 */
export async function dispatchHubCodes(opts: { settled?: boolean } = {}): Promise<Dispatched> {
  if (!pushConfigured) return { ...NOTHING, note: "VAPID keys are not configured" };
  // Still on its waitlist: nothing is claimed, so the codes are announced the day it opens.
  if (!(await switchOn("code_hub_open"))) return { ...NOTHING, note: "Code Hub is not open yet" };
  const admin = supabaseAdmin();
  const day = hubDay();
  const cutoff = opts.settled ? Date.now() : Date.now() - BOOKING_SETTLE_MS;

  const { data } = await admin
    .from("code_hub_codes")
    .select("tier, booked_at")
    .eq("day", day)
    .not("booking_code", "is", null)
    .lte("booked_at", iso(cutoff));
  const live = new Set(HUB_LIVE_TIERS.map((t) => t.id as string));
  const ready = (data ?? []).filter((r) => live.has(r.tier as string));
  if (ready.length === 0) return NOTHING;

  const fresh = await claim(admin, ready.map((r) => `hub:${day}:${r.tier}`));
  const codes: HubCodeNote[] = ready
    .filter((r) => fresh.has(`hub:${day}:${r.tier}`))
    .flatMap((r) => {
      const t = hubTier(r.tier as string);
      return t ? [{ tier: t.id as string, name: t.name, target: t.target }] : [];
    })
    .sort((a, b) => a.target - b.target)
    .map(({ tier, name }) => ({ tier, name }));
  if (codes.length === 0) return NOTHING;

  const [devices, paidUsers] = await Promise.all([loadDevices(admin, "codes"), paidUserIds(admin)]);
  const proMore = Math.max(0, ready.length - 1);
  const items = devices.flatMap((d) => {
    const paid = d.userId !== null && paidUsers.has(d.userId);
    const payload = hubCodesPayload({ codes, paid, freeTier: FREE_TIER_ID, proMore });
    return payload ? [{ id: d.id, target: d, payload }] : [];
  });
  // A code is useful until its first kickoff: a phone that was off for a few hours still wants it.
  const result = await deliver(admin, items, 6 * 3600, "hub-codes");
  return { events: codes.length, ...summarise(result) };
}

/* ----------------------------------------------------------- community */

/**
 * Codes members have posted. The first goes out at once; any that follow
 * within COMMUNITY_GAP_MS wait and go out together as one, so a busy hour is
 * a few notifications and not a flood. Nobody is told about their own post.
 */
export async function dispatchCommunity(): Promise<Dispatched> {
  if (!pushConfigured) return { ...NOTHING, note: "VAPID keys are not configured" };
  if (!(await switchOn("code_hub_open"))) return { ...NOTHING, note: "Code Hub is not open yet" };
  const admin = supabaseAdmin();
  const now = Date.now();

  const { data: posts } = await admin
    .from("code_hub_posts")
    .select("id, user_id, author_name, games_count, odds")
    .eq("status", "live")
    .gt("first_kickoff", iso(now))
    .gt("posted_at", iso(now - 3 * 3600_000))
    .order("posted_at", { ascending: true })
    .limit(200);
  if (!posts || posts.length === 0) return NOTHING;

  const pending = await unclaimed(admin, posts.map((p) => `post:${p.id}`));
  const waiting = posts.filter((p) => pending.has(`post:${p.id}`));
  if (waiting.length === 0) return NOTHING;

  // Held for the window: left unclaimed, so the next minute's run looks again.
  const { data: recent } = await admin
    .from("push_events_sent")
    .select("key")
    .like("key", "community-batch:%")
    .gt("sent_at", iso(now - COMMUNITY_GAP_MS))
    .limit(1);
  if (recent && recent.length > 0) return { ...NOTHING, note: "grouped with the next notification" };

  // The window key goes in with the posts: of two overlapping runs, one wins every key.
  const won = await claim(admin, [`community-batch:${now}`, ...waiting.map((p) => `post:${p.id}`)]);
  const mine = waiting.filter((p) => won.has(`post:${p.id}`));
  if (mine.length === 0 || !won.has(`community-batch:${now}`)) return NOTHING;

  const devices = await loadDevices(admin, "community");
  const items = devices.flatMap((d) => {
    const notes: CommunityNote[] = mine
      .filter((p) => p.user_id !== d.userId)
      .map((p) => ({ author: p.author_name as string, games: p.games_count as number, odds: p.odds === null ? null : Number(p.odds) }));
    const payload = communityPayload(notes);
    return payload ? [{ id: d.id, target: d, payload }] : [];
  });
  const result = await deliver(admin, items, 3 * 3600, "community");
  return { events: mine.length, ...summarise(result) };
}

/** Of these keys, the ones nobody has claimed yet. */
async function unclaimed(admin: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const taken = new Set<string>();
  for (let i = 0; i < keys.length; i += 150) {
    const { data } = await admin.from("push_events_sent").select("key").in("key", keys.slice(i, i + 150));
    for (const r of data ?? []) taken.add(r.key as string);
  }
  return new Set(keys.filter((k) => !taken.has(k)));
}

/* --------------------------------------------------------------- slips */

interface SlipRow {
  id: string;
  subscription_id: string;
  slip_id: string;
  legs: TrackedLeg[];
  results: Record<string, LegResult>;
  checked_at: string;
  last_kickoff: string;
}

/**
 * Grades the tracked slips that have started, with the same scores and the
 * same grading the Tracked slips page uses, and tells each device what
 * changed: a leg in, the slip out, the slip landed.
 *
 * Each slip is claimed by an update that only succeeds against the
 * `checked_at` it was read with, so two overlapping runs cannot both send.
 */
export async function dispatchSlips(): Promise<Dispatched> {
  if (!pushConfigured) return { ...NOTHING, note: "VAPID keys are not configured" };
  const admin = supabaseAdmin();
  const now = Date.now();

  const { data } = await admin
    .from("push_tracked_slips")
    .select("id, subscription_id, slip_id, legs, results, checked_at, last_kickoff")
    .is("done_at", null)
    .lte("first_kickoff", iso(now))
    .order("checked_at", { ascending: true })
    .limit(SLIP_BATCH);
  const slips = (data ?? []) as SlipRow[];
  if (slips.length === 0) return NOTHING;

  // One lookup for every game still to settle across every slip.
  const ids = new Set<string>();
  const statIds = new Set<string>();
  for (const s of slips) {
    for (const leg of legsToPoll(s.legs, s.results, now)) {
      ids.add(leg.matchId);
      if (statKindOf(leg.market)) statIds.add(leg.matchId);
    }
  }
  const { scores } = await legScoresFor([...ids], statIds).catch(() => ({ scores: {} as Record<string, LegScore> }));

  const staged = slips.map((row) => ({
    row,
    ...gradeSlip({ legs: row.legs, results: row.results, lastKickoff: row.last_kickoff }, scores, now),
  }));

  // Claim each slip against the check it was read with; only the winner sends.
  const mine: typeof staged = [];
  for (const s of staged) {
    const { data: claimed } = await admin
      .from("push_tracked_slips")
      .update({
        results: s.results,
        checked_at: iso(now - CHECK_MARGIN_MS),
        done_at: s.done ? iso(now) : null,
      })
      .eq("id", s.row.id)
      .eq("checked_at", s.row.checked_at)
      .select("id");
    if (claimed && claimed.length > 0 && s.fresh.length > 0) mine.push(s);
  }
  if (mine.length === 0) return { ...NOTHING, note: "nothing new settled" };

  // The devices these slips belong to, with their keys and whether they want slip news.
  const subIds = [...new Set(mine.map((s) => s.row.subscription_id))];
  const devices = new Map<string, StoredSubscription>();
  for (let i = 0; i < subIds.length; i += 150) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, picks, results, value_alerts, codes, community, slips")
      .in("id", subIds.slice(i, i + 150));
    for (const r of subs ?? []) {
      devices.set(r.id as string, {
        id: r.id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, userId: r.user_id,
        picks: r.picks, results: r.results, valueAlerts: r.value_alerts, codes: r.codes, community: r.community, slips: r.slips,
      });
    }
  }
  const items = mine.flatMap((s) => {
    const device = devices.get(s.row.subscription_id);
    const payload = device?.slips ? slipPayload({ slipId: s.row.slip_id, legs: s.row.legs, results: s.results, fresh: s.fresh }) : null;
    return device && payload ? [{ id: device.id, target: device, payload }] : [];
  });

  // A result is only news for a while, but a phone that was off should still hear its slip landed.
  const result = await deliver(admin, items, 6 * 3600);
  return { events: mine.length, ...summarise(result) };
}
