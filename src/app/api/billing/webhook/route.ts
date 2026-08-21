import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeWeekendPassExpiry } from "@/lib/paystack/pass-window";
import type { Tier } from "@/lib/entitlements";

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

function tierFromPlanCode(planCode: string | undefined): Tier | undefined {
  if (!planCode) return undefined;
  if (planCode === process.env.PAYSTACK_VIP_MONTHLY_PLAN_CODE) return "vip";
  if (
    planCode === process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE ||
    planCode === process.env.PAYSTACK_PRO_YEARLY_PLAN_CODE
  ) {
    return "pro";
  }
  return undefined;
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

      if (reference) {
        // Idempotent by design: `paystack_reference` is unique, so a
        // redelivered event just re-applies the same update.
        await admin.from("payments").update({ status: "success", raw_event: event }).eq("paystack_reference", reference);
      }

      // First charge on a plan-based checkout: our own metadata is present
      // and authoritative — use it directly rather than any lookup.
      const metaUserId = asString(metadata?.userId);
      const metaTier = metadata?.tier as Tier | undefined;

      if (metaUserId && metaTier === "pass") {
        await admin.from("subscriptions").upsert(
          {
            user_id: metaUserId,
            tier: "pass",
            status: "active",
            pass_expires_at: computeWeekendPassExpiry(new Date()).toISOString(),
            updated_at: now,
          },
          { onConflict: "user_id" }
        );
        break;
      }

      if (metaUserId && (metaTier === "pro" || metaTier === "vip")) {
        // Recorded for subscription.create (fires alongside this on the
        // first charge) to attach the customer_code — needed so renewal
        // charges, which carry no metadata of ours, can still be matched.
        if (customerCode) {
          await admin.from("subscriptions").upsert(
            { user_id: metaUserId, paystack_customer_code: customerCode, status: "active", updated_at: now },
            { onConflict: "user_id" }
          );
        }
        break;
      }

      // No metadata → this is a recurring-plan renewal charge, not our
      // initial checkout. Paystack renewal charges aren't guaranteed to
      // carry the metadata from the original transaction, so identity here
      // comes from customer_code (set on the row above during the first
      // charge) or, failing that, an email match against profiles.
      if (customerCode) {
        await admin
          .from("subscriptions")
          .update({ status: "active", updated_at: now })
          .eq("paystack_customer_code", customerCode);
      } else if (customerEmail) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", customerEmail)
          .maybeSingle();
        if (profile) {
          await admin.from("subscriptions").update({ status: "active", updated_at: now }).eq("user_id", profile.id);
        }
      }

      void amount; // available if amount-based plan disambiguation is ever needed
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

      await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          tier,
          status: "active",
          paystack_customer_code: customerCode,
          paystack_subscription_code: subscriptionCode,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );
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
      }
      break;
    }

    case "subscription.disable":
    case "subscription.not_renew": {
      const subscriptionCode = asString(data.subscription_code);
      if (!subscriptionCode) break;
      await admin
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: now })
        .eq("paystack_subscription_code", subscriptionCode);
      break;
    }

    default:
      break;
  }

  // Always 200 fast — no slow work, and Paystack redelivers on non-2xx.
  return NextResponse.json({ received: true });
}
