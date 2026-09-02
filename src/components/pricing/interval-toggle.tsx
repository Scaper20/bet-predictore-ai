"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Monthly / yearly switch, promoted from the ad-hoc button pair in
 * billing-plans.tsx and rebuilt on real radio inputs.
 *
 * Radios rather than buttons because this is a choice between two mutually
 * exclusive states, which is what a radiogroup means — arrow keys work, the
 * group announces itself, and there is no aria-pressed bookkeeping to get
 * wrong.
 *
 * The choice goes in the URL rather than component state so that a link to
 * the yearly view is shareable and the back button undoes the switch. That
 * also keeps the cards themselves a Server Component: only this control ships
 * JavaScript.
 */
export function IntervalToggle({ value }: { value: "monthly" | "yearly" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: "monthly" | "yearly") {
    const query = new URLSearchParams(params.toString());
    if (next === "monthly") query.delete("interval");
    else query.set("interval", next);
    const qs = query.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <fieldset
      className={`inline-flex rounded-lg border border-line bg-surface-2 p-1 text-sm transition-opacity ${
        pending ? "opacity-70" : ""
      }`}
    >
      <legend className="sr-only">Billing interval</legend>

      {(["monthly", "yearly"] as const).map((option) => (
        <label
          key={option}
          className={`cursor-pointer rounded-md px-3.5 py-1.5 font-medium transition-colors has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-brand has-focus-visible:outline-offset-2 ${
            value === option ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          <input
            type="radio"
            name="interval"
            value={option}
            checked={value === option}
            onChange={() => select(option)}
            className="absolute size-px overflow-hidden [clip-path:inset(50%)]"
          />
          {option === "monthly" ? "Monthly" : "Yearly"}
        </label>
      ))}
    </fieldset>
  );
}
