/**
 * Promise.all over `items` with at most `limit` running at once, results in
 * input order. For fan-outs whose size a user controls (a pasted code of up
 * to 50 games): unbounded, one request would open 50 SportyBet calls and 50
 * model builds together.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}
