import "server-only";

import { planBooking, readBooking, type BookedCode, type BookingLeg, type BookingProblem, type BookSelection } from "./booking";
import { parsebotCall, parsebotLive } from "./parsebot";
import { createShareCode, directEnabled, readShareCode } from "./sportybet-direct";

/**
 * A SportyBet booking code for a set of legs: from the cache when the same
 * selections were booked before and the code is still valid, otherwise
 * booked on SportyBet directly (free), and only if that is off or refused,
 * one book_bet call (two credits) through parse.bot's metered client.
 *
 * A direct code is read back before it is handed out: the code SportyBet
 * loads must carry exactly the selections sent, or it is not the slip the
 * user built.
 *
 * Used by the Code Hub and the slip. With both paths off this answers
 * { ok: false, reason: "unavailable" } without calling anything.
 */

export type BookingResult =
  | ({ ok: true; cached: boolean } & BookedCode)
  | { ok: false; reason: "invalid"; problems: BookingProblem[] }
  | { ok: false; reason: "unavailable" };

const inflight = new Map<string, Promise<BookingResult>>();

/** Whether a booking could be made at all right now. */
export async function bookingAvailable(): Promise<boolean> {
  return (await directEnabled()) || (await parsebotLive());
}

async function bookDirect(selections: readonly BookSelection[]): Promise<BookedCode | null> {
  if (!(await directEnabled())) return null;
  const booked = await createShareCode(selections);
  if (!booked) return null;
  // Read back as the user's app will load it. An unreadable code is not
  // proof of a bad one (the booking itself already checked the count), so
  // only a code that reads back with the wrong number of selections is refused.
  const check = await readShareCode(booked.bookingCode);
  return check && check.selectionsCount !== selections.length ? null : booked;
}

async function bookViaParsebot(selections: readonly BookSelection[]): Promise<BookedCode | null> {
  const raw = await parsebotCall<unknown>("book_bet", {
    body: { selections: JSON.stringify(selections) },
    note: `${selections.length} legs`,
  });
  return readBooking(raw, selections.length);
}

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
    let cacheReadable = true;
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
      // No cache: a direct booking is free, so it still goes ahead, but not
      // a metered one -- the cache is what keeps a repeat from costing again.
      cacheReadable = false;
    }

    const booked =
      (await bookDirect(plan.selections)) ?? (cacheReadable ? await bookViaParsebot(plan.selections) : null);
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
