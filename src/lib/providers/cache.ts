/**
 * Server-side TTL cache with in-flight request coalescing.
 *
 * Upstream football feeds are rate limited hard (football-data.org allows 10
 * requests/minute on the free tier), so two things matter: never re-fetch
 * inside the TTL, and never fire the same request twice concurrently when a
 * burst of users hits a cold key at once.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Stale entries are only evicted on access, plus this periodic sweep cap. */
const MAX_ENTRIES = 500;

/**
 * How long to keep serving a stale value after the loader fails.
 *
 * Without this, an upstream outage means every single request retries the
 * failing call: the stale entry is already expired, so it never short-circuits.
 * Extending its life briefly on failure turns a hammering loop into one retry
 * per cooldown while still returning real (if slightly old) data.
 */
const STALE_COOLDOWN_MS = 15_000;

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const task = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      if (store.size > MAX_ENTRIES) sweep();
      return value;
    } catch (err) {
      // Serve stale data rather than an error page when upstream blips, and
      // back off before trying again so a hard-down provider is not hammered.
      if (hit) {
        store.set(key, { value: hit.value, expiresAt: Date.now() + STALE_COOLDOWN_MS });
        return hit.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  // Still oversized after dropping expired entries: drop oldest insertions.
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= excess) break;
      store.delete(k);
    }
  }
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}
