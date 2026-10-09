import "server-only";

import { cached } from "@/lib/providers/cache";
import {
  parseBookingResponse,
  parseListing,
  planBooking,
  type BookableLeg,
  type BookingSelection,
  type ListedEvent,
  type SkippedLeg,
} from "./booking";
import { isQuotable } from "./markets";
import { findFixture } from "./match-fixture";

/**
 * SportyBet booking codes, via parse.bot's SportyBet Nigeria scraper.
 *
 * The slip is the one place a user has already decided what they want to bet,
 * and until now it ended there: they re-entered every selection by hand on
 * SportyBet. book_bet reserves the selections and returns a share code that
 * loads the same betslip on SportyBet, with no login and no stake.
 *
 * This is the Nigeria scraper, deliberately NOT the one sportybet.ts prices
 * from: a booking code only loads on the site that issued it, and the users
 * here are on sportybet.com/ng.
 *
 * Metered per call, so the shape is: one cached team search per leg to find
 * the SportyBet event, then ONE book_bet for the whole slip, itself cached by
 * selection set so a double click or a refresh spends nothing.
 *
 * Every failure resolves to a result the UI can explain; nothing here invents
 * a code.
 */

const DEFAULT_SCRAPER = "8e652912-d760-4522-85ce-071e539a9c12";

/** Pinned for the same reason as sportybet.ts: an unversioned scraper follows its author. */
const SNAPSHOT_VERSION = "9";

const LISTING_TTL_MS = 10 * 60_000;
const BOOKING_TTL_MS = 10 * 60_000;

function base(): string {
  const id = process.env.SPORTYBET_NG_SCRAPER_ID?.trim() || DEFAULT_SCRAPER;
  return `https://api.parse.bot/scraper/${id}`;
}

function apiKey(): string | null {
  return process.env.PARSEBOT_API_KEY?.trim() || null;
}

export function bookingConfigured(): boolean {
  return apiKey() !== null;
}

/**
 * The fixtures SportyBet lists for a club, found by its site search.
 *
 * Searching by team beats scanning the board: the board is ordered by
 * competition and runs to thousands of events, whereas a team search returns
 * that club's own fixtures in one call.
 */
async function listingFor(team: string): Promise<ListedEvent[]> {
  const key = apiKey();
  if (!key) return [];

  return cached(`sportybet-ng:team:${team.toLowerCase()}`, LISTING_TTL_MS, async () => {
    const url = `${base()}/get_prematch_football_events?page_size=100&team=${encodeURIComponent(team)}`;
    const response = await fetch(url, {
      headers: { "X-API-Key": key, "API-Snapshot-Version": SNAPSHOT_VERSION },
    });
    if (!response.ok) throw new Error(`listing ${response.status}`);
    return parseListing(await response.json());
  });
}

/** SportyBet's event id for the leg's fixture, or null when it cannot be matched confidently. */
async function eventIdFor(leg: BookableLeg): Promise<string | null> {
  // Home first, then away: the search is by club, and either name may be the
  // one SportyBet indexes under. findFixture still demands both clubs agree.
  for (const team of [leg.homeName, leg.awayName]) {
    const events = await listingFor(team).catch(() => []);
    const hit = findFixture(leg, events);
    if (hit) return hit.eventId;
  }
  return null;
}

export interface SlipBooking {
  code: string;
  url: string | null;
  deadline: number | null;
  booked: number;
  skipped: SkippedLeg[];
}

export type BookSlipOutcome =
  | { ok: true; booking: SlipBooking }
  | { ok: false; reason: "unconfigured" | "nothing-bookable" | "upstream"; skipped: SkippedLeg[] };

const signature = (selections: BookingSelection[]) =>
  selections
    .map((s) => `${s.eventId}|${s.marketId}|${s.outcomeId}|${s.specifier ?? ""}`)
    .sort()
    .join(",");

async function placeBooking(selections: BookingSelection[], key: string) {
  const response = await fetch(`${base()}/book_bet`, {
    method: "POST",
    headers: {
      "X-API-Key": key,
      "API-Snapshot-Version": SNAPSHOT_VERSION,
      "Content-Type": "application/json",
    },
    // book_bet takes the selections as a JSON *string*, not a nested array.
    body: JSON.stringify({ selections: JSON.stringify(selections) }),
  });
  if (!response.ok) throw new Error(`book_bet ${response.status}`);
  const result = parseBookingResponse(await response.json().catch(() => null));
  if (!result) throw new Error("book_bet returned no code");
  return result;
}

/**
 * Book a slip. Legs that cannot be addressed or found are skipped and listed,
 * and the code covers only the legs that were booked.
 */
export async function bookSlip(legs: BookableLeg[]): Promise<BookSlipOutcome> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "unconfigured", skipped: [] };

  // Resolve events only for legs whose market can be addressed at all; a leg
  // we will skip anyway should not cost a search.
  const eventIds = new Map<string, string>();
  await Promise.all(
    legs.filter((leg) => isQuotable(leg.market)).map(async (leg) => {
      const id = await eventIdFor(leg);
      if (id) eventIds.set(leg.matchId, id);
    }),
  );

  const plan = planBooking(legs, eventIds);
  if (plan.selections.length === 0) {
    return { ok: false, reason: "nothing-bookable", skipped: plan.skipped };
  }

  let result;
  try {
    result = await cached(`sportybet-ng:book:${signature(plan.selections)}`, BOOKING_TTL_MS, () =>
      placeBooking(plan.selections, key),
    );
  } catch {
    return { ok: false, reason: "upstream", skipped: plan.skipped };
  }

  const declined = new Set(result.unavailableEventIds);
  const skipped = [...plan.skipped];
  plan.selections.forEach((s, i) => {
    if (declined.has(s.eventId)) skipped.push({ matchId: plan.matchIds[i], reason: "unavailable" });
  });

  return {
    ok: true,
    booking: {
      code: result.code,
      url: result.url,
      deadline: result.deadline,
      booked: plan.selections.length - (skipped.length - plan.skipped.length),
      skipped,
    },
  };
}
