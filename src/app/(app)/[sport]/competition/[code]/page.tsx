import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { JsonLd } from "@/components/seo/json-ld";
import { LocalTime } from "@/components/ui/local-time";
import { leagueByCode } from "@/lib/leagues";
import { isSportId } from "@/lib/sports";
import { competitionPath, matchPath, scoresPath, sportPath } from "@/lib/routes";
import { upcomingFeed } from "@/lib/service";
import { liveLeagueTable } from "@/lib/stats/live-table";
import { settledRecords } from "@/lib/performance-store";
import { competitionFaq, trackRecordLine } from "@/lib/seo/competition";

/**
 * A permanent page per competition (CTO checklist 4.6). Unlike the league
 * filters on the predictions and fixtures pages, it is never an empty state:
 * between rounds it still carries the table, the competition's own settled
 * record and links to everything else, so it can hold a ranking all season.
 * Plain server-rendered text, so crawlers that do not run scripts read it all.
 */
export const revalidate = 600;

type Params = Promise<{ sport: string; code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  const def = leagueByCode(code);
  if (!def) return {};
  return {
    title: `${def.name} Predictions, Fixtures and Table`,
    description: `${def.name} predictions from a statistical model fitted on real results: next fixtures with win, draw and loss chances, the table, and KiqStat's own settled record for the competition.`,
    alternates: { canonical: competitionPath(def.code) },
  };
}

const dateLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

export default async function CompetitionPage({ params }: { params: Params }) {
  const { sport, code } = await params;
  const def = leagueByCode(code);
  if (!isSportId(sport) || !def) notFound();

  const hasTable = !def.knockout && !def.confederation;
  const [feed, table, breakdown] = await Promise.all([
    upcomingFeed(14, def.code).catch(() => null),
    hasTable ? liveLeagueTable(def.code).catch(() => null) : Promise.resolve(null),
    settledRecords({ sport }).catch(() => null),
  ]);
  const fixtures = (feed?.matches ?? []).filter((m) => m.league.code === def.code || !m.league.code).slice(0, 10);
  const record = breakdown?.byLeague.get(def.code);
  const line = trackRecordLine(def.name, record, dateLabel(new Date()));
  const faq = competitionFaq(def.name, line);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <PageHeader eyebrow={def.country} title={`${def.name} predictions`} description={`Fixtures, table and KiqStat's own record for the ${def.name}.`} />
      <div className={`${containerClass()} space-y-8 py-4 sm:py-10`}>
        <p className="max-w-3xl text-sm text-ink-muted">
          KiqStat publishes the model&apos;s chance of every result in the {def.name}, fitted on completed matches in the competition and refreshed through the day. {line}
        </p>

        <section>
          <h2 className="font-display text-lg font-bold">Next {def.shortName} fixtures</h2>
          {fixtures.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No {def.name} matches are scheduled in the next 14 days. The table and record below stay current.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {fixtures.map((m) => (
                <li key={m.id}>
                  <Link href={matchPath(m.id, sport)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="font-medium text-ink">{m.home.name} v {m.away.name}</span>
                    <span className="text-xs text-ink-dim">
                      <LocalTime iso={m.kickoff} options={{ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs">
            <Link className="text-accent underline" href={`${sportPath("predictions", sport)}?league=${def.code}`}>All {def.shortName} predictions</Link>
            {" · "}
            <Link className="text-accent underline" href={scoresPath("fixtures", { league: def.code, sport })}>Fixtures</Link>
            {" · "}
            <Link className="text-accent underline" href={scoresPath("results", { league: def.code, sport })}>Results</Link>
          </p>
        </section>

        {hasTable && table && table.rows.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-bold">{def.name} table</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-ink-dim">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Club</th>
                    <th className="px-3 py-2 text-right font-medium">P</th>
                    <th className="px-3 py-2 text-right font-medium">W</th>
                    <th className="px-3 py-2 text-right font-medium">D</th>
                    <th className="px-3 py-2 text-right font-medium">L</th>
                    <th className="px-3 py-2 text-right font-medium">GD</th>
                    <th className="px-3 py-2 text-right font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.rows.map((r) => (
                    <tr key={r.team.id}>
                      <td className="px-3 py-2 tabular-nums text-ink-dim">{r.position}</td>
                      <td className="px-3 py-2 text-ink">{r.team.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.played}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.won}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.drawn}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.lost}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.goalDifference}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-lg font-bold">KiqStat&apos;s record in the {def.shortName}</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">{line}</p>
          <p className="mt-2 text-xs">
            <Link className="text-accent underline" href={sportPath("trackRecord", sport)}>See every settled pick</Link>
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-bold">Questions</h2>
          <dl className="mt-3 space-y-4">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="text-sm font-medium text-ink">{f.q}</dt>
                <dd className="mt-1 max-w-3xl text-sm text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-dim">Predictions are probabilities, not guarantees. 18+. Play responsibly.</p>
        </section>
      </div>
    </>
  );
}
