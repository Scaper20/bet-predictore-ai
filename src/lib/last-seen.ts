/**
 * Whether to record that a signed-in user was just seen (profiles.last_seen_at).
 *
 * The proxy runs on every page request. It used to send the update each time
 * and let the database's WHERE clause turn most of them into no-ops, which
 * was about 19,000 requests a day (each a database round trip) for a column
 * that changes once per user per ten minutes. This remembers, per server
 * instance, who was recorded and when, so the call is not made at all inside
 * the window. Another instance may still record the same user once more;
 * that costs one extra write, and the WHERE clause still bounds it.
 *
 * Module state is only ever a cache: losing it means one extra update.
 */
export const LAST_SEEN_WINDOW_MS = 10 * 60_000;
/** Users remembered at once; past this the oldest half is forgotten. */
const MAX_REMEMBERED = 5_000;

const seen = new Map<string, number>();

export function shouldRecordSeen(userId: string, now = Date.now()): boolean {
  const last = seen.get(userId);
  if (last !== undefined && now - last < LAST_SEEN_WINDOW_MS) return false;
  seen.set(userId, now);
  if (seen.size > MAX_REMEMBERED) {
    // Map keeps insertion order: drop the oldest entries.
    let drop = Math.floor(MAX_REMEMBERED / 2);
    for (const key of seen.keys()) {
      if (drop-- <= 0) break;
      seen.delete(key);
    }
  }
  return true;
}

/** For tests. */
export function resetLastSeen() {
  seen.clear();
}
