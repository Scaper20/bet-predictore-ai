import { MAX_RATE_BPS } from "@/lib/partners";

/**
 * The partner agreement's rules for changing a rate and ending the relationship
 * (Partner Agreement V2, clauses 4.6 to 4.8 and 11), pure so each is tested.
 */

export const RATE_NOTICE_DAYS = 30;
export const TERMINATION_NOTICE_DAYS = 30;
/** The first days after activation, with a shorter termination notice (clause 4.7). */
export const PILOT_DAYS = 90;
export const PILOT_NOTICE_DAYS = 7;
/** The review after activation: referrals, refunds and promotion are inspected (clause 4.7). */
export const INSPECTION_DAYS = 14;

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export type RateChangeCheck = { ok: true; effectiveAt: Date } | { ok: false; error: string };

/**
 * A rate change reaches new customers on the date it is effective. Without the
 * partner's written agreement that is at least 30 days after the notice; with it,
 * any date from now. Never above the ceiling, never to the same rate.
 */
export function planRateChange(i: {
  currentBps: number;
  newBps: number;
  now: Date;
  agreedInWriting: boolean;
  /** An effective date typed by the admin; only honoured earlier than 30 days with the partner's written agreement. */
  requestedEffectiveAt?: Date | null;
}): RateChangeCheck {
  if (!Number.isInteger(i.newBps) || i.newBps < 0) return { ok: false, error: "Enter a rate of 0% or more." };
  if (i.newBps > MAX_RATE_BPS) return { ok: false, error: `No rate may exceed ${MAX_RATE_BPS / 100}% (agreement clause 4.8).` };
  if (i.newBps === i.currentBps) return { ok: false, error: "That is already the partner's rate." };
  const earliest = addDays(i.now, RATE_NOTICE_DAYS);
  const wanted = i.requestedEffectiveAt ?? (i.agreedInWriting ? i.now : earliest);
  if (Number.isNaN(wanted.getTime())) return { ok: false, error: "That date is not valid." };
  if (!i.agreedInWriting && wanted.getTime() < earliest.getTime()) {
    return { ok: false, error: `Without the partner's written agreement the change needs ${RATE_NOTICE_DAYS} days' notice (not before ${earliest.toISOString().slice(0, 10)}).` };
  }
  return { ok: true, effectiveAt: wanted.getTime() < i.now.getTime() ? i.now : wanted };
}

export function inPilot(activatedAt: Date | null | undefined, now: Date): boolean {
  return !!activatedAt && now.getTime() < addDays(activatedAt, PILOT_DAYS).getTime();
}

/** When the 14-day inspection falls due (null for a partner already active under Version 1). */
export function inspectionDue(activatedAt: Date | null | undefined): Date | null {
  return activatedAt ? addDays(activatedAt, INSPECTION_DAYS) : null;
}

export type TerminationCheck = { ok: true; effectiveAt: Date; noticeDays: number } | { ok: false; error: string };

/**
 * A termination without cause takes effect after notice: 30 days, or 7 during the
 * pilot. For cause (established fraud, serious unlawful promotion, a security
 * misuse or a legal requirement) it takes effect at once and the reason is required.
 */
export function planTermination(i: { now: Date; activatedAt: Date | null; forCause: boolean; reason: string }): TerminationCheck {
  if (!i.reason.trim()) return { ok: false, error: "Say why the partner is being terminated." };
  if (i.forCause) return { ok: true, effectiveAt: i.now, noticeDays: 0 };
  const noticeDays = inPilot(i.activatedAt, i.now) ? PILOT_NOTICE_DAYS : TERMINATION_NOTICE_DAYS;
  return { ok: true, effectiveAt: addDays(i.now, noticeDays), noticeDays };
}

/** Whether a termination has taken effect by `at`. */
export const isTerminated = (terminatedAt: Date | null | undefined, at: Date): boolean =>
  !!terminatedAt && terminatedAt.getTime() <= at.getTime();

/**
 * After termination takes effect, only a customer who made a first successful payment
 * before it (a Locked Referral) keeps earning, to the end of their own 12 months (clause 11.3).
 */
export function earnsAfterTermination(i: { terminatedAt: Date | null | undefined; firstPaidAt: Date; paidAt: Date }): boolean {
  if (!isTerminated(i.terminatedAt, i.paidAt)) return true;
  return i.firstPaidAt.getTime() < i.terminatedAt!.getTime();
}

/** The customer a new referral is credited to starts on the rate in force now. */
export const rateForNewReferral = (partnerBps: number): number => partnerBps;
