import type { TimelineEvent } from "@/lib/match-details-core";
import type { Match } from "@/lib/types";
import { BallIcon, CardIcon } from "./lineup-pitch";

/**
 * The game as it happened: goals, cards, substitutions and VAR calls on a
 * centre spine, home events to the left and away to the right, with the
 * score after each goal. Newest last, as a match report reads.
 */
export function MatchTimeline({ match, events }: { match: Match; events: TimelineEvent[] }) {
  const shown = events.filter((e) => e.type !== "added-time");
  if (shown.length === 0) return null;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Match events</h2>
        <span className="text-[11px] text-ink-dim">
          {match.home.name} · {match.away.name}
        </span>
      </div>
      <ol className="stagger relative px-3 py-4 sm:px-5" aria-label="Match events">
        <span aria-hidden className="absolute bottom-4 left-1/2 top-4 w-px -translate-x-1/2 bg-line" />
        {shown.map((e, i) =>
          e.type === "half" ? (
            <li key={i} className="relative my-3 flex justify-center" style={{ ["--i" as string]: i }}>
              <span className="relative z-10 rounded-full border border-line bg-surface px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                {e.detail === "HT" ? "Half-time" : e.detail === "FT" ? "Full-time" : (e.detail ?? "Break")}
              </span>
            </li>
          ) : (
            <EventRow key={i} e={e} index={i} />
          ),
        )}
      </ol>
    </section>
  );
}

function minuteLabel(e: TimelineEvent) {
  return e.added ? `${e.minute}+${e.added}'` : `${e.minute}'`;
}

function EventRow({ e, index }: { e: TimelineEvent; index: number }) {
  const home = e.side !== "away";
  const body = (
    <div className={`min-w-0 ${home ? "text-right" : "text-left"}`}>
      <p className="truncate text-sm font-semibold">
        {e.type === "sub" ? (
          <>
            <span className="text-brand">↑</span> {e.player ?? "Substitute"}
          </>
        ) : (
          e.player ?? describe(e)
        )}
      </p>
      <p className="truncate text-xs text-ink-dim">
        {e.type === "goal" && (e.related ? `Assist: ${e.related}` : e.detail ?? "Goal")}
        {e.type === "goal" && e.related && e.detail ? ` · ${e.detail}` : ""}
        {e.type === "sub" && (
          <>
            <span className="text-rose">↓</span> {e.related}
            {e.detail === "injury" ? " · injury" : ""}
          </>
        )}
        {e.type === "card" && (e.card === "second-yellow" ? "Second yellow" : e.card === "red" ? "Red card" : "Yellow card")}
        {e.type === "var" && `VAR: ${e.detail ?? "review"}`}
        {e.type === "missed-penalty" && "Missed penalty"}
      </p>
    </div>
  );
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-2 py-1.5" style={{ ["--i" as string]: index }}>
      <div className="min-w-0">{home && body}</div>
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span className="tnum rounded-full bg-surface px-1.5 font-mono text-[11px] text-ink-muted">{minuteLabel(e)}</span>
        <Icon e={e} />
        {e.type === "goal" && e.score && (
          <span className="tnum rounded-full bg-brand px-1.5 py-px font-mono text-[10.5px] font-bold text-brand-ink">
            {e.score[0]}-{e.score[1]}
          </span>
        )}
      </div>
      <div className="min-w-0">{!home && body}</div>
    </li>
  );
}

function Icon({ e }: { e: TimelineEvent }) {
  if (e.type === "goal") return <BallIcon />;
  if (e.type === "card") return <CardIcon red={e.card !== "yellow"} />;
  if (e.type === "sub") return <span className="text-xs font-bold text-brand" aria-hidden>⇅</span>;
  if (e.type === "var") return <span className="rounded bg-violet/20 px-1 text-[9px] font-bold text-violet" aria-hidden>VAR</span>;
  if (e.type === "missed-penalty") return <span className="text-xs font-bold text-rose" aria-hidden>✕</span>;
  return null;
}

function describe(e: TimelineEvent): string {
  if (e.type === "goal") return "Goal";
  if (e.type === "card") return "Card";
  if (e.type === "var") return "VAR";
  return "";
}
