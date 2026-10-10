/*
 * KiqStat service worker.
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
 * Also shows push notifications (sent by the crons via src/lib/push) and
 * opens the right page when one is tapped.
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

/* ------------------------------------------------------------ Notifications */

/** A path on this site, whatever the payload says: a tap never leaves KiqStat. */
function sameOriginUrl(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(data.title || "KiqStat", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      // Android's status bar shows this as a white silhouette.
      badge: "/icons/badge-96.png",
      tag,
      // A newer notification with the same tag replaces the old one, and
      // still buzzes rather than swapping in silently.
      renotify: Boolean(tag),
      data: { url: sameOriginUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      // Reuse an open KiqStat window rather than stacking new ones.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const focused = await client.focus();
          await (focused || client).navigate(url);
          return;
        } catch {
          // An uncontrolled window cannot be navigated from here; open one.
          break;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/**
 * The push service rotated this device's subscription. Re-subscribe with the
 * same key and tell the server, so the device does not silently drop off the
 * list. Topics fall back to the defaults on the new row; if the browser never
 * fires this, the app's once-a-session sync catches the change instead.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const fresh =
        event.newSubscription ||
        (old && old.options ? await self.registration.pushManager.subscribe(old.options) : null);
      if (!fresh) return;
      await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: fresh.toJSON() }),
      });
      if (old && old.endpoint !== fresh.endpoint) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
      }
    })().catch(() => {}),
  );
});
