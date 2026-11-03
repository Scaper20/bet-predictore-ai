import { SwitchForm } from "@/components/admin/switch-form";
import { PROP_SPECS } from "@/lib/model/player-props";
import type { PropsRecord } from "@/lib/props-record";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 1000) / 10}%`);
/** Enough graded picks to tell a couple of points of calibration apart from noise. */
const READY_PICKS = 400;
const READY_DAYS = 21;

/** Player props in shadow: how the logged picks landed against what they said and what SportyBet said, and the switch. */
export function PropsSection({ record, enabled, canSwitch }: { record: PropsRecord; enabled: boolean; canSwitch: boolean }) {
  const r = record;
  const days = r.days;
  const ready = r.graded >= READY_PICKS && days >= READY_DAYS;
  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Player props</h2>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-dim">
            Picks on SportyBet&rsquo;s player lines (72&ndash;88%, price 1.18+), logged once lineups are confirmed and graded from FotMob counts; a player who
            did not play is void. {enabled ? "Published now." : "Shadow only until switched on."} Switch after {READY_DAYS} days and {READY_PICKS} graded picks if
            they land about as often as they say, and at least as often as SportyBet&rsquo;s own price says (docs/props-backtest.md).
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${enabled ? "bg-brand/15 text-brand" : "bg-line text-ink-muted"}`}>
          {enabled ? "Publishing" : `Shadow · day ${days}`}
        </span>
      </div>

      {r.graded === 0 ? (
        <p className="text-sm text-ink-dim">No graded picks yet. Picks are logged about an hour before kickoff once migration 0094 is applied and SportyBet lists player lines.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[["Landed", r.landed], ["We said", r.stated], ["SportyBet said", r.bookStated]].map(([label, v]) => (
              <div key={String(label)} className="rounded-lg border border-line p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">{label}</p>
                <p className="tnum mt-1 font-display text-2xl font-semibold">{pct(v as number | null)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="text-ink-dim">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="py-2 pr-3 text-right font-medium">Graded</th>
                  <th className="py-2 pr-3 text-right font-medium">Landed</th>
                  <th className="py-2 pr-3 text-right font-medium">Stated</th>
                  <th className="py-2 pr-3 text-right font-medium">SportyBet</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg price</th>
                  <th className="py-2 text-right font-medium">Void · pending</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {r.markets.map((m) => (
                  <tr key={m.market} className="border-b border-line/60">
                    <td className="py-2 pr-3">{PROP_SPECS[m.market].label}</td>
                    <td className="py-2 pr-3 text-right">{m.graded}</td>
                    <td className="py-2 pr-3 text-right">{pct(m.landed)}</td>
                    <td className="py-2 pr-3 text-right">{pct(m.stated)}</td>
                    <td className="py-2 pr-3 text-right">{pct(m.bookStated)}</td>
                    <td className="py-2 pr-3 text-right">{m.price === null ? "–" : m.price.toFixed(2)}</td>
                    <td className="py-2 text-right">{m.voids} · {m.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canSwitch ? (
        <SwitchForm
          switchKey="player_props"
          enabled={enabled}
          onLabel="Publish player prop picks"
          offLabel="Back to shadow only"
          confirmOn={
            ready
              ? "Publish player prop picks on the board, match and player pages?"
              : `Props have ${days} of ${READY_DAYS} shadow days and ${r.graded} of ${READY_PICKS} graded picks. Publish anyway?`
          }
        />
      ) : (
        <p className="text-xs text-ink-dim">Only the owner can publish player props.</p>
      )}
    </section>
  );
}
