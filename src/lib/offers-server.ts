import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cached } from "@/lib/providers/cache";
import { claimPaystackPayment, type OnceOutcome } from "@/lib/paystack/once";
import { initializeTransaction } from "@/lib/paystack/client";
import { nairaToKobo } from "@/lib/paystack/money";
import { recordCommission } from "@/lib/partner-commission";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/site-url";
import type { Entitlement } from "@/lib/entitlements";
import {
  DEFAULT_WINDOW_HOURS,
  FIRST_SEEN_COOKIE,
  OFFER_PLAN_PREFIX,
  OFFER_REFERENCE_PREFIX,
  durationLabel,
  earlier,
  firstSeenFrom,
  isOfferPlan,
  offerCampaign,
  offerDeadline,
  offerLive,
  passExpiry,
  publicOffer,
  tierName,
  type Offer,
  type OfferAudience,
  type OfferState,
} from "@/lib/offers";

/* ------------------------------------------------------------------ offers */

const COLUMNS =
  "id, slug, name, audience, active, tier, hours, price_naira, compare_naira, window_hours, starts_at, ends_at, max_per_account, headline, subline, cta, perks";

function fromRow(r: Record<string, unknown>): Offer {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    audience: r.audience as OfferAudience,
    active: r.active === true,
    tier: r.tier === "pro" ? "pro" : "vip",
    hours: Number(r.hours),
    priceNaira: Number(r.price_naira),
    compareNaira: r.compare_naira == null ? null : Number(r.compare_naira),
    windowHours: r.window_hours == null ? null : Number(r.window_hours),
    startsAt: (r.starts_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    maxPerAccount: Number(r.max_per_account ?? 1),
    headline: r.headline as string,
    subline: (r.subline as string | null) ?? null,
    cta: (r.cta as string) || "Get it",
    perks: (r.perks as string[] | null) ?? [],
  };
}

/** Every offer, for the admin editor. Never cached. */
export async function allOffers(): Promise<Offer[]> {
  const { data } = await supabaseAdmin().from("offers").select(COLUMNS).order("created_at", { ascending: true });
  return (data ?? []).map(fromRow);
}

/**
 * The offers the site reads, held for a minute per server: every page view
 * of a new visitor asks, and an edit in admin reaching everyone within a
 * minute is plenty.
 */
async function liveOffers(): Promise<Offer[]> {
  return cached("offers:all", 60_000, async () => {
    const { data, error } = await supabaseAdmin().from("offers").select(COLUMNS).eq("active", true);
    if (error) throw error;
    return (data ?? []).map(fromRow);
  }).catch(() => []);
}

export async function offerBySlug(slug: string): Promise<Offer | null> {
  const { data } = await supabaseAdmin().from("offers").select(COLUMNS).eq("slug", slug).maybeSingle();
  return data ? fromRow(data) : null;
}

/* ------------------------------------------------------------------ passes */

export interface PassRow {
  tier: "pro" | "vip";
  expiresAt: string;
}

/** The live pass that gives the most, or null. */
export async function livePassFor(userId: string): Promise<PassRow | null> {
  const { data } = await supabaseAdmin()
    .from("passes")
    .select("tier, expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false });
  const rows = (data ?? []).map((r) => ({ tier: r.tier === "pro" ? "pro" : "vip", expiresAt: r.expires_at as string }) as PassRow);
  return rows.find((r) => r.tier === "vip") ?? rows[0] ?? null;
}

async function purchasesOf(userId: string, offerId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("passes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("offer_id", offerId);
  return count ?? 0;
}

async function accountCreatedMs(userId: string): Promise<number | null> {
  const { data } = await supabaseAdmin().from("profiles").select("created_at").eq("id", userId).maybeSingle();
  const ms = data?.created_at ? Date.parse(data.created_at as string) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/* -------------------------------------------------------------- who gets what */

/** A real Pro or VIP plan (not a pass) is never offered a pass. */
const onPlan = (ent: Entitlement) => (ent.passOnly ? ent.planTier === "pro" || ent.planTier === "vip" : ent.tier === "pro" || ent.tier === "vip");

/**
 * The popup offer for this visitor, if any. A running pass comes first (the
 * page shows its clock); then the new-visitor offer inside its window; then,
 * for a signed-in free member, the members' offer.
 */
export async function offerStateFor(ent: Entitlement, now = Date.now()): Promise<OfferState> {
  const offers = (await liveOffers()).filter((o) => offerLive(o, now));
  const newcomer = offers.find((o) => o.audience === "new_visitors");
  const members = offers.find((o) => o.audience === "free_members");
  const firstSeen = firstSeenFrom((await cookies()).get(FIRST_SEEN_COOKIE)?.value, now);
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

  if (!ent.userId) {
    if (!newcomer) return { state: "none" };
    const deadline = earlier(offerDeadline(firstSeen, null, newcomer.windowHours ?? DEFAULT_WINDOW_HOURS), newcomer.endsAt ? Date.parse(newcomer.endsAt) : null);
    return deadline && deadline > now ? { state: "offer", offer: publicOffer(newcomer), deadline: iso(deadline), signedIn: false } : { state: "none" };
  }

  const pass = await livePassFor(ent.userId);
  if (pass && ent.passOnly) return { state: "active", until: pass.expiresAt, tier: pass.tier };
  if (onPlan(ent)) return { state: "none" };

  if (newcomer && (await purchasesOf(ent.userId, newcomer.id)) < newcomer.maxPerAccount) {
    const window = offerDeadline(firstSeen, await accountCreatedMs(ent.userId), newcomer.windowHours ?? DEFAULT_WINDOW_HOURS);
    const deadline = earlier(window, newcomer.endsAt ? Date.parse(newcomer.endsAt) : null);
    if (deadline && deadline > now) return { state: "offer", offer: publicOffer(newcomer), deadline: iso(deadline), signedIn: true };
  }
  if (members && (await purchasesOf(ent.userId, members.id)) < members.maxPerAccount) {
    return { state: "offer", offer: publicOffer(members), deadline: members.endsAt, signedIn: true };
  }
  return { state: "none" };
}

/**
 * Whether this account may buy this offer now, and until when. Popup offers
 * follow offerStateFor; an email offer needs the recipient row its link
 * carries, belonging to this account, sent within the offer's window.
 */
export async function eligibility(
  offer: Offer,
  ent: Entitlement,
  recipientId: string | null,
  now = Date.now(),
): Promise<{ ok: true; deadline: string | null } | { ok: false; reason: string }> {
  const closed = { ok: false as const, reason: "This offer has closed." };
  if (!ent.userId) return { ok: false, reason: "Sign in first." };
  if (!offerLive(offer, now)) return closed;
  if (onPlan(ent)) return { ok: false, reason: `You're already on ${tierName(ent.planTier === "vip" || ent.tier === "vip" ? "vip" : "pro")}.` };
  if ((await purchasesOf(ent.userId, offer.id)) >= offer.maxPerAccount) return { ok: false, reason: "You've already used this offer." };

  if (offer.audience === "email") {
    if (!recipientId || !/^[0-9a-f-]{36}$/i.test(recipientId)) return { ok: false, reason: "Open this offer from the link in your email." };
    const { data: r } = await supabaseAdmin()
      .from("email_campaign_recipients")
      .select("user_id, campaign, status, sent_at")
      .eq("id", recipientId)
      .maybeSingle();
    if (!r || r.campaign !== offerCampaign(offer.slug)) return { ok: false, reason: "This link isn't valid." };
    if (r.user_id !== ent.userId) return { ok: false, reason: "This offer was sent to a different account. Sign in with the email it came to." };
    const sent = r.sent_at ? Date.parse(r.sent_at as string) : null;
    const window = sent && offer.windowHours ? sent + offer.windowHours * 3_600_000 : null;
    const deadline = earlier(window, offer.endsAt ? Date.parse(offer.endsAt) : null);
    if (deadline !== null && deadline <= now) return closed;
    return { ok: true, deadline: deadline === null ? null : new Date(deadline).toISOString() };
  }

  const state = await offerStateFor(ent, now);
  if (state.state === "offer" && state.offer.slug === offer.slug) return { ok: true, deadline: state.deadline };
  return closed;
}

/* --------------------------------------------------------- checkout, grant */

/** Opens a Paystack checkout for an offer, after eligibility. */
export async function startOfferCheckout(
  offer: Offer,
  ent: Entitlement,
  recipientId: string | null,
): Promise<{ url: string } | { error: string; status: number }> {
  if (!ent.userId || !ent.email) return { error: "Sign in first.", status: 401 };
  const ok = await eligibility(offer, ent, recipientId);
  if (!ok.ok) return { error: ok.reason, status: 409 };

  const reference = `${OFFER_REFERENCE_PREFIX}${ent.userId}_${randomUUID()}`;
  const amountKobo = nairaToKobo(offer.priceNaira);
  let init;
  try {
    init = await initializeTransaction({
      email: ent.email,
      amountKobo,
      reference,
      callbackUrl: `${SITE_URL}/account/billing/callback`,
      metadata: { userId: ent.userId, tier: offer.tier, offer: offer.slug },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start checkout.", status: 502 };
  }
  // The row the grant checks the paid amount against; service role, as for every payments write.
  await supabaseAdmin().from("payments").insert({
    user_id: ent.userId,
    paystack_reference: reference,
    amount_kobo: amountKobo,
    plan: `${OFFER_PLAN_PREFIX}${offer.slug}`,
    status: "pending",
  });
  return { url: init.authorization_url };
}

/**
 * Turns a paid offer checkout into its pass, once. Called by the webhook and
 * the callback page, whichever comes first; the payment is re-verified with
 * Paystack before anything is granted (claimPaystackPayment). The pass
 * stacks on a running pass of the same tier.
 */
export async function grantPass(reference: string): Promise<OnceOutcome> {
  const claim = await claimPaystackPayment(reference, isOfferPlan);
  if (claim.outcome !== "claimed") return claim.outcome;
  const { payment, tx } = claim;
  const admin = supabaseAdmin();
  const now = new Date();

  const offer = await offerBySlug(payment.plan.slice(OFFER_PLAN_PREFIX.length));
  // An offer deleted after checkout still owes the buyer what they paid for:
  // fall back to the tier in the payment's metadata for a day.
  const tier = offer?.tier ?? (tx.metadata?.tier === "pro" ? "pro" : "vip");
  const hours = offer?.hours ?? 24;

  const { data: running } = await admin
    .from("passes")
    .select("expires_at")
    .eq("user_id", payment.user_id)
    .eq("tier", tier)
    .gt("expires_at", now.toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const expiresAt = passExpiry(hours, now, running ? new Date(running.expires_at as string) : null).toISOString();
  await admin.from("passes").insert({
    user_id: payment.user_id,
    offer_id: offer?.id ?? null,
    tier,
    paystack_reference: reference,
    amount_kobo: tx.amount,
    starts_at: now.toISOString(),
    expires_at: expiresAt,
  });

  await recordCommission({
    userId: payment.user_id,
    reference,
    provider: "paystack",
    plan: payment.plan,
    currency: tx.currency ?? "NGN",
    grossMinor: tx.amount,
    feeMinor: typeof tx.fees === "number" ? tx.fees : null,
    paidAt: now,
  });

  const email = tx.customer?.email;
  if (email) {
    void sendEmail({
      to: email,
      ...receiptEmail({
        tier,
        planLabel: `${tierName(tier)} ${durationLabel(hours)} pass`,
        amountKobo: tx.amount,
        accessUntil: expiresAt,
        reference,
        date: now.toISOString(),
      }),
    });
  }
  return "granted";
}
