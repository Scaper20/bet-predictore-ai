/*
 * BetriX service worker.
 *
 * Deliberately conservative, because a stale prediction is worse than a slow
 * one: pages always go to the network first, and a cached copy is only ever
 * shown when the network is unreachable — with the offline page as the last
 * resort. What is cached aggressively is what can never go stale: Next's
 * content-hashed build output under /_next/static.
 *
 * Never touched: API calls, RSC payloads for client navigations, anything
 * personal (account, admin, auth), and non-GET requests. Those behave exactly
 * as if this file did not exist.
 *
 * Bump VERSION to drop every cache on the next visit.
 */

const VERSION = "v1";
const STATIC_CACHE = `betrix-static-${VERSION}`;
const PAGE_CACHE = `betrix-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_PAGES = 40;

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/maskable-192.png"];

/** Paths whose responses are personal or must always be live. */
const NEVER = [/^\/api\//, /^\/admin/, /^\/account/, /^\/auth/, /^\/onboarding/, /^\/survey/, /^\/unsubscribe/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("betrix-") && !keep.has(key)) await caches.delete(key);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return;

  // Client-side navigations fetch RSC payloads; those are live data.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstPage(event) {
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    // Keep a copy of good public pages so they can still be read offline.
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(
        caches.open(PAGE_CACHE).then(async (cache) => {
          await cache.put(event.request, copy);
          const keys = await cache.keys();
          for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(stale);
        }),
      );
    }
    return response;
  } catch {
    const cached = await caches.match(event.request, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
