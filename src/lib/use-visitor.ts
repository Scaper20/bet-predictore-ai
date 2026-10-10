import { useSyncExternalStore } from "react";
import { APP_TIMEZONE } from "@/lib/format";
import { COUNTRY_COOKIE, DEFAULT_COUNTRY } from "@/lib/visitor";

/*
 * useSyncExternalStore with a server snapshot is what makes the swap safe:
 * the server and the hydrating browser both render the default (WAT,
 * Nigeria), so nothing mismatches, and React re-renders straight after
 * hydration with the browser's own value. Neither value changes while a
 * page is open, so there is nothing to subscribe to.
 */
const noSubscribe = () => () => {};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || APP_TIMEZONE;
  } catch {
    return APP_TIMEZONE;
  }
}

function cookieCountry(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([A-Z]{2})`));
  return match?.[1] ?? DEFAULT_COUNTRY;
}

/** The visitor's IANA time zone ("Africa/Nairobi"); WAT until hydrated. */
export function useTimeZone(): string {
  return useSyncExternalStore(noSubscribe, browserTimeZone, () => APP_TIMEZONE);
}

/** The visitor's country code ("KE"); Nigeria until hydrated, or when unknown. */
export function useCountry(): string {
  return useSyncExternalStore(noSubscribe, cookieCountry, () => DEFAULT_COUNTRY);
}
