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
import { PickAction } from "@/components/match/pick-action";
import type { Match } from "@/lib/types";

/**
 * The match's three best picks at once: the headline pick and the strongest
 * from other kinds of market, each with a reason, its sibling lines and a
 * one-line why (lib/top-picks.ts), and a button that puts it on the combo.
 * Server-rendered; the why is a plain <details>.
 */
export async function TopPicks({
  prediction,
  corners,
  notes,
}: {
  prediction: ViewedPrediction;
  corners?: StatMarkets | null;
  /** Shown under the headline pick: why it isn't the model's first lean, thin data, and so on. */
  notes?: React.ReactNode;
}) {
  // Corners and shots grade from ESPN minutes after full time, not days later.
  // Only Pro sees the corners slot, so only then is SportyBet's board read for it.
  const listed = corners ? await listedLinesFor(prediction.match, prediction).catch(() => null) : undefined;
  const picks = await withStatOutcomes(buildTopPicks({ prediction, corners, listed }), prediction.match);
  if (picks.length === 0) return null;
  const strong = isStrong(prediction.topPick, prediction.match.league.code);

  return (
    <section aria-label="Top picks" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Top picks
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/15 px-1.5 text-[11px] font-bold text-brand">{picks.length}</span>
        </h2>
        <SharePicksButton matchId={prediction.match.id} label={`${prediction.match.home.name} v ${prediction.match.away.name}`} />
      </div>
      {picks.map((p) => (
        <PickCard key={p.market} pick={p} strong={p.headline && strong} match={prediction.match}>
          {p.headline ? notes : null}
        </PickCard>
      ))}
    </section>
  );
}

const OUTCOME = {
  win: { text: "Landed", tone: "bg-brand/15 text-brand" },
  lose: { text: "Missed", tone: "bg-rose/15 text-rose" },
  push: { text: "Refunded", tone: "bg-surface-3 text-ink-muted" },
} as const;

/**
 * One pick on one card: what, how likely, and the button that puts it on
 * the combo. The reasons stay as chips; the other lines and the why fold
 * into one drawer, so three picks read at a glance.
 */
function PickCard({ pick, strong, match, children }: { pick: TopPick; strong: boolean; match: Match; children?: React.ReactNode }) {
  const outcome = pick.outcome ? OUTCOME[pick.outcome] : null;
  const asPick = { market: pick.market, label: pick.label, group: pick.group, probability: pick.probability, fairOdds: pick.probability > 0 ? 1 / pick.probability : 0, confidence: 0 };
  return (
    <article className={`card rounded-2xl p-4 ${pick.headline ? "orbit-border" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
            {pick.headline ? "Our pick" : pick.group}
            {strong && <StrongBadge />}
            <RiskBadge pick={pick} />
            {outcome && <span className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold normal-case tracking-normal ${outcome.tone}`}>{outcome.text}</span>}
          </p>
          <h3 className={`mt-1 font-display font-bold leading-snug text-ink ${pick.headline ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>{pick.label}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`tnum font-mono font-semibold tracking-tight text-brand ${pick.headline ? "text-2xl" : "text-lg"}`}>{percent(pick.probability)}</span>
          <PickAction match={match} pick={asPick} />
        </div>
      </div>

      {pick.reasons.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pick.reasons.map((r) => (
            <span key={r} className="inline-flex min-h-5 items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-ink-muted">
              {r}
            </span>
          ))}
        </div>
      )}

      {children}

      <details className="group mt-2.5 border-t border-line pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          {pick.variations.length > 0 ? "Why, and other lines" : "Why this pick"}
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <p className="pt-2 text-sm leading-relaxed text-ink-muted">{pick.why}</p>
        {pick.variations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Same idea, other lines">
            {pick.variations.map((v) => (
              <span key={v.label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted">
                {v.label}
                <span className="tnum font-semibold text-ink">{percent(v.probability)}</span>
              </span>
            ))}
          </div>
        )}
      </details>
    </article>
  );
}
