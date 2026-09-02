import Link from "next/link";
import type { Analysis } from "@/lib/ai/analyst";
import { Badge } from "@/components/ui/primitives";
import { Gate } from "@/components/entitlements/gate";
import { AnalysisRestClient } from "./analysis-rest-client";

/**
 * When the analysis is enhanced (source: "claude"), everything past the
 * lead paragraph is a Pro perk. matchDetail() computes one shared, cached
 * analysis per match (not per user — reading the session there would break
 * the page's ISR caching, see (app)/layout.tsx's comment), so this can't
 * decide who sees what by branching on the viewer here. Instead: only
 * `analysis.body[0]` and *lengths* (never the paragraph 2+ strings or
 * factors themselves) are used in this server-rendered branch, and the real
 * content is fetched by AnalysisRestClient from the entitlement-checked
 * /api/match/[id] route — so an unentitled viewer's rendered page never
 * contains the gated prose at all, not even hidden behind a client toggle.
 */
export function AnalysisPanel({ analysis, matchId }: { analysis: Analysis; matchId: string }) {
  const isAiWritten = analysis.source === "claude";
  const lead = analysis.body[0];

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Match analysis
        </h2>
        <Badge tone={isAiWritten ? "violet" : "neutral"}>
          {isAiWritten ? "Enhanced" : "Model generated"}
        </Badge>
      </div>

      <h3 className="font-display text-xl font-bold leading-snug">{analysis.headline}</h3>

      <div className="mt-4 space-y-3.5">
        {lead && <p className="text-sm leading-relaxed text-ink-muted">{lead}</p>}

        {isAiWritten ? (
          <Gate
            requires="pro"
            fallback={
              analysis.body.length > 1 || analysis.factors.length > 0 ? (
                <p className="text-xs text-ink-dim">
                  The rest of this enhanced breakdown is a{" "}
                  <Link href="/account/billing?plan=pro" className="text-brand underline underline-offset-2">
                    Pro
                  </Link>{" "}
                  feature.
                </p>
              ) : null
            }
          >
            <AnalysisRestClient matchId={matchId} />
          </Gate>
        ) : (
          <AnalysisRest body={analysis.body.slice(1)} factors={analysis.factors} />
        )}
      </div>
    </section>
  );
}

export function AnalysisRest({ body, factors }: { body: string[]; factors: string[] }) {
  return (
    <>
      {body.map((para, i) => (
        <p key={i} className="text-sm leading-relaxed text-ink-muted">
          {para}
        </p>
      ))}
      {factors.length > 0 && (
        <ul className="mt-1.5 space-y-2 border-t border-line pt-5">
          {factors.map((f, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-ink-muted">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
