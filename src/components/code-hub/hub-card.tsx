import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { CodeBox } from "@/components/code-hub/code-box";
import { odds, percent } from "@/lib/format";
import { oneIn } from "@/lib/forge";
import {
  hubLegOdds,
  hubTier,
  type CodeState,
  type HubAccess,
  type HubLeg,
  type HubLegResult,
  type HubStatus,
  type HubTierId,
} from "@/lib/code-hub";

export interface HubCardProps {
  tier: HubTierId;
  legs: HubLeg[];
  odds: number;
  probability: number;
  firstKickoff: number;
  access: HubAccess;
  status: HubStatus;
  results: HubLegResult[];
  code: CodeState;
  /** Before launch: the combo is real, the code is not out yet. */
  preview: boolean;
}

const STATUS: Record<HubStatus, { text: string; tone: Tone } | null> = {
  pending: null,
  live: { text: "In play", tone: "live" },
  won: { text: "Landed", tone: "brand" },
  lost: { text: "Missed", tone: "rose" },
};

const RESULT_DOT: Record<HubLegResult, string> = {
  win: "bg-brand",
  loss: "bg-rose",
  void: "bg-ink-dim",
  pending: "bg-line-strong",
};

export function HubCard(props: HubCardProps) {
  const tier = hubTier(props.tier)!;
  const status = STATUS[props.status];
  const locked = props.access === "locked";

  return (
    <article className="card flex flex-col overflow-hidden" data-tier={props.tier}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{tier.name}</p>
          <p className="mt-1 text-sm text-ink-muted">{tier.blurb}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold leading-none text-ink">{odds(props.odds)}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-dim">odds</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-4 text-xs text-ink-muted">
        <span>
          {props.legs.length} games · model chance <strong className="text-ink">{percent(props.probability)}</strong>{" "}
          <span className="text-ink-dim">({oneIn(props.probability)})</span>
        </span>
        {status && <Badge tone={status.tone}>{status.text}</Badge>}
      </div>

      <div className="relative flex-1 px-5 py-4">
        <ul className={`space-y-2.5 ${locked ? "pointer-events-none select-none blur-[6px]" : ""}`} aria-hidden={locked}>
          {props.legs.map((leg, i) => (
            <li key={leg.matchId} className="flex items-start gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${RESULT_DOT[props.results[i] ?? "pending"]}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{locked ? "Hidden pick" : leg.label}</p>
                <p className="truncate text-xs text-ink-dim">
                  {locked ? "Home v Away" : `${leg.homeName} v ${leg.awayName}`} ·{" "}
                  <LocalTime iso={leg.kickoff} kind="time" />
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm text-ink-muted">{locked ? "1.00" : odds(hubLegOdds(leg))}</span>
            </li>
          ))}
        </ul>
        {locked && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-ink">Pro members get this code before kick-off</p>
              <p className="mt-1 text-xs text-ink-muted">Free accounts see the games once the first one starts.</p>
              <Link
                href="/pricing"
                className="press mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
              >
                See plans
              </Link>
            </div>
          </div>
        )}
      </div>

      {!locked && (
        <footer className="px-5 pb-5">
          {props.code.state === "ready" ? (
            <CodeBox code={props.code.bookingCode} />
          ) : props.code.state === "closed" ? (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs text-ink-muted">
              The first game has started, so this code no longer loads.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">SportyBet code</p>
                <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.12em] text-ink-dim">••••••</p>
              </div>
              <p className="max-w-[10rem] text-right text-xs text-ink-muted">
                {props.preview ? "Codes switch on at launch" : "Code arrives before the first kick-off"}
              </p>
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-dim">
            First kick-off <LocalTime iso={new Date(props.firstKickoff).toISOString()} kind="time" />. Prices are SportyBet&apos;s
            where listed, otherwise the model&apos;s fair odds.
          </p>
        </footer>
      )}
    </article>
  );
}
