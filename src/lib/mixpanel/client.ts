import { ANON_ID_COOKIE, MIXPANEL_TOKEN, SESSION_NUMBER_COOKIE, clean, type MixpanelEventName, type MixpanelEvents } from "./events";

/**
 * Browser-side Mixpanel. The SDK (about 40 KB gzipped) is loaded on demand
 * once the page is idle, the same way the Supabase client is, so it never
 * competes with first paint on a slow phone. Events fired before it arrives
 * wait in a short queue and are sent in order.
 *
 * Initialised once, by <MixpanelProvider> (components/analytics). Autocapture
 * and automatic page views are off: the ten events in events.ts are the plan,
 * and Vercel and Google Analytics already count page views.
 */

type Sdk = typeof import("mixpanel-browser").default;

let sdk: Sdk | null = null;
let loading: Promise<Sdk | null> | null = null;
const queue: Array<(m: Sdk) => void> = [];

const ENVIRONMENT = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "production";

function allowed(): boolean {
  // Nothing from `next dev`, so local clicking never reaches the real project.
  return typeof window !== "undefined" && process.env.NODE_ENV !== "development";
}

/** Loads and configures the SDK. Safe to call more than once. */
export function initMixpanel(): Promise<Sdk | null> {
  if (!allowed()) return Promise.resolve(null);
  if (sdk) return Promise.resolve(sdk);
  loading ??= import("mixpanel-browser")
    .then(({ default: mixpanel }) => {
      mixpanel.init(MIXPANEL_TOKEN, {
        api_host: process.env.NEXT_PUBLIC_MIXPANEL_API_HOST || "https://api.mixpanel.com",
        autocapture: false,
        track_pageview: false,
        persistence: "localStorage",
        // Keep the visitor's anonymous id in step with the server's idea of them.
        loaded: (m) => {
          m.register({ environment: ENVIRONMENT });
        },
      });
      sdk = mixpanel;
      for (const run of queue.splice(0)) run(mixpanel);
      return mixpanel;
    })
    .catch(() => null);
  return loading;
}

function whenReady(run: (m: Sdk) => void) {
  if (!allowed()) return;
  if (sdk) run(sdk);
  else if (queue.length < 50) queue.push(run);
}

/** Sends one of the catalogued events from the browser. */
export function trackClient<E extends MixpanelEventName>(event: E, props: MixpanelEvents[E]): void {
  whenReady((m) => m.track(event, clean(props)));
}

/** Ties this browser to a signed-in user (their database id, never an email) and records their tier. */
export function identifyUser(userId: string, profile: { tier: string; country?: string }): void {
  whenReady((m) => {
    if (m.get_distinct_id() !== userId) m.identify(userId);
    m.people.set(clean({ current_tier: profile.tier, country: profile.country }));
    writeAnonId(m);
  });
}

/** Signed out: the next person on this browser must not inherit the last one's history. */
export function resetIdentity(): void {
  whenReady((m) => {
    m.reset();
    writeAnonId(m);
  });
}

function cookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // Cookies blocked: server-side events fall back to their defaults.
  }
}

/** The server tracks a visitor who isn't signed in under the browser's anonymous id, so the two line up. */
function writeAnonId(m: Sdk) {
  cookie(ANON_ID_COOKIE, m.get_distinct_id());
}

/**
 * Counts this browser's sessions (one per tab session, kept in localStorage)
 * and puts the number in a cookie for the server's events. Returns the count.
 */
export function bumpSessionNumber(): number {
  try {
    const key = "kq_session_count";
    const flag = "kq_session_live";
    let n = Number(localStorage.getItem(key)) || 0;
    if (!sessionStorage.getItem(flag)) {
      n += 1;
      localStorage.setItem(key, String(n));
      sessionStorage.setItem(flag, "1");
    }
    n = Math.max(n, 1);
    cookie(SESSION_NUMBER_COOKIE, String(n));
    return n;
  } catch {
    return 1;
  }
}

/** Writes the anonymous id cookie once the SDK is up. */
export function syncAnonId(): void {
  whenReady(writeAnonId);
}
