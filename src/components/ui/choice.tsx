import type { ReactNode } from "react";

/**
 * Selectable chips and cards for forms.
 *
 * Promoted from the chip visual in match/league-filter.tsx, but rebuilt on
 * real inputs rather than links. That matters here: league-filter drives the
 * URL, so anchors are correct there. These sit inside a <form> that posts to
 * a server action, so they need to be checkboxes and radios — which makes
 * them keyboard-native, announceable, submittable without JavaScript, and
 * free of the roving-tabindex and aria-checked plumbing a div-based control
 * would have needed.
 *
 * The input itself is visually hidden rather than `hidden`: `display: none`
 * takes an element out of the tab order, which would have thrown away the
 * whole reason for using one.
 */

/** Class shared by every choice control, so selected state looks identical. */
const SURFACE =
  "cursor-pointer transition-colors " +
  "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink " +
  // has-checked styles the label from the input's state, so there is no
  // client component and no useState behind any of this.
  "has-checked:border-brand/40 has-checked:bg-brand/12 has-checked:text-brand " +
  // The input is invisible, so its focus ring has to be adopted by the label.
  "has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-brand has-focus-visible:outline-offset-2";

const VISUALLY_HIDDEN = "absolute size-px overflow-hidden [clip-path:inset(50%)]";

export function ChoiceChip({
  name,
  value,
  type = "checkbox",
  defaultChecked,
  label,
  icon,
}: {
  name: string;
  value: string;
  type?: "checkbox" | "radio";
  defaultChecked?: boolean;
  label: string;
  icon?: string;
}) {
  return (
    <label
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${SURFACE}`}
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className={VISUALLY_HIDDEN}
      />
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </label>
  );
}

/**
 * The same control at card size, for a small set of choices that each need a
 * sentence of explanation — a chip row would truncate them.
 */
export function ChoiceCard({
  name,
  value,
  type = "radio",
  defaultChecked,
  label,
  description,
}: {
  name: string;
  value: string;
  type?: "checkbox" | "radio";
  defaultChecked?: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className={`block rounded-xl border p-4 text-left ${SURFACE}`}>
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className={VISUALLY_HIDDEN}
      />
      <span className="block text-sm font-semibold text-ink">{label}</span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{description}</span>
    </label>
  );
}

/**
 * Groups a set of choices under a visible question.
 *
 * A fieldset/legend rather than a div and a heading, so a screen reader
 * announces the question again with each option — without it, "Finding value"
 * on its own is meaningless.
 */
export function ChoiceGroup({
  legend,
  hint,
  children,
  layout = "wrap",
}: {
  legend: string;
  hint?: ReactNode;
  children: ReactNode;
  layout?: "wrap" | "stack";
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="mb-4 text-xs leading-relaxed text-ink-muted">{hint}</p>}
      <div className={layout === "wrap" ? "flex flex-wrap gap-2.5" : "space-y-2.5"}>{children}</div>
    </fieldset>
  );
}
