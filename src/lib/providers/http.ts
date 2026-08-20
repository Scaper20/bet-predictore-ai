/** Shared fetch helper: timeouts, typed errors, and no Next.js data caching. */

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

export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; provider?: string } = {},
): Promise<T> {
  const { headers = {}, timeoutMs = 12_000, provider } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
      // We run our own TTL cache; Next's fetch cache would double-cache.
      cache: "no-store",
    });

    if (!res.ok) {
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
