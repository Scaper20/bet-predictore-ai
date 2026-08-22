/** Shared loading/unavailable states for panels that fetch their own
 * entitlement-checked data client-side (see asian-handicap-client.tsx,
 * analysis-rest-client.tsx). */

export function GatedPanelSkeleton({ title, rows = 4 }: { title?: string; rows?: number }) {
  return (
    <div className="animate-pulse">
      {title && <div className="mb-4 h-3 w-24 rounded bg-surface-3" />}
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-4 rounded bg-surface-2" style={{ width: `${85 - i * 6}%` }} />
        ))}
      </div>
    </div>
  );
}

export function GatedPanelUnavailable({ label }: { label: string }) {
  return <p className="text-xs text-ink-dim">Couldn&apos;t load {label} right now — try refreshing.</p>;
}
