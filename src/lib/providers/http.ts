/** Shared fetch helper: timeouts, typed errors and per-feed rate budgets. */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly provider?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * A rolling one-minute request budget for one upstream feed.
 *
 * football-data.org allows 10 requests a minute on the free plan and
 * TheSportsDB 30 (100 on a paid key); going over earns a 429 and, on
 * football-data, a lockout for the rest of the minute. Spending the budget
 * deliberately is better than discovering it: a request that can't get a slot
 * within `maxWaitMs` fails fast, so the TTL cache serves its stale copy and the
 * other feed fills the gap, instead of a page hanging for most of a minute.
 *
 * This is per server instance, which is the right granularity on serverless:
 * each instance keeps itself under the limit, and the cache keeps the number
 * of instances calling at once small.
 */
export class RateGate {
  private stamps: number[] = [];
  private blockedUntil = 0;

  constructor(
    readonly provider: string,
    private perMinute: number,
    private maxWaitMs = 4_000,
  ) {}

  /** Wait for a slot, or throw a 429 when none frees up in time. */
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (this.blockedUntil > now) {
        const wait = this.blockedUntil - now;
        if (wait > this.maxWaitMs) throw this.refusal();
        await sleep(wait);
        continue;
      }
      this.stamps = this.stamps.filter((t) => t > now - 60_000);
      if (this.stamps.length < this.perMinute) {
        this.stamps.push(now);
        return;
      }
      const wait = this.stamps[0] + 60_000 - now + 25;
      if (wait > this.maxWaitMs) throw this.refusal();
      await sleep(wait);
    }
  }

  /** Upstream said stop (a 429, or zero requests left): hold off for `seconds`. */
  pause(seconds: number) {
    const until = Date.now() + Math.max(1, Math.min(seconds, 120)) * 1000;
    this.blockedUntil = Math.max(this.blockedUntil, until);
  }

  private refusal() {
    return new ProviderError("Request budget for this minute is spent", 429, this.provider);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson<T>(
  url: string,
  opts: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    provider?: string;
    gate?: RateGate;
    /** Read rate-limit headers (or anything else) off the response. */
    onHeaders?: (headers: Headers, status: number) => void;
  } = {},
): Promise<T> {
  const { headers = {}, timeoutMs = 12_000, provider, gate, onHeaders } = opts;
  await gate?.take();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
      // No `cache` option on purpose. The default doesn't persist responses
      // (our own TTL cache does that), but `cache: "no-store"` here used to
      // force every page that loads football data into per-request rendering,
      // silently cancelling the `revalidate` each of those pages declares.
    });
    onHeaders?.(res.headers, res.status);

    if (!res.ok) {
      if (res.status === 429) gate?.pause(Number(res.headers.get("Retry-After")) || 60);
      throw new ProviderError(
        `Upstream responded ${res.status} ${res.statusText}`,
        res.status,
        provider,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError(`Request timed out after ${timeoutMs}ms`, 504, provider);
    }
    throw new ProviderError(
      err instanceof Error ? err.message : "Unknown network failure",
      undefined,
      provider,
    );
  } finally {
    clearTimeout(timer);
  }
}
