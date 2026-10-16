import { describe, expect, it } from "vitest";
import { KICKOFF_MARGIN_MS, MAX_LEGS, planBooking, readBooking, selectionSignature } from "./booking";

const NOW = 1_800_000_000_000;
const later = NOW + 3 * 3_600_000;

describe("planBooking", () => {
  it("maps our markets to book_bet selections", () => {
    const plan = planBooking(
      [
        { market: "1x2:home", eventId: "sr:match:1", kickoff: later },
        { market: "ou:over:2.5", eventId: "sr:match:2", kickoff: later + 1000 },
        { market: "btts:yes", eventId: "sr:match:3", kickoff: later },
        { market: "dc:home-draw", eventId: "sr:match:4", kickoff: later },
      ],
      NOW,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.selections).toEqual([
      { eventId: "sr:match:1", marketId: "1", outcomeId: "1" },
      { eventId: "sr:match:2", marketId: "18", outcomeId: "12", specifier: "total=2.5" },
      { eventId: "sr:match:3", marketId: "29", outcomeId: "74" },
      { eventId: "sr:match:4", marketId: "10", outcomeId: "9" },
    ]);
    expect(plan.firstKickoff).toBe(later);
  });

  it("collects every problem before a credit is spent", () => {
    const plan = planBooking(
      [
        { market: "cs:2-1", eventId: "sr:match:1", kickoff: later },
        { market: "1x2:away", eventId: "53452525", kickoff: later },
        { market: "1x2:draw", eventId: "sr:match:5", kickoff: NOW + KICKOFF_MARGIN_MS - 1 },
        { market: "btts:no", eventId: "sr:match:1", kickoff: later },
      ],
      NOW,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.problems.map((p) => p.kind)).toEqual([
      "unmapped-market",
      "bad-event-id",
      "started",
      "duplicate-event",
    ]);
  });

  it("refuses an empty or oversized slip", () => {
    expect(planBooking([], NOW)).toEqual({ ok: false, problems: [{ kind: "empty" }] });
    const many = Array.from({ length: MAX_LEGS + 1 }, (_, i) => ({ market: "1x2:home", eventId: `sr:match:${i}`, kickoff: later }));
    const plan = planBooking(many, NOW);
    expect(plan.ok).toBe(false);
  });
});

describe("selectionSignature", () => {
  it("does not depend on order", () => {
    const a = { eventId: "sr:match:1", marketId: "1", outcomeId: "1" };
    const b = { eventId: "sr:match:2", marketId: "18", outcomeId: "13", specifier: "total=1.5" };
    expect(selectionSignature([a, b])).toBe(selectionSignature([b, a]));
    expect(selectionSignature([a])).not.toBe(selectionSignature([{ ...a, outcomeId: "2" }]));
  });
});

describe("readBooking", () => {
  const ok = { booking_code: "5ckNWH", share_url: "http://www.sportybet.com/tz/?shareCode=5CKNWH", deadline: later, selections_count: 2 };

  it("reads a good booking", () => {
    expect(readBooking(ok, 2)).toEqual({
      bookingCode: "5CKNWH",
      shareUrl: ok.share_url,
      deadline: later,
      selectionsCount: 2,
    });
  });
  it("refuses a booking that lost a leg", () => {
    expect(readBooking(ok, 3)).toBeNull();
  });
  it("refuses junk", () => {
    expect(readBooking(null, 1)).toBeNull();
    expect(readBooking({ ...ok, booking_code: "" }, 2)).toBeNull();
    expect(readBooking({ ...ok, deadline: "soon" }, 2)).toBeNull();
  });
});
