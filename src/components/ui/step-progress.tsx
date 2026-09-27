/**
 * Progress through a short, ordered flow.
 *
 * Deliberately not built on ProbabilityBar: that is `role="meter"`, which
 * describes a quantity within a range. A wizard is an ordered list of named
 * places, so this is an <ol> with aria-current="step" — a screen reader then
 * says "step 2 of 3, How you use predictions" instead of "66 percent".
 *
 * The labels are visible only on wider screens; on a phone the dots carry the
 * shape and the "Step 2 of 3" line carries the meaning, which is why that
 * line is always rendered rather than being decorative.
 */
export function StepProgress({
  steps,
  current,
}: {
  /** Short labels, in order. */
  steps: string[];
  /** 1-based. */
  current: number;
}) {
  return (
    <div>
      <p className="text-center text-xs font-medium tracking-wide text-ink-dim">
        Step {current} of {steps.length}
      </p>

      <ol className="mt-3 flex items-center justify-center gap-2">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;

          return (
            <li
              key={label}
              className="flex items-center gap-2"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`size-2 rounded-full transition-colors ${
                  done || active ? "bg-brand" : "bg-surface-3"
                }`}
                aria-hidden
              />
              <span
                className={`hidden text-xs sm:inline ${
                  active ? "font-semibold text-ink" : "text-ink-dim"
                }`}
              >
                {label}
              </span>
              {n < steps.length && (
                <span
                  className={`h-px w-6 ${done ? "bg-brand/40" : "bg-line"}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
