import { RiskBadge } from "@/components/ui/risk-badge";
import { StrongBadge } from "@/components/ui/strong-badge";
import { percent } from "@/lib/format";
import { isStrong } from "@/lib/model/tiers";
import type { ViewedPrediction } from "@/lib/access";
import type { StatMarkets } from "@/lib/model/match-stats";
import { buildTopPicks, type TopPick } from "@/lib/top-picks";
import { listedLinesFor } from "@/lib/sportybet-lines";
import { withStatOutcomes } from "@/lib/stat-results";
import { SharePicksButton } from "@/components/match/share-picks-button";

/**
 * The match's three best picks at once: the headline pick and the strongest
 * from other kinds of market, each with a reason, its sibling lines and a
 * one-line why (lib/top-picks.ts). Server-rendered, the why is a plain
 * <details>, so no script ships for it.
 */
export async function TopPicks({ prediction, corners }: { prediction: ViewedPrediction; corners?: StatMarkets | null }) {
  // Corners and shots grade from ESPN minutes after full time, not days later.
  // Only Pro sees the corners slot, so only then is SportyBet's board read for it.
  const listed = corners ? await listedLinesFor(prediction.match, prediction).catch(() => null) : undefined;
  const picks = await withStatOutcomes(buildTopPicks({ prediction, corners, listed }), prediction.match);
  if (picks.length === 0) return null;
  const strong = isStrong(prediction.topPick, prediction.match.league.code);

  return (
    <section aria-label="Top picks" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Top picks
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/15 px-1.5 text-[11px] font-bold text-brand">{picks.length}</span>
        </h2>
        <SharePicksButton matchId={prediction.match.id} label={`${prediction.match.home.name} v ${prediction.match.away.name}`} />
      </div>
      {picks.map((p) => (
        <PickCard key={p.market} pick={p} strong={p.headline && strong} />
      ))}
    </section>
  );
}

const OUTCOME = {
  win: { text: "Landed", tone: "bg-brand/15 text-brand" },
  lose: { text: "Missed", tone: "bg-rose/15 text-rose" },
  push: { text: "Refunded", tone: "bg-surface-3 text-ink-muted" },
} as const;

function PickCard({ pick, strong }: { pick: TopPick; strong: boolean }) {
  const outcome = pick.outcome ? OUTCOME[pick.outcome] : null;
  return (
    <article className={`card rounded-2xl p-4 sm:p-5 ${pick.headline ? "orbit-border" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{pick.group}</p>
          <h3 className="mt-0.5 font-display text-lg font-bold leading-snug text-ink sm:text-xl">{pick.label}</h3>
        </div>
        <span className="tnum shrink-0 rounded-xl border border-brand/35 bg-brand/[0.06] px-3 py-1.5 text-sm font-semibold text-brand">
          {percent(pick.probability)} chance
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {strong && <StrongBadge />}
        <RiskBadge pick={pick} />
        {outcome && <span className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold ${outcome.tone}`}>{outcome.text}</span>}
        {pick.reasons.map((r) => (
          <span key={r} className="inline-flex min-h-5 items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-ink-muted">
            {r}
          </span>
        ))}
      </div>

      {pick.variations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Same idea, other lines">
          {pick.variations.map((v) => (
            <span key={v.label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted">
              {v.label}
              <span className="tnum font-semibold text-ink">{percent(v.probability)}</span>
            </span>
          ))}
        </div>
      )}

      <details className="group mt-3 rounded-lg bg-brand/[0.06]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-semibold text-brand [&::-webkit-details-marker]:hidden">
          Why this pick
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <p className="px-3.5 pb-3 text-sm leading-relaxed text-ink-muted">{pick.why}</p>
      </details>
    </article>
  );
}
