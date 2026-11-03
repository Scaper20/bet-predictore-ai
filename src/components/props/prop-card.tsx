import Link from "next/link";
import { Crest } from "@/components/ui/crest";
import { PropBook } from "@/components/props/prop-book";
import { initials } from "@/lib/player-page-core";
import { matchPath, playerPath } from "@/lib/routes";
import { PROP_SPECS } from "@/lib/model/player-props";
import type { PropRisk } from "@/lib/model/prop-picks";
import { clearedCount, factLine, pickLabel, type PropRow } from "@/lib/props-view";
import type { SlipLeg } from "@/lib/slip";

const UPGRADE_HREF = "/account/billing?plan=pro";
const POS = ["GK", "DF", "MF", "FW"];

const RISK_TONE: Record<PropRisk, string> = {
  low: "border-brand/35 text-brand",
  medium: "border-amber/40 text-amber",
  high: "border-rose/40 text-rose",
};
const RISK_LABEL: Record<PropRisk, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

const pct = (p: number) => `${Math.round(p * 100)}%`;

function PlayerBadge({ name, position }: { name: string; position: number | null }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface-2 font-display text-sm font-bold">
      {initials(name)}
      {position !== null && (
        <span className="absolute -bottom-1.5 -right-1.5 rounded bg-surface-3 px-1 text-[9px] font-bold text-ink-muted">{POS[position]}</span>
      )}
    </span>
  );
}

/** The last eight starts against a line: filled pip = over. */
export function RecentPips({ recent, line }: { recent: number[]; line: number }) {
  const xs = recent.slice(0, 8).reverse();
  if (xs.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {xs.map((v, i) => (
        <span
          key={i}
          title={String(v)}
          className={`grid h-5 min-w-5 place-items-center rounded px-0.5 font-mono text-[10px] font-bold tnum ${v > line ? "bg-brand/20 text-brand" : "bg-surface-3 text-ink-dim"}`}
        >
          {v}
        </span>
      ))}
    </span>
  );
}

function Facts({ row }: { row: PropRow }) {
  const line = row.pick?.line ?? factLine(row.recent, row.market);
  const side = row.pick?.side ?? "over";
  const { hits, of } = clearedCount(row.recent, line, side);
  if (of === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-ink-muted">
        {side === "over" ? "Over" : "Under"} {line} in <span className="font-semibold text-ink">{hits} of {of}</span> recent starts
      </p>
      <RecentPips recent={row.recent} line={line} />
    </div>
  );
}

/** The ±3 ladder: our chance of over at each line; a price where SportyBet lists it. */
export function Ladder({ row }: { row: PropRow }) {
  if (row.rungs.length === 0) return null;
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {row.rungs.map((r) => {
        const picked = row.pick?.line === r.line;
        const listed = r.overPrice !== null || r.underPrice !== null;
        return (
          <div
            key={r.line}
            className={`min-w-[4.25rem] shrink-0 rounded-lg border px-2 py-1.5 text-center ${picked ? "border-brand/50 bg-brand/10" : "border-line bg-surface-2"}`}
          >
            <p className="font-mono text-[11px] text-ink-dim tnum">{r.line}+</p>
            <p className="font-mono text-sm font-bold tnum">{pct(r.over)}</p>
            <div className="mx-auto mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <span className="seg-grow block h-full rounded-full bg-brand/70" style={{ width: pct(r.over) }} />
            </div>
            <p className={`mt-1 text-[10px] font-semibold ${listed ? "text-cyan" : "text-ink-dim"}`}>
              {r.overPrice ? `@${r.overPrice.toFixed(2)}` : listed ? "listed" : "model"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function legFor(row: PropRow): SlipLeg | null {
  const p = row.pick;
  if (!p?.selection || !row.eventId) return null;
  const label = `${row.playerName}: ${pickLabel(row.market, p.line, p.side)}`;
  return {
    matchId: row.publicId,
    eventId: row.eventId,
    fixture: `${row.homeName} v ${row.awayName}`,
    homeName: row.homeName,
    awayName: row.awayName,
    league: row.leagueName,
    kickoff: row.kickoff,
    market: p.selection,
    label,
    probability: p.probability,
    fairOdds: Math.round((1 / p.probability) * 100) / 100,
    ...(p.price ? { bookmakerOdds: p.price } : {}),
  };
}

/**
 * One player in one market. Paid: projection, the pick (a SportyBet line)
 * with risk and a code button, and the ladder. Free: who, which market and
 * the recent facts, with the pick locked.
 */
export function PropCard({ row, showMatch = true, index = 0 }: { row: PropRow; showMatch?: boolean; index?: number }) {
  const spec = PROP_SPECS[row.market];
  const leg = legFor(row);
  return (
    <article className="card space-y-3 p-4 transition-colors duration-200 hover:border-line-strong" style={{ ["--i" as string]: index }}>
      <header className="flex items-start gap-3">
        <PlayerBadge name={row.playerName} position={row.position} />
        <div className="min-w-0 flex-1">
          <Link href={playerPath(row.playerId, row.playerName)} prefetch={false} className="block truncate font-semibold hover:text-brand">
            {row.playerName}
          </Link>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-dim">
            <Crest src={row.teamCrest ?? undefined} name={row.teamName} size={14} />
            <span className="truncate">{row.teamName}</span>
            {showMatch && (
              <>
                <span aria-hidden>·</span>
                <Link href={matchPath(row.publicId)} prefetch={false} className="truncate hover:text-brand">
                  {row.homeName} v {row.awayName}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">{spec.label}</p>
          <p className={`mt-0.5 text-[10.5px] font-semibold ${row.lineup === "confirmed" ? "text-brand" : "text-amber"}`}>
            {row.lineup === "confirmed" ? "Confirmed XI" : "Likely starter"}
          </p>
        </div>
      </header>

      {row.locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet/25 bg-violet/8 px-3.5 py-3">
          <p className="text-sm">
            <span className="mr-1.5 rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet">Pro</span>
            {row.hasPick ? "Our pick and its line" : "Projection and line-by-line chances"}
          </p>
          <Link href={UPGRADE_HREF} className="text-xs font-bold text-brand hover:underline">
            Unlock <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {row.pick ? (
              <div className="min-w-0">
                <p className="font-display text-lg font-bold leading-tight">{pickLabel(row.market, row.pick.line, row.pick.side)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="font-mono font-semibold text-ink tnum">{pct(row.pick.probability)}</span>
                  {row.pick.price && <span className="font-mono tnum">@{row.pick.price.toFixed(2)} SportyBet</span>}
                  <span className={`inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-semibold ${RISK_TONE[row.pick.risk]}`}>
                    {RISK_LABEL[row.pick.risk]}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Projected <span className="font-mono text-base font-bold text-ink tnum">{row.mean?.toFixed(spec.step === 5 ? 0 : 1)}</span> {spec.label.toLowerCase()}
              </p>
            )}
            {row.pick && leg && <PropBook leg={leg} />}
          </div>
          <Ladder row={row} />
        </>
      )}
      <Facts row={row} />
    </article>
  );
}

export function PropsUpsell() {
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-violet/15 blur-3xl" />
      <span className="rounded-full bg-violet/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet">Pro</span>
      <p className="mt-2 max-w-xl font-display text-lg font-bold leading-snug">
        Every starter&apos;s projection, the chance at each line, and a pick you can load on SportyBet
      </p>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">Recent hit rates stay free for everyone.</p>
      <Link
        href={UPGRADE_HREF}
        className="glow-brand mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        Unlock with Pro <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

export function PropsEmpty({ text }: { text: string }) {
  return (
    <div className="card grid place-items-center px-6 py-12 text-center">
      <p className="max-w-md text-sm text-ink-muted">{text}</p>
    </div>
  );
}

export const PROPS_NOTE = "Counts are FotMob's. A bookmaker settles on its own data provider, which can count tackles, clearances and passes differently.";

