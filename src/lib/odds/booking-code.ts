import "server-only";

import {
  planBooking,
  readBooking,
  type BookedCode,
  type BookingLeg,
  type BookingProblem,
  type BookSelection,
  type BuilderGroup,
} from "./booking";
import { parsebotCall, parsebotLive } from "./parsebot";
import { createShareCode, directEnabled, priceBetBuilder, readShareCode } from "./sportybet-direct";

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
  | ({
      ok: true;
      cached: boolean;
      /** How it was booked: SportyBet directly, parse.bot, or reused from the cache. */
      via: "direct" | "parsebot" | "cache";
      /** Whether the code read back with every selection; null when unchecked. */
      readBack: boolean | null;
    } & BookedCode)
  | { ok: false; reason: "invalid"; problems: BookingProblem[] }
  | { ok: false; reason: "unavailable" };

const inflight = new Map<string, Promise<BookingResult>>();

/**
 * The code already booked for exactly these picks, if one is still valid.
 * Reads the cache only: never books.
 */
export async function peekBookingCode(legs: readonly BookingLeg[]): Promise<string | null> {
  const plan = planBooking(legs);
  if (!plan.ok) return null;
  try {
    const { data } = await (await admin())
      .from("sportybet_booking_codes")
      .select("booking_code")
      .eq("signature", plan.signature)
      .gt("deadline", new Date().toISOString())
      .maybeSingle();
    return data?.booking_code ?? null;
  } catch {
    return null;
  }
}

/** Whether a booking could be made at all right now. */
export async function bookingAvailable(): Promise<boolean> {
  return (await directEnabled()) || (await parsebotLive());
}

/**
 * Books on SportyBet directly. Each Bet Builder is priced first, and its
 * parent market id stamped on its parts; one SportyBet won't combine comes
 * back as `refused` with the leg it was, so the user is told which pick.
 */
async function bookDirect(
  selections: readonly BookSelection[],
  builders: readonly BuilderGroup[],
): Promise<(BookedCode & { readBack: boolean | null }) | { refused: number[] } | null> {
  if (!(await directEnabled())) return null;
  const parentOf = new Map<string, string>();
  const refused: number[] = [];
  for (const group of builders) {
    const quote = await priceBetBuilder(group);
    if (!quote) return null;
    if (!quote.valid) {
      refused.push(group.index);
      continue;
    }
    for (const part of group.parts) parentOf.set(partKey(part.selection), quote.parentMarketId);
  }
  if (refused.length) return { refused };
  const stamped = selections.map((s) => {
    const parent = parentOf.get(partKey(s));
    return parent ? { ...s, parentBetBuilderMarketId: parent } : s;
  });
  const booked = await createShareCode(stamped);
  if (!booked) return null;
  // Read back as the user's app will load it. An unreadable code is not
  // proof of a bad one (the booking itself already checked the count), so
  // only a code that reads back with the wrong number of selections is refused.
  const check = await readShareCode(booked.bookingCode);
  if (check && check.selectionsCount !== selections.length) return null;
  return { ...booked, readBack: check ? true : null };
}

const partKey = (s: BookSelection) => [s.eventId, s.marketId, s.outcomeId, s.specifier ?? ""].join("|");

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
          via: "cache",
          readBack: null,
        };
      }
    } catch {
      // No cache: a direct booking is free, so it still goes ahead, but not
      // a metered one -- the cache is what keeps a repeat from costing again.
      cacheReadable = false;
    }

    const attempt = await bookDirect(plan.selections, plan.builders);
    if (attempt && "refused" in attempt) {
      return { ok: false, reason: "invalid", problems: attempt.refused.map((index) => ({ kind: "builder-refused", index })) };
    }
    const direct = attempt;
    // parse.bot can't book a Bet Builder, so it is only a fallback for codes without one.
    const parsebot =
      direct || !cacheReadable || plan.builders.length > 0 ? null : await bookViaParsebot(plan.selections);
    const booked = direct ?? parsebot;
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
    return {
      ok: true,
      cached: false,
      bookingCode: booked.bookingCode,
      shareUrl: booked.shareUrl,
      deadline: booked.deadline,
      selectionsCount: booked.selectionsCount,
      via: direct ? "direct" : "parsebot",
      readBack: direct ? direct.readBack : null,
    };
  })().finally(() => inflight.delete(plan.signature));

  inflight.set(plan.signature, task);
  return task;
}
