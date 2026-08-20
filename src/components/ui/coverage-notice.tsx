import type { ProviderHealth } from "@/lib/types";

/**
 * Tells the operator when the app is running on the shared public key.
 *
 * Coverage is genuinely thin in that mode, and it is better to say so than to
 * let someone conclude the feeds are broken.
 */
export function CoverageNotice({
  coverage,
}: {
  coverage: { full: boolean; providers: ProviderHealth[] };
}) {
  if (coverage.full) return null;

  return (
    <div className="rounded-xl border border-cyan/25 bg-cyan/5 p-4">
      <p className="text-sm font-semibold text-cyan">Running on the shared public data key</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        Live scores are complete, but fixture lists are capped at a few rows per request by the
        upstream free tier. Set <code className="font-mono text-ink">FOOTBALL_DATA_API_KEY</code> or{" "}
        <code className="font-mono text-ink">API_FOOTBALL_KEY</code> to unlock full coverage —
        see <code className="font-mono text-ink">.env.example</code>. Everything shown is still
        real data.
      </p>
    </div>
  );
}
