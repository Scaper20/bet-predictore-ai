import type { Prediction } from "@/lib/model/predict";
import { Badge, ProbabilityBar } from "@/components/ui/primitives";
import { percent } from "@/lib/format";

/**
 * What the prediction was actually built from.
 *
 * This panel is the whole argument for trusting the rest of the page: sample
 * size, data quality and the fitted parameters, stated plainly rather than
 * hidden behind a confidence badge.
 */
export function ModelPanel({
  prediction,
  trainedOn,
}: {
  prediction: Prediction;
  trainedOn: { leagueName: string; curated: boolean; rows: number };
}) {
  const { model, sufficiency, ratings, match } = prediction;

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Under the hood
        </h2>
        <Badge
          tone={
            sufficiency.level === "good" ? "brand" : sufficiency.level === "limited" ? "amber" : "rose"
          }
        >
          {sufficiency.level === "good"
            ? "Well supported"
            : sufficiency.level === "limited"
              ? "Thin sample"
              : "Insufficient data"}
        </Badge>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-ink-muted">{sufficiency.reason}</p>

      <div className="space-y-4">
        <div>
          <ProbabilityBar
            value={model.dataQuality / 100}
            tone={model.dataQuality > 60 ? "brand" : model.dataQuality > 30 ? "amber" : "rose"}
            label="Data quality"
            sublabel={`${Math.round(model.dataQuality)}/100`}
          />
        </div>
        <div>
          <ProbabilityBar
            value={model.uncertainty}
            tone="cyan"
            label="Outcome uncertainty"
            sublabel={model.uncertainty > 0.95 ? "Very open" : model.uncertainty > 0.85 ? "Open" : "Decisive"}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5">
        <Item label="Matches fitted" value={String(model.matchesUsed)} />
        <Item label="Trained on" value={trainedOn.leagueName} small />
        <Item
          label="Home advantage"
          value={`${model.homeAdvantage >= 0 ? "+" : ""}${(Math.exp(model.homeAdvantage) * 100 - 100).toFixed(0)}%`}
          hint="Extra goals the home side is expected to score, all else equal"
        />
        <Item
          label="Low-score correction"
          value={model.rho.toFixed(3)}
          hint="Low-score correction: how much tight games deviate from independent scoring"
        />
        <Item
          label="League goal rate"
          value={model.observedGoalRate.toFixed(2)}
          hint="Goals per team per match in the fitted sample"
        />
        <Item
          label="Model confidence"
          value={prediction.topPick ? `${Math.round(prediction.topPick.confidence)}/100` : "Withheld"}
        />
      </dl>

      {(ratings.home || ratings.away) && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Fitted team ratings
          </h3>
          <div className="space-y-3">
            {[
              { name: match.home.name, r: ratings.home },
              { name: match.away.name, r: ratings.away },
            ].map(({ name, r }) => (
              <div key={name} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                {r ? (
                  <>
                    <span className="tnum text-ink-muted">
                      attack <span className={r.attack >= 0 ? "text-brand" : "text-rose"}>
                        {r.attack >= 0 ? "+" : ""}{r.attack.toFixed(2)}
                      </span>
                    </span>
                    <span className="tnum text-ink-muted">
                      defence <span className={r.defence >= 0 ? "text-brand" : "text-rose"}>
                        {r.defence >= 0 ? "+" : ""}{r.defence.toFixed(2)}
                      </span>
                    </span>
                    <span className="tnum text-ink-dim">{r.played} apps</span>
                  </>
                ) : (
                  <span className="text-ink-dim">no rating — treated as league average</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
            Ratings are log-scale deviations from league average, centred on zero. Positive
            attack means scoring above average; positive defence means conceding below it.
          </p>
        </div>
      )}
    </section>
  );
}

function Item({
  label,
  value,
  hint,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className={`tnum mt-0.5 font-bold ${small ? "truncate text-xs" : "text-sm"}`} title={value}>
        {value}
      </dd>
      {hint && <p className="mt-1 text-[10px] leading-snug text-ink-dim">{hint}</p>}
    </div>
  );
}

export { percent };
