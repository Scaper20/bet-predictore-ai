import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { CodeBox } from "@/components/code-hub/code-box";
import { APP_TIMEZONE, odds, percent } from "@/lib/format";
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
  /** Set on an earlier day's code still in play: the day it was published. */
  publishedOn?: string;
  /** Games list shown on first render. Collapsed, the card is its header and code. */
  defaultOpen?: boolean;
  /** A settled code in the recent record: no booking footer, the day it ran instead. */
  settledOn?: string;
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

/** "3 days": calendar days (Lagos) a code's games fall on. */
function daySpan(legs: HubLeg[]): string {
  const days = new Set(legs.map((l) => new Date(l.kickoff).toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE })));
  return days.size === 1 ? "1 day" : `${days.size} days`;
}

export function HubCard(props: HubCardProps) {
  const tier = hubTier(props.tier)!;
  const status = STATUS[props.status];
  const locked = props.access === "locked";
  const settled = props.settledOn !== undefined;

  return (
    <article className="card flex flex-col overflow-hidden" data-tier={props.tier}>
      <details className="group" open={props.defaultOpen}>
        <summary className="cursor-pointer list-none px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{tier.name}</p>
                {status && <Badge tone={status.tone}>{status.text}</Badge>}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {props.legs.length} games{tier.days > 1 && <> over {daySpan(props.legs)}</>} · chance{" "}
                <strong className="text-ink">{percent(props.probability)}</strong>{" "}
                <span className="text-ink-dim">({oneIn(props.probability)})</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-dim">
                {settled ? `Ran ${props.settledOn}` : props.publishedOn ? `Published ${props.publishedOn}, still running` : tier.blurb}
              </p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-right">
                <p className="font-display text-2xl font-bold leading-none text-ink sm:text-3xl">{odds(props.odds)}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-dim">odds</p>
              </div>
              <span aria-hidden className="mt-1 text-ink-dim transition-transform group-open:rotate-180">
                ▾
              </span>
            </div>
          </div>
          {/* Collapsed: one dot per game, so a card still shows how it is going. */}
          <div className="mt-3 flex flex-wrap gap-1 group-open:hidden" aria-hidden>
            {props.legs.map((leg, i) => (
              <span key={leg.matchId} className={`size-2 rounded-full ${RESULT_DOT[props.results[i] ?? "pending"]}`} />
            ))}
          </div>
        </summary>

        <div className="relative border-t border-line px-4 py-3 sm:px-5">
          <ul className={`divide-y divide-line/60 ${locked ? "pointer-events-none select-none blur-[6px]" : ""}`} aria-hidden={locked}>
            {props.legs.map((leg, i) => (
              <li key={leg.matchId} className="flex items-start gap-3 py-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${RESULT_DOT[props.results[i] ?? "pending"]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{locked ? "Hidden pick" : leg.label}</p>
                  <p className="truncate text-xs text-ink-dim">
                    {locked ? "Home v Away" : `${leg.homeName} v ${leg.awayName}`} ·{" "}
                    <LocalTime iso={leg.kickoff} kind={tier.days > 1 || settled ? "dayTime" : "time"} />
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
          {!locked && !settled && (
            <p className="pt-2 text-[11px] text-ink-dim">
              First kick-off <LocalTime iso={new Date(props.firstKickoff).toISOString()} kind="time" />. Prices are
              SportyBet&apos;s where listed, otherwise the model&apos;s fair odds.
            </p>
          )}
        </div>
      </details>

      {!locked && !settled && (
        <footer className="px-4 pb-4 sm:px-5">
          {props.code.state === "ready" ? (
            <CodeBox code={props.code.bookingCode} />
          ) : props.code.state === "started" ? (
            <div className="space-y-2">
              <CodeBox code={props.code.bookingCode} />
              <p className="text-xs text-ink-muted">
                Games under way. The code stays here until the last game ends; SportyBet stops loading it at the first
                kick-off.
              </p>
            </div>
          ) : props.code.state === "closed" ? (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs text-ink-muted">
              The games have started; this combo went out without a code.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">SportyBet code</p>
                <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.12em] text-ink-dim">••••••</p>
              </div>
              <p className="max-w-[10rem] text-right text-xs text-ink-muted">
                {props.preview ? "SportyBet codes are paused for now" : "Code arrives before the first kick-off"}
              </p>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
