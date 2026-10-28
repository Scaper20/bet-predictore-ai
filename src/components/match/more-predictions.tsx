import Link from "next/link";
import { ProTag } from "@/components/entitlements/locked-pick";
import { percent } from "@/lib/format";
import { ENGINE_GROUPS, type EngineGroup } from "@/lib/model/headline-engine";
import type { ViewedPrediction } from "@/lib/access";

const UPGRADE_HREF = "/account/billing?plan=pro";
const groupLabel = (g: EngineGroup) => ENGINE_GROUPS.find((x) => x.id === g)?.label ?? g;

/**
 * The headline engine's best pick in each group on this game (result,
 * goals, team goals, corners, shots): every one a line SportyBet lists at
 * 1.20 or more, at its calibrated chance (model/headline-engine.ts). A free
 * viewer sees the strongest; the rest are named and locked (access.ts).
 */
export function MorePredictions({ prediction }: { prediction: ViewedPrediction }) {
  const open = prediction.engine?.groups ?? [];
  const locked = prediction.lockedGroups ?? [];
  if (open.length + locked.length === 0) return null;
  return (
    <section aria-label="More predictions" className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">More predictions</h2>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">Best per market · 1.20+</p>
      </div>
      <ul className="mt-4 divide-y divide-line/70">
        {open.map((g) => (
          <li key={g.group} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{groupLabel(g.group)}</p>
              <p className="mt-0.5 font-semibold leading-snug text-ink">{g.label}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum text-sm font-semibold text-brand">{percent(g.calibrated)}</p>
              <p className="tnum text-[11px] text-ink-dim">{g.price !== null ? `SportyBet ${g.price.toFixed(2)}` : `about ${g.loadPrice.toFixed(2)}`}</p>
            </div>
          </li>
        ))}
        {locked.map((g) => (
          <li key={g} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{groupLabel(g)}</p>
              <p className="mt-0.5 flex items-center gap-2 font-semibold text-ink-muted">
                <span aria-hidden className="select-none blur-[5px]">Hidden selection</span> <ProTag />
              </p>
            </div>
            <Link href={UPGRADE_HREF} className="shrink-0 text-xs font-semibold text-brand hover:underline">
              Unlock
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
