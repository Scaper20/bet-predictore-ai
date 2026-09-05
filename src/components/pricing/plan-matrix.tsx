import { PLANS, PLAN_MATRIX } from "@/lib/pricing";

/**
 * The full plan comparison.
 *
 * A real <table>, not a grid of divs. Four columns of yes/no is exactly what
 * tables are for, and it is what lets a screen reader announce "Asian
 * handicap, Pro, included" instead of reading forty loose ticks in a row —
 * which is the whole content of this section.
 *
 * On a phone it scrolls sideways with the plan names frozen, rather than
 * collapsing into four stacked lists. Stacking would technically fit, but it
 * destroys the only thing anyone opens a comparison table to do: put two
 * columns next to each other.
 */
export function PlanMatrix() {
  const ordered = [...PLANS].sort((a, b) => a.order - b.order);

  return (
    /*
     * `relative` is load-bearing, not decoration.
     *
     * Every Cell below renders an `sr-only` span, and Tailwind's sr-only is
     * `position: absolute`. Absolutely-positioned boxes are clipped by an
     * ancestor's overflow only when that ancestor is their containing block —
     * so without a positioned wrapper these forty-odd spans resolved against
     * the initial containing block, at the scrolled table's x≈700, and leaked
     * the full 44rem table width into document.scrollWidth. The page then
     * scrolled sideways to 683px on a 375px phone while the table itself
     * scrolled correctly, which is a confusing way to be broken.
     */
    /*
     * Desktop only. Below sm the same data is rendered by
     * PlanMatrixMobile as a two-plan comparison — five columns in 390px
     * showed about one and a half of them and asked the reader to scrub
     * sideways through forty rows.
     */
    <div className="no-scrollbar relative -mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:block sm:px-0">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <caption className="sr-only">
          Feature comparison across the Free, Weekend Pass, Pro and VIP plans
        </caption>

        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-canvas py-3 text-left font-semibold">
              <span className="sr-only">Feature</span>
            </th>
            {ordered.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className="px-4 py-3 text-center text-sm font-semibold text-ink"
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>

        {PLAN_MATRIX.map((group) => (
          <tbody key={group.group}>
            <tr>
              <th
                scope="colgroup"
                colSpan={ordered.length + 1}
                className="sticky left-0 bg-canvas pb-2 pt-6 text-left text-xs font-semibold uppercase tracking-[0.18em] text-brand"
              >
                {group.group}
              </th>
            </tr>

            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-canvas py-3 pr-4 text-left font-normal text-ink-muted"
                >
                  {row.label}
                </th>
                {ordered.map((plan) => (
                  <td key={plan.id} className="px-4 py-3 text-center">
                    <Cell value={row.values[plan.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="tnum text-ink">{value}</span>;
  }
  // The glyph is decorative; the word next to it is what gets announced, so a
  // row never reads as an unlabelled tick.
  return value ? (
    <>
      <span className="text-brand" aria-hidden>
        ✓
      </span>
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <span className="text-ink-dim" aria-hidden>
        —
      </span>
      <span className="sr-only">Not included</span>
    </>
  );
}
