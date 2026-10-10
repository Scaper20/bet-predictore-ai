"use client";

import { useRouter } from "next/navigation";

/**
 * Which country's prices and payment methods the billing page shows. It is
 * guessed from where the visitor connects from; this lets someone travelling,
 * or on a VPN, pick where they actually pay from.
 */
export function MarketPicker({
  current,
  options,
}: {
  current: string;
  options: { country: string; label: string; flag: string; currency: string }[];
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span>Paying from</span>
      <select
        value={current}
        onChange={(e) => router.replace(`/account/billing?country=${e.target.value}`, { scroll: false })}
        className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink"
      >
        {options.map((m) => (
          <option key={m.country} value={m.country}>
            {m.flag} {m.label} ({m.currency})
          </option>
        ))}
      </select>
    </label>
  );
}
