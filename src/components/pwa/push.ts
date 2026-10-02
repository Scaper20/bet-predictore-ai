"use client";

import type { PushTopics } from "@/lib/push/subscription";
import { isIOS, isStandalone } from "./install";

/**
 * Browser side of push notifications: permission, subscribing, and keeping
 * the server's copy of this device's subscription current.
 *
 * iPhone and iPad only support Web Push inside an app added to the Home
 * Screen (iOS 16.4+); in Safari itself there is no PushManager at all. That
 * case is "needs-install" rather than "unsupported", because there is
 * something the person can do about it.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const API = "/api/push/subscription";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

function apiSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * The service worker registration, registering it now if the page has not
 * yet. ServiceWorkerRegister normally does that on load in production; this
 * covers a tap that lands before it has.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!apiSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!apiSupported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

async function save(subscription: PushSubscription, topics: Partial<PushTopics> = {}): Promise<PushTopics> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), topics }),
  });
  if (!res.ok) throw new Error("save failed");
  const { topics: saved } = (await res.json()) as { topics: PushTopics };
  return saved;
}

/**
 * Asks for permission (must run from a tap — iOS refuses otherwise) and
 * subscribes this device. Returns the resulting state and, when on, the
 * topics in force.
 */
export async function enablePush(): Promise<{ state: PushState; topics?: PushTopics }> {
  if (!apiSupported()) return { state: await pushState() };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "denied" : "off" };

  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
  try {
    return { state: "on", topics: await save(subscription) };
  } catch (err) {
    // The server never heard about it, so nothing would ever arrive; undo it
    // rather than show "on".
    await subscription.unsubscribe().catch(() => {});
    throw err;
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch(API, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  await subscription.unsubscribe();
}

/** This device's topics, refreshing the server's copy on the way. */
export async function loadTopics(): Promise<PushTopics | null> {
  const subscription = await currentSubscription();
  return subscription ? save(subscription) : null;
}

export async function updateTopics(topics: Partial<PushTopics>): Promise<PushTopics | null> {
  const subscription = await currentSubscription();
  return subscription ? save(subscription, topics) : null;
}

/**
 * Once a session: re-sends this device's subscription so the server has the
 * current keys, re-creates a row the server dropped, and ties the device to
 * whoever is signed in now.
 */
export async function syncPush(): Promise<void> {
  try {
    if (!apiSupported() || Notification.permission !== "granted") return;
    if (sessionStorage.getItem("bx_push_synced")) return;
    const subscription = await currentSubscription();
    if (!subscription) return;
    await save(subscription);
    sessionStorage.setItem("bx_push_synced", "1");
  } catch {
    // Next session tries again.
  }
}

export async function sendTestPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: false, error: "Notifications are off on this device." };
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "You're offline." };
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "Couldn't send a test just now." };
}
