import { trackVipCompleted } from "@/lib/mixpanel/billing-events";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computePassExpiry, passLength } from "@/lib/paystack/pass-window";
import { cycleFromPlanCode, tierFromPlanCode } from "@/lib/paystack/plan-codes";
import { sendEmail } from "@/lib/email";
import { receiptEmail, renewalFailedEmail, subscriptionCanceledEmail } from "@/lib/email-templates";
import type { Tier } from "@/lib/entitlements";
import { recordCommission } from "@/lib/partner-commission";
import { grantPaystackOnce } from "@/lib/paystack/once";
import { grantPass } from "@/lib/offers-server";
import { cycleFromInterval, renewedPeriodEnd } from "@/lib/paystack/renewal";
import { chargeKind, resolveCycle } from "@/lib/paystack/charge-kind";

// Node's crypto module, not Edge-safe — Proxy (formerly middleware) already
// excludes this route from its matcher (see src/proxy.ts) so no session
// cookie handling is expected here either.
export const runtime = "nodejs";

/**
 * CONFIDENCE NOTE — read before touching this file.
 *
 * `charge.success`'s shape (data.reference, data.amount, data.customer.email,
 * data.customer.customer_code, data.metadata) is Paystack's most stable,
 * well-documented event and is trusted here without hedging.
 *
 * The exact field paths for `subscription.create` / `invoice.*` /
 * `subscription.disable` below are implemented from general knowledge of
 * Paystack's Subscriptions API, NOT verified against a live payload — I
 * could not reach paystack.com's docs from this environment (403s on
 * fetch) to confirm them at the time this was written. Before relying on
 * recurring billing in production: use Paystack's dashboard "Test Webhook"
 * (or a real test-mode subscription) to fire each event, log the raw body,
 * and confirm these field paths against what actually arrives — adjust the
 * small `readPlanCode`/`readNextPaymentDate` helpers below if they differ.
 * Everything here fails closed (skips + 200s) rather than guessing, so a
 * shape mismatch means a subscription silently doesn't update — not that it
 * grants access it shouldn't.
 */

interface PaystackWebhookEvent {
  event: string;
  data: Record<string, unknown>;
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  // Constant-time compare — this is an authorization check, not a cache key.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Handles both `data.plan.plan_code` and a bare `data.plan_code`/`data.plan` string — see confidence note above. */
function readPlanCode(data: Record<string, unknown>): string | undefined {
  const plan = data.plan;
  if (typeof plan === "string") return plan;
  return asString(asRecord(plan)?.plan_code) ?? asString(data.plan_code);
}

function readNextPaymentDate(data: Record<string, unknown>): string | undefined {
  return (
    asString(data.next_payment_date) ??
    asString(asRecord(data.subscription)?.next_payment_date) ??
    asString(data.period_end)
  );
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 500 });

  // Read the raw body BEFORE any JSON parsing — the HMAC is computed over
  // these exact bytes. Calling request.json() first and verifying after is
  // the classic mistake here: the reparsed/re-stringified body won't match.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-paystack-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as PaystackWebhookEvent;
  const data = event.data;
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  switch (event.event) {
    case "charge.success": {
      const reference = asString(data.reference);
      const customer = asRecord(data.customer);
      const customerCode = asString(customer?.customer_code);
      const customerEmail = asString(customer?.email);
      const metadata = asRecord(data.metadata);
      const amount = typeof data.amount === "number" ? data.amount : undefined;

      // Our own checkout writes a payments row under this reference before the
      // customer pays, so a reference we have never seen is a charge Paystack
      // made by itself: a renewal, whatever metadata it carries (charge-kind.ts).
      const { data: knownRow } = reference
        ? await admin.from("payments").select("id").eq("paystack_reference", reference).maybeSingle()
        : { data: null };
      const kind = chargeKind({
        onceFlag: metadata?.once === "1",
        offerFlag: typeof metadata?.offer === "string",
        knownReference: !!knownRow,
      });

      // Pay once: re-verified and granted as a prepaid period, before the
      // generic success update below (which would make the grant think it
      // had already run).
      if (reference && kind === "once") {
        await grantPaystackOnce(reference);
        break;
      }
      // An offer's pass: the same re-verified, once-only grant (lib/offers-server.ts).
      if (reference && kind === "offer") {
        await grantPass(reference);
        break;
      }

      if (reference) {
        // Idempotent by design: `paystack_reference` is unique, so a
        // redelivered event just re-applies the same update.
        await admin.from("payments").update({ status: "success", raw_event: event }).eq("paystack_reference", reference);
      }

      // Partner commission, for a first charge and for every renewal. A
      // renewal carries none of our metadata, so the payer is found the way
      // the renewal handling below finds them: customer_code, then email.
      if (reference && typeof amount === "number") {
        let payerId = asString(metadata?.userId);
        if (!payerId && customerCode) {
          const { data: sub } = await admin.from("subscriptions").select("user_id").eq("paystack_customer_code", customerCode).maybeSingle();
          payerId = sub?.user_id as string | undefined;
        }
        if (!payerId && customerEmail) {
          const { data: prof } = await admin.from("profiles").select("id").ilike("email", customerEmail).maybeSingle();
          payerId = prof?.id as string | undefined;
        }
        if (payerId) {
          await recordCommission({
            userId: payerId,
            reference,
            provider: "paystack",
            currency: asString(data.currency) ?? "NGN",
            grossMinor: amount,
            feeMinor: typeof data.fees === "number" ? data.fees : null,
          });
        }
      }

      // First charge on a plan-based checkout: our own metadata is present
      // and authoritative — use it directly rather than any lookup.
      const metaUserId = asString(metadata?.userId);
      const metaTier = metadata?.tier as Tier | undefined;

      if (metaUserId && metaTier === "pass") {
        // Old checkouts carry no pass length; they were all Weekend passes.
        const length = passLength(asString(metadata?.pass));
        const { data: current } = await admin
          .from("subscriptions")
          .select("tier, pass_expires_at")
          .eq("user_id", metaUserId)
          .maybeSingle();
        const running =
          current?.tier === "pass" && current.pass_expires_at ? new Date(current.pass_expires_at) : null;
        await admin.from("subscriptions").upsert(
          {
            user_id: metaUserId,
            tier: "pass",
            status: "active",
            pass_expires_at: computePassExpiry(length, new Date(), running).toISOString(),
            updated_at: now,
          },
          { onConflict: "user_id" }
        );
        if (customerEmail && reference) {
          void sendEmail({
            to: customerEmail,
            idempotencyKey: `receipt:paystack:${reference}`,
            ...receiptEmail({ tier: "pass", amountKobo: amount ?? 0, reference, date: now }),
          });
        }
        break;
      }

      if (metaUserId && (metaTier === "pro" || metaTier === "vip") && kind === "first") {
        // Recorded for subscription.create (fires alongside this on the
        // first charge) to attach the customer_code — needed so renewal
        // charges, which carry no metadata of ours, can still be matched.
        if (customerCode) {
          await admin.from("subscriptions").upsert(
            { user_id: metaUserId, paystack_customer_code: customerCode, status: "active", updated_at: now },
            { onConflict: "user_id" }
          );
        }
        if (customerEmail && reference) {
          void sendEmail({
            to: customerEmail,
            idempotencyKey: `receipt:paystack:${reference}`,
            ...receiptEmail({ tier: metaTier, amountKobo: amount ?? 0, reference, date: now }),
          });
        }
        break;
      }

      // Everything left is a renewal charge, or a first charge that arrived
      // without our metadata. Find the member by the id on the charge if it has
      // one, then by customer_code (saved on the first charge), then by email.
      const memberBy = (column: "user_id" | "paystack_customer_code", value: string) =>
        admin.from("subscriptions").select("user_id, tier, current_period_end").eq(column, value).maybeSingle();
      let renewing: { user_id: string; tier: string; current_period_end: string | null } | null = null;
      if (metaUserId) renewing = (await memberBy("user_id", metaUserId)).data;
      if (!renewing && customerCode) renewing = (await memberBy("paystack_customer_code", customerCode)).data;
      if (!renewing && customerEmail) {
        const { data: profile } = await admin.from("profiles").select("id").ilike("email", customerEmail).maybeSingle();
        if (profile) renewing = (await memberBy("user_id", profile.id)).data;
      }

      let receiptTier: "pro" | "vip" | undefined;
      if (renewing) {
        // The renewal pays for the next cycle: extend the paid-through date
        // here, not only on invoice.update, whose fields are unverified (see
        // the note at the top) and which left a renewing member without access
        // in October 2026. Recorded once per reference, so a redelivered event
        // neither extends twice nor duplicates the billing history.
        const plan = asRecord(data.plan);
        const planCode = readPlanCode(data);
        const tier = tierFromPlanCode(planCode) ?? (renewing.tier === "pro" || renewing.tier === "vip" ? renewing.tier : undefined);
        receiptTier = tier;
        const interval = asString(plan?.interval);
        const codeCycle = cycleFromPlanCode(planCode);
        // Only ask for the last payment when the charge and the plan code say nothing.
        let lastPlanLabel: string | null = null;
        if (!cycleFromInterval(interval) && !codeCycle) {
          const { data: last } = await admin
            .from("payments")
            .select("plan")
            .eq("user_id", renewing.user_id)
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          lastPlanLabel = (last?.plan as string | undefined) ?? null;
        }
        const { cycle, source } = resolveCycle({ interval, codeCycle, lastPlanLabel });
        const { data: seen } = reference
          ? await admin.from("payments").select("id").eq("paystack_reference", reference).maybeSingle()
          : { data: null };
        const firstDelivery = !!reference && !seen;
        if (firstDelivery) {
          await admin.from("payments").insert({
            user_id: renewing.user_id,
            paystack_reference: reference,
            amount_kobo: amount ?? 0,
            plan: tier && cycle ? `${tier}:${cycle}` : "renewal",
            status: "success",
            provider: "paystack",
            raw_event: event,
          });
          if (!cycle) {
            alertSupport(
              "A renewal was paid but its plan period could not be worked out",
              `Paystack charged ${customerEmail ?? customerCode ?? "a member"} (reference ${reference}, ₦${((amount ?? 0) / 100).toLocaleString("en-NG")}) ` +
                `but neither the charge, its plan code nor the member's last payment names a billing cycle. The payment is recorded; ` +
                `the paid-through date was NOT moved. Set it by hand in /admin, then look at /admin/renewals.`,
              `renewal-unresolved:${reference}`,
            );
          } else if (source !== "interval") {
            console.warn(`renewal ${reference}: cycle ${cycle} taken from ${source}, not from the plan interval`);
          }
        }
        const periodEnd =
          firstDelivery && cycle
            ? renewedPeriodEnd(
                renewing.current_period_end ? new Date(renewing.current_period_end) : null,
                new Date(now),
                cycle,
              ).toISOString()
            : undefined;
        await admin
          .from("subscriptions")
          .update({ status: "active", ...(periodEnd ? { current_period_end: periodEnd } : {}), updated_at: now })
          .eq("user_id", renewing.user_id);
      } else if (kind === "renewal") {
        alertSupport(
          "Paystack charged a customer but no member matched",
          `A charge arrived for ${customerEmail ?? "an unknown email"} (customer ${customerCode ?? "unknown"}, reference ${reference ?? "none"}, ` +
            `₦${((amount ?? 0) / 100).toLocaleString("en-NG")}) that is not one of our checkouts, and no member could be matched by id, ` +
            `customer code or email. Nothing was granted. Find them in /admin/users and set their plan by hand.`,
          `renewal-unmatched:${reference ?? customerCode ?? customerEmail}`,
        );
      }

      if (customerEmail && reference) {
        void sendEmail({
          to: customerEmail,
          idempotencyKey: `receipt:paystack:${reference}`,
          ...receiptEmail({ tier: receiptTier, amountKobo: amount ?? 0, reference, date: now }),
        });
      }
      break;
    }

    case "charge.failed": {
      // Same shape/confidence as charge.success above (Paystack's charge
      // events share a data envelope) — a real, immediate failure signal,
      // distinct from api/cron/expire-pending-payments's 24h backstop for
      // checkouts that never got a webhook at all.
      const reference = asString(data.reference);
      if (reference) {
        await admin.from("payments").update({ status: "failed", raw_event: event }).eq("paystack_reference", reference);
      }
      break;
    }

    case "subscription.create": {
      const customer = asRecord(data.customer);
      const customerCode = asString(customer?.customer_code);
      const customerEmail = asString(customer?.email);
      const subscriptionCode = asString(data.subscription_code);
      const tier = tierFromPlanCode(readPlanCode(data));
      const periodEnd = readNextPaymentDate(data);

      if (!tier) break; // Unrecognised plan code — nothing we manage.

      let userId = asString(asRecord(data.metadata)?.userId);
      if (!userId && customerEmail) {
        const { data: profile } = await admin.from("profiles").select("id").ilike("email", customerEmail).maybeSingle();
        userId = profile?.id;
      }
      if (!userId) break;

      // What they held before this subscription, for the VIP upgrade event.
      const { data: before } = tier === "vip" ? await admin.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle() : { data: null };

      await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          tier,
          status: "active",
          paystack_customer_code: customerCode,
          paystack_subscription_code: subscriptionCode,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          // Clears "flutterwave" on a row that held a prepaid period before.
          provider: "paystack",
          updated_at: now,
        },
        { onConflict: "user_id" }
      );
      if (tier === "vip") {
        trackVipCompleted({
          userId,
          fromTier: before?.tier,
          cycle: cycleFromInterval(asString(asRecord(data.plan)?.interval)) ?? "monthly",
          paymentMethod: "paystack_card_subscription",
          reference: subscriptionCode ?? `${userId}:${now}`,
        });
      }
      break;
    }

    case "invoice.update": {
      // Renewal outcome for an existing subscription. `status`/`paid` field
      // naming is the least-verified part of this handler — see the
      // confidence note at the top of the file.
      const subscriptionCode = asString(asRecord(data.subscription)?.subscription_code) ?? asString(data.subscription_code);
      const paid = data.paid === true || data.status === "success";
      if (!subscriptionCode) break;

      if (paid) {
        const periodEnd = readNextPaymentDate(data);
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            ...(periodEnd ? { current_period_end: new Date(periodEnd).toISOString() } : {}),
            updated_at: now,
          })
          .eq("paystack_subscription_code", subscriptionCode);
      } else {
        // Grace period, not immediate revocation — Paystack retries a failed
        // renewal charge several times before finally giving up. A user who
        // already paid for the current period keeps access through it
        // regardless (see getEntitlement's current_period_end check).
        await admin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: now })
          .eq("paystack_subscription_code", subscriptionCode);
        if (data.status === "failed") await notifyRenewalFailed(admin, subscriptionCode);
      }
      break;
    }

    case "invoice.payment_failed": {
      // Paystack's own failed-renewal event. Same grace as above: the paid
      // period still runs out on its date, the status only says why.
      const subscriptionCode = asString(asRecord(data.subscription)?.subscription_code) ?? asString(data.subscription_code);
      if (subscriptionCode) {
        await admin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: now })
          .eq("paystack_subscription_code", subscriptionCode);
        await notifyRenewalFailed(admin, subscriptionCode);
      }
      break;
    }

    case "refund.processed": {
      // A refund made from the Paystack dashboard. The payment stops counting
      // as revenue, and a refunded pass ends now. A refunded plan period is
      // ended by hand from /admin, since a refund can be partial.
      const reference = asString(data.transaction_reference) ?? asString(asRecord(data.transaction)?.reference);
      if (!reference) break;
      await admin.from("payments").update({ status: "refunded" }).eq("paystack_reference", reference);
      // A partner is not paid on money that went back (CTO checklist 5.4): cancel
      // the held commission, or leave a clawback on the next payout if it was paid.
      // A partial refund reverses the whole commission; the admin can see why.
      try {
        const { data: commission } = await admin
          .from("partner_commissions")
          .select("id")
          .eq("payment_reference", reference)
          .eq("kind", "commission")
          .maybeSingle();
        if (commission?.id) {
          await admin.rpc("partner_reverse_commission", { p_commission: commission.id as string, p_reason: "refunded (Paystack)" });
        }
      } catch (err) {
        console.error("commission reversal on refund failed", reference, err);
      }
      await admin
        .from("passes")
        .update({ expires_at: now })
        .eq("paystack_reference", reference)
        .gt("expires_at", now);
      break;
    }

    case "subscription.disable":
    case "subscription.not_renew": {
      const subscriptionCode = asString(data.subscription_code);
      if (!subscriptionCode) break;

      const { data: sub } = await admin
        .from("subscriptions")
        .select("tier, current_period_end, profiles(email)")
        .eq("paystack_subscription_code", subscriptionCode)
        .maybeSingle();

      await admin
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: now })
        .eq("paystack_subscription_code", subscriptionCode);

      const profile = sub ? (Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles) : undefined;
      if (profile?.email) {
        void sendEmail({
          to: profile.email,
          ...subscriptionCanceledEmail({ tier: sub?.tier as Tier | undefined, accessUntil: sub?.current_period_end }),
        });
      }
      break;
    }

    default:
      break;
  }

  // Always 200 fast — no slow work, and Paystack redelivers on non-2xx.
  return NextResponse.json({ received: true });
}

/** A failed renewal means a member may be about to lose access: tell the inbox, and tell them. */
async function notifyRenewalFailed(admin: ReturnType<typeof supabaseAdmin>, subscriptionCode: string) {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier, current_period_end, profiles(email)")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();
  if (!sub) return;
  const profile = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles;
  const period = String(sub.current_period_end ?? "none");
  if (profile?.email) {
    void sendEmail({
      to: profile.email,
      idempotencyKey: `renewal-failed:${subscriptionCode}:${period}`,
      ...renewalFailedEmail({ tier: sub.tier as Tier, accessUntil: sub.current_period_end }),
    });
  }
  alertSupport(
    "A renewal charge failed",
    `Paystack could not renew ${profile?.email ?? subscriptionCode} (${sub.tier}, paid through ${period}). They have been emailed. See /admin/renewals.`,
    `renewal-failed-alert:${subscriptionCode}:${period}`,
  );
}

/** Logs, and emails the support inbox once per key. Never throws: a webhook must still answer 200. */
function alertSupport(subject: string, body: string, key: string) {
  console.error(`[billing-alert] ${subject}: ${body}`);
  const to = process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
  const html = `<p>${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>`;
  void sendEmail({ to, idempotencyKey: key, subject, html });
}
