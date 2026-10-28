import { SwitchForm } from "@/components/admin/switch-form";
import type { EngineRecord, SideRecord } from "@/lib/engine-record";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** Two weeks in shadow and enough games to tell two points apart from noise. */
const SHADOW_DAYS = 14;
const SHADOW_GAMES = 300;

/** The headline engine in shadow against the published headline, and its switch. */
export function EngineSection({ record, enabled, canSwitch }: { record: EngineRecord; enabled: boolean; canSwitch: boolean }) {
  const r = record;
  const ready = r.days >= SHADOW_DAYS && r.games >= SHADOW_GAMES;
  const ahead = r.engine && r.published ? r.engine.landed - r.published.landed : null;
  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Headline engine</h2>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-dim">
            KiqStat&rsquo;s own headline choice: the likeliest pick across results, goals, team goals, corners and shots,
            calibrated per line, that SportyBet lists and pays 1.20 or more on. {enabled ? "It publishes the headline now." : "Logged in shadow beside the published headline; it publishes only when switched on."}{" "}
            Switch after {SHADOW_DAYS} days and {SHADOW_GAMES} settled games if it lands at least as often at the higher price.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${enabled ? "bg-brand/15 text-brand" : "bg-line text-ink-muted"}`}>
          {enabled ? "Publishing" : `Shadow · day ${r.days}`}
        </span>
      </div>

      {r.games === 0 ? (
        <p className="text-sm text-ink-dim">No settled games yet{r.pending ? ` (${r.pending} logged, waiting on results)` : ". The next daily run starts the log"}.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Side title="Engine" s={r.engine} highlight={ahead !== null && ahead >= 0} />
          <Side title="Published today" s={r.published} highlight={ahead !== null && ahead < 0} />
        </div>
      )}
      {r.games > 0 && (
        <p className="text-xs text-ink-dim">
          {r.games} games settled on both sides, {r.pending} pending; same selection on {pct(r.same)} of games.
          {ahead !== null && ` Engine ${ahead >= 0 ? "+" : ""}${(ahead * 100).toFixed(1)} points.`}
          {!ready && " Too early to call."}
        </p>
      )}

      {r.mix.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.mix.map((m) => (
            <span key={m.family} className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-muted">
              {m.family} <span className="text-ink">{m.n}</span> · {pct(m.landed)}
            </span>
          ))}
        </div>
      )}

      {r.groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="text-ink-dim">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">More predictions, by group</th>
                <th className="py-2 pr-3 text-right font-medium">Graded</th>
                <th className="py-2 pr-3 text-right font-medium">Landed</th>
                <th className="py-2 pr-3 text-right font-medium">Stated</th>
                <th className="py-2 text-right font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {r.groups.map((g) => (
                <tr key={g.group} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-semibold capitalize text-ink">{g.group.replace("-", " ")}</td>
                  <td className="py-2 pr-3 text-right">{g.graded}</td>
                  <td className={`py-2 pr-3 text-right font-semibold ${g.graded >= 20 && g.landed < g.stated - 0.03 ? "text-rose" : "text-ink"}`}>{g.graded ? pct(g.landed) : "—"}</td>
                  <td className="py-2 pr-3 text-right text-ink-muted">{g.graded ? pct(g.stated) : "—"}</td>
                  <td className="py-2 text-right text-ink-dim">{g.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canSwitch ? (
        <SwitchForm
          switchKey="headline_engine"
          enabled={enabled}
          onLabel="Publish the engine's headline"
          offLabel="Back to the model's own headline"
          confirmOn={
            ready
              ? "Publish the headline engine's pick as every game's headline?"
              : `The engine has ${r.days} of ${SHADOW_DAYS} shadow days and ${r.games} of ${SHADOW_GAMES} settled games. Publish it anyway?`
          }
        />
      ) : (
        <p className="text-xs text-ink-dim">Only the owner can switch which engine publishes the headline.</p>
      )}
    </section>
  );
}

function Side({ title, s, highlight }: { title: string; s: SideRecord | null; highlight: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-brand/40" : "border-line"}`}>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">{title}</p>
      {s ? (
        <>
          <p className="tnum mt-1 font-display text-2xl font-semibold text-ink">{pct(s.landed)}</p>
          <p className="tnum mt-1 text-xs text-ink-muted">
            stated {pct(s.stated)} · {s.price !== null ? `avg price ${s.price.toFixed(2)}` : "no prices"}
            {s.atFloor !== null && ` · ${pct(s.atFloor)} at 1.20+`}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-dim">—</p>
      )}
    </div>
  );
}
