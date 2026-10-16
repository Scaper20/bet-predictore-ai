import "server-only";

import { planBooking, readBooking, type BookedCode, type BookingLeg, type BookingProblem } from "./booking";
import { parsebotCall } from "./parsebot";

/**
 * A SportyBet booking code for a set of legs: from the cache when the same
 * selections were booked before and the code is still valid, otherwise one
 * book_bet call (two credits) through the metered client.
 *
 * Not wired to any page yet. While PARSEBOT_LIVE is off the call is never
 * made and this answers { ok: false, reason: "unavailable" }.
 */

export type BookingResult =
  | ({ ok: true; cached: boolean } & BookedCode)
  | { ok: false; reason: "invalid"; problems: BookingProblem[] }
  | { ok: false; reason: "unavailable" };

const inflight = new Map<string, Promise<BookingResult>>();

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

export async function bookingCodeFor(legs: readonly BookingLeg[]): Promise<BookingResult> {
  const plan = planBooking(legs);
  if (!plan.ok) return { ok: false, reason: "invalid", problems: plan.problems };

  // Two taps on the same slip, or two users on the same slip at once, share
  // one call.
  const pending = inflight.get(plan.signature);
  if (pending) return pending;

  const task = (async (): Promise<BookingResult> => {
    try {
      const db = await admin();
      const { data: hit } = await db
        .from("sportybet_booking_codes")
        .select("booking_code, share_url, deadline, selections")
        .eq("signature", plan.signature)
        .gt("deadline", new Date().toISOString())
        .maybeSingle();
      if (hit) {
        return {
          ok: true,
          cached: true,
          bookingCode: hit.booking_code,
          shareUrl: hit.share_url,
          deadline: Date.parse(hit.deadline),
          selectionsCount: Array.isArray(hit.selections) ? hit.selections.length : plan.selections.length,
        };
      }
    } catch {
      // No cache, no call: the cache is what keeps a repeat from costing again.
      return { ok: false, reason: "unavailable" };
    }

    const raw = await parsebotCall<unknown>("book_bet", {
      body: { selections: JSON.stringify(plan.selections) },
      note: `${plan.selections.length} legs`,
    });
    const booked = readBooking(raw, plan.selections.length);
    if (!booked) return { ok: false, reason: "unavailable" };

    try {
      const db = await admin();
      await db.from("sportybet_booking_codes").upsert(
        {
          signature: plan.signature,
          booking_code: booked.bookingCode,
          share_url: booked.shareUrl,
          selections: plan.selections,
          deadline: new Date(booked.deadline).toISOString(),
        },
        { onConflict: "signature" },
      );
    } catch {
      // The code is still good for this user; only the reuse is lost.
    }
    return { ok: true, cached: false, ...booked };
  })().finally(() => inflight.delete(plan.signature));

  inflight.set(plan.signature, task);
  return task;
}
