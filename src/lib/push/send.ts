import "server-only";

import webpush, { WebPushError } from "web-push";
import type { PushPayload } from "@/lib/push/messages";

/**
 * Sends Web Push messages with the app's VAPID keys.
 *
 * The public key is also baked into the browser bundle (subscriptions are
 * bound to it), the private key never leaves the server. Generate a pair
 * once with `npx web-push generate-vapid-keys`; changing it orphans every
 * existing subscription.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
// Push services contact this address if our traffic misbehaves. Apple rejects
// anything that is not a mailto: or an https URL.
const subject = process.env.VAPID_SUBJECT ?? "mailto:support@kiqstat.app";

export const pushConfigured = Boolean(publicKey && privateKey);

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  if (!publicKey || !privateKey) throw new Error("Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidSet = true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendOptions {
  /** Seconds the push service keeps trying a phone that is off or offline. */
  ttl: number;
  /**
   * Replaces a still-undelivered message with the same topic, so a phone
   * that was off all day wakes to one notification, not a backlog.
   */
  topic?: string;
  urgency?: "low" | "normal" | "high";
}

/** "gone" means the subscription is dead for good and should be deleted. */
export type SendOutcome = "sent" | "gone" | "failed";

/**
 * Why the last send to a device failed, as the push service said it
 * ("403 BadJwtToken"). Recorded on the row (0042) so a failure is visible
 * instead of silent: before this, a device that never got a notification
 * looked exactly like one nobody had tried.
 */
export function failureReason(err: unknown): string {
  if (err instanceof WebPushError) return `${err.statusCode} ${String(err.body ?? "").slice(0, 160)}`.trim();
  return err instanceof Error ? err.message.slice(0, 200) : "unknown error";
}

export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  opts: SendOptions,
  onFail?: (reason: string) => void,
): Promise<SendOutcome> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: opts.ttl, topic: opts.topic, urgency: opts.urgency ?? "normal", timeout: 10_000 },
    );
    return "sent";
  } catch (err) {
    // 404/410: the browser unsubscribed or the app was removed, for good.
    // Nothing else counts as gone — a 400 or 403 can just as well be our own
    // request or keys at fault, and treating that as "gone" would delete
    // every subscriber in one run.
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return "gone";
    onFail?.(failureReason(err));
    return "failed";
  }
}

/** How many sends are in flight at once. */
const CONCURRENCY = 25;

export interface BatchResult {
  /** Row ids reached. */
  sent: string[];
  /** Row ids whose subscription is dead. */
  gone: string[];
  failed: number;
  /** Row id → what the push service said, for the failed ones. */
  errors: Record<string, string>;
}

/**
 * Sends to many devices, a bounded number at a time. Returns which rows were
 * reached and which are gone, so the caller can stamp the first and delete
 * the second.
 */
export async function sendPushBatch(
  items: { id: string; target: PushTarget; payload: PushPayload }[],
  opts: SendOptions,
): Promise<BatchResult> {
  const result: BatchResult = { sent: [], gone: [], failed: 0, errors: {} };
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map(({ id, target, payload }) => sendPush(target, payload, opts, (reason) => (result.errors[id] = reason))),
    );
    outcomes.forEach((outcome, j) => {
      const { id } = chunk[j];
      if (outcome === "sent") result.sent.push(id);
      else if (outcome === "gone") result.gone.push(id);
      else result.failed++;
    });
  }
  return result;
}

/** Counts, for a cron's JSON response. */
export function summarise(r: BatchResult): { sent: number; gone: number; failed: number } {
  return { sent: r.sent.length, gone: r.gone.length, failed: r.failed };
}
