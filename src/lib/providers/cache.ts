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
      // Serve stale data rather than an error page when upstream blips.
      if (hit) return hit.value;
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
