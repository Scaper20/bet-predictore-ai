import "server-only";

import Mixpanel from "mixpanel";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE } from "@/lib/visitor";
import {
  ANON_ID_COOKIE,
  MIXPANEL_TOKEN,
  SESSION_NUMBER_COOKIE,
  clean,
  needsConsent,
  type MixpanelEventName,
  type MixpanelEvents,
} from "./events";

/**
 * Server-side Mixpanel, for events that happen on the server and must not
 * depend on the browser surviving long enough to send them: sign-up, sign-in,
 * payments, Ask, Forge and booking codes.
 *
 * Delivery is awaited (the Node SDK has no flush), and callers hand the
 * promise to after() so a serverless function isn't frozen mid-request and the
 * response isn't held up by analytics. A failure is swallowed: tracking must
 * never break a sign-in or a payment.
 *
 * Nothing is sent from `next dev`, or for visitors in a region that needs a
 * consent prompt first (events.ts). MIXPANEL_DISABLED=1 turns it off anywhere.
 */

let client: Mixpanel.Mixpanel | null = null;
function mixpanel(): Mixpanel.Mixpanel {
  return (client ??= Mixpanel.init(MIXPANEL_TOKEN, { protocol: "https", host: process.env.MIXPANEL_API_HOST || "api.mixpanel.com" }));
}

function enabled(country?: string | null): boolean {
  if (process.env.NODE_ENV === "development" || process.env.MIXPANEL_DISABLED === "1") return false;
  return !needsConsent(country);
}

const ENVIRONMENT = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";

export interface Target {
  /** The database user id. Never an email. */
  distinctId: string | null | undefined;
  country?: string | null;
  /** Makes a retried delivery of the same event count once. */
  insertId?: string;
  /** Event time, when it is not "now" (a retry or a webhook for an earlier action). */
  at?: Date;
}

function send(event: string, props: Record<string, string | number | boolean>, target: Target): Promise<void> {
  return new Promise((resolve) => {
    try {
      mixpanel().track(
        event,
        {
          ...props,
          distinct_id: target.distinctId!,
          environment: ENVIRONMENT,
          ...(target.insertId ? { $insert_id: target.insertId } : {}),
          ...(target.at ? { time: target.at.getTime() } : {}),
        },
        () => resolve(),
      );
    } catch {
      resolve();
    }
  });
}

/** Sends one event and resolves once it has been delivered (or failed quietly). */
export async function trackServer<E extends MixpanelEventName>(
  event: E,
  props: MixpanelEvents[E],
  target: Target,
): Promise<void> {
  if (!target.distinctId || !enabled(target.country)) return;
  await send(event, clean(props), target);
}

/** Sets profile fields for a user, so charts can break down by tier and country. */
export async function setUserProfile(
  userId: string,
  props: Record<string, string | number | boolean | undefined>,
  country?: string | null,
): Promise<void> {
  if (!enabled(country)) return;
  await new Promise<void>((resolve) => {
    try {
      mixpanel().people.set(userId, clean(props), () => resolve());
    } catch {
      resolve();
    }
  });
}

/** Runs analytics after the response is sent; falls back to fire-and-forget outside a request. */
export function later(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work().catch(() => undefined);
  }
}

export interface RequestContext {
  /** ISO country code from the proxy's geo hint (bx_country) or Vercel's header. */
  country: string | undefined;
  deviceType: string;
  /** Which session this is for the visitor, counted by the browser. 1 when the browser hasn't said. */
  sessionNumber: number;
  /** The browser's anonymous Mixpanel id: the identity for a visitor who isn't signed in. */
  anonId: string | undefined;
}

/** What the current request says about the visitor. Call it inside a request (route handler or server action). */
export async function requestContext(): Promise<RequestContext> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const country = (jar.get(COUNTRY_COOKIE)?.value || h.get("x-vercel-ip-country") || undefined)?.toUpperCase();
  const ua = h.get("user-agent") ?? "";
  const deviceType = /iPad|Tablet/i.test(ua)
    ? "tablet_web"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "mobile_web"
      : "desktop_web";
  const n = Number(jar.get(SESSION_NUMBER_COOKIE)?.value);
  return {
    country,
    deviceType,
    sessionNumber: Number.isInteger(n) && n > 0 ? n : 1,
    anonId: jar.get(ANON_ID_COOKIE)?.value,
  };
}

/**
 * The common case in one call: track an event from inside a request, as the
 * signed-in user (or, for a visitor, their browser's anonymous id), after the
 * response has gone out.
 */
export function trackLater<E extends MixpanelEventName>(
  event: E,
  props: MixpanelEvents[E],
  who: { userId?: string | null; anonId?: string; country?: string | null; insertId?: string },
): void {
  later(() => trackServer(event, props, { distinctId: who.userId ?? who.anonId, country: who.country, insertId: who.insertId }));
}
