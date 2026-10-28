import Link from "next/link";
import { lastMatchday } from "@/lib/performance-store";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { dayName, projectMatchday } from "@/lib/matchday";
import { percent } from "@/lib/format";
import { sportPath } from "@/lib/routes";

function Stat({ eyebrow, value, detail, href }: { eyebrow: string; value: string; detail: string; href?: string }) {
  const body = (
    <>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">{eyebrow}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="tnum font-mono text-lg font-semibold tracking-tight text-brand">{value}</span>
        <span className="tnum text-xs text-ink-muted">{detail}</span>
      </p>
    </>
  );
  const cls = "block rounded-xl border border-line bg-surface px-3.5 py-2 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** How the last day of published picks did, graded: the Picks page header. */
export async function LastMatchdayStat() {
  const r = await lastMatchday().catch(() => null);
  if (!r || r.rate === null) return null;
  const graded = r.wins + r.losses;
  return (
    <Stat
      eyebrow={`Last matchday · ${dayName(r.day)}`}
      value={percent(r.rate, 1)}
      detail={`${r.wins} of ${graded} landed${r.pending ? ` · ${r.pending} pending` : ""}`}
      href={sportPath("trackRecord")}
    />
  );
}

/**
 * The next matchday's picks still to play, projected from their stated
 * chances (matchday.ts): how many should land, and the accuracy that makes.
 * The Fixtures header. Reads the same cached slate as the Picks page.
 */
export async function ProjectedMatchdayStat({ league }: { league?: string }) {
  const feed = await upcomingFeed(14, league).catch(() => null);
  if (!feed?.matches.length) return null;
  const predictions = await predictBatch(feed.matches, 900).catch(() => []);
  const picks = predictions.filter((p) => p.sufficiency.publishable && p.topPick).map((p) => ({ kickoff: p.match.kickoff, probability: p.topPick!.probability }));
  const proj = projectMatchday(picks);
  if (!proj) return null;
  return (
    <Stat
      eyebrow={`Projected · ${dayName(proj.day)}`}
      value={percent(proj.accuracy, 1)}
      detail={`~${Math.round(proj.expectedWins)} of ${proj.picks} picks to land (${proj.range[0]}–${proj.range[1]})`}
      href={sportPath("predictions")}
    />
  );
}
