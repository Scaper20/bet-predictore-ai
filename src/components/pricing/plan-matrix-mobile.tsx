"use client";

import { useState } from "react";
import type { Tier } from "@/lib/entitlements";
import { PLANS, PLAN_MATRIX } from "@/lib/pricing";

/**
 * The plan comparison, for a phone.
 *
 * The desktop table is five columns wide with a frozen first column, which is
 * the right shape for a mouse and a 1440px screen. On a 390px one it showed
 * roughly one and a half columns and asked the reader to scrub sideways
 * through forty rows — the single least usable thing on the mobile site.
 *
 * A comparison is between two things. So this asks which two, and then shows
 * them side by side with no horizontal scrolling at all. Native <select>
 * rather than a custom control: it opens as the platform picker, it is
 * keyboard and screen-reader complete for free, and it is the one widget every
 * phone user already knows.
 *
 * Defaults to Free vs the recommended plan, because that is the comparison
 * the page exists to prompt.
 */
export function PlanMatrixMobile() {
  const ordered = [...PLANS].sort((a, b) => a.order - b.order);
  const recommended = ordered.find((p) => p.badge) ?? ordered[ordered.length - 1];

  const [left, setLeft] = useState<Tier>(ordered[0].id);
  const [right, setRight] = useState<Tier>(recommended.id);

  const nameOf = (id: Tier) => ordered.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="sm:hidden">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {nameOf(left)} compared with {nameOf(right)}
        </caption>
        {/*
          The pickers ARE the column headers. Rendered above the table they
          repeated the plan names immediately below them and did not line up
          with the columns they controlled; in the header cells there is one
          label per column, sitting exactly over it.
        */}
        <thead>
          <tr>
            <th scope="col" className="w-[42%] pb-3 text-left">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col" className="px-1 pb-3">
              <PlanPicker label="First plan" value={left} onChange={setLeft} plans={ordered} />
            </th>
            <th scope="col" className="px-1 pb-3">
              <PlanPicker label="Second plan" value={right} onChange={setRight} plans={ordered} />
            </th>
          </tr>
        </thead>

        {PLAN_MATRIX.map((group) => (
          <tbody key={group.group}>
            <tr>
              <th
                scope="colgroup"
                colSpan={3}
                className="pb-1 pt-5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand"
              >
                {group.group}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="py-2.5 pr-3 text-left text-[13px] font-normal text-ink-muted">
                  {row.label}
                </th>
                <Cell value={row.values[left]} />
                <Cell value={row.values[right]} />
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function PlanPicker({
  label,
  value,
  onChange,
  plans,
}: {
  label: string;
  value: Tier;
  onChange: (t: Tier) => void;
  plans: { id: Tier; name: string }[];
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Tier)}
        className="w-full appearance-none truncate rounded-lg border border-line bg-surface-2 px-2 py-2.5 text-center text-xs font-semibold text-ink outline-none focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <td className="tnum py-2.5 text-center text-[13px] text-ink">{value}</td>;
  }
  // The glyph is decorative; the word beside it is what gets announced, so a
  // row never reads as an unlabelled tick.
  return (
    <td className="py-2.5 text-center">
      <span className={value ? "text-brand" : "text-ink-dim"} aria-hidden>
        {value ? "✓" : "—"}
      </span>
      <span className="sr-only">{value ? "Included" : "Not included"}</span>
    </td>
  );
}
