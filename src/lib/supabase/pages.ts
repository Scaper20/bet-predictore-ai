/**
 * Every row of a query, page by page. The Data API returns at most 1,000
 * rows per request (Supabase's max_rows) and says nothing when it stops
 * there, so a read that can pass 1,000 rows must page. The query must have a
 * stable order (a unique tie-break), or rows can repeat or go missing between
 * pages.
 */
export async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { size?: number; max?: number } = {},
): Promise<T[]> {
  const size = opts.size ?? 1000;
  const max = opts.max ?? 50_000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
