import type { Match } from "@/lib/types";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { kickoffTime, percent, relativeDay, statusLabel } from "@/lib/format";
import { Crest } from "@/components/ui/crest";
import { sportPath } from "@/lib/routes";

export function Hero({
  liveCount,
  featured,
  featuredProbabilities,
}: {
  liveCount: number;
  featured: Match[];
  featuredProbabilities?: { home: number; draw: number; away: number }[];
}) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Backdrop: grid + a green bloom behind the headline. */}
      <div className="bg-grid mask-fade-b pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/4 size-[36rem] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--color-brand), transparent 65%)" }}
        aria-hidden
      />

      <Container className="relative grid gap-14 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10 lg:py-24">
        {/* Live board leads: today's real predictions, not marketing copy, is
            the first thing anyone sees. */}
        <div className="animate-rise">
          <div className="card glow-soft overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
              {liveCount > 0 ? <LiveDot /> : <span className="size-2 rounded-full bg-ink-dim" />}
              <span className="text-sm font-semibold">
                {liveCount > 0 ? "Live right now" : "Next up"}
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-dim">
                real-time feed
              </span>
            </div>

            {featured.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-ink-muted">
                  No matches in the feed at the moment.
                </p>
                <p className="mt-1 text-xs text-ink-dim">
                  This board only ever shows real fixtures — so it stays empty rather than
                  inventing one.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {featured.map((m, i) => (
                  <li key={m.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[11px] font-medium text-ink-dim">
                        {m.league.name}
                      </span>
                      <span className="tnum ml-auto shrink-0 text-[11px] font-semibold text-ink-muted">
                        {m.status === "live" || m.status === "halftime" ? (
                          <span className="text-rose">{statusLabel(m)}</span>
                        ) : (
                          `${relativeDay(m.kickoff)} ${kickoffTime(m.kickoff)}`
                        )}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      <Row team={m.home} score={m.score.home} />
                      <Row team={m.away} score={m.score.away} />
                    </div>

                    {featuredProbabilities?.[i] && (
                      <div className="mt-2.5 flex gap-1">
                        {(["home", "draw", "away"] as const).map((k) => {
                          const v = featuredProbabilities[i][k];
                          return (
                            <div key={k} className="flex-1">
                              <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                                <div
                                  className="h-full rounded-full bg-brand/70"
                                  style={{ width: `${Math.round(v * 100)}%` }}
                                />
                              </div>
                              <p className="tnum mt-1 text-center text-[10px] text-ink-dim">
                                {percent(v)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-ink-dim">
            Pulled live from football-data.org, API-Football and TheSportsDB.
          </p>
        </div>

        <div className="animate-rise" style={{ animationDelay: "120ms" }}>
          <Badge tone="brand" className="mb-6">
            🇳🇬 Built in Nigeria, for Nigerian football fans
          </Badge>

          <h1 className="font-display text-[2.75rem] leading-[1.05] font-extrabold sm:text-6xl lg:text-[4.2rem]">
            Predict. Analyse.
            <br />
            <span className="text-gradient-brand">Decide smarter.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Every prediction on this site is fitted to <strong className="text-ink">real completed
            matches</strong> — not vibes, not recycled tipster picks. See the probability, see the
            sample size behind it, then decide for yourself.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={sportPath("predictions")}>See today&apos;s predictions →</ButtonLink>
            <ButtonLink href={sportPath("live")} variant="secondary">
              {liveCount > 0 ? (
                <>
                  <LiveDot /> {liveCount} matches live now
                </>
              ) : (
                "Live scores"
              )}
            </ButtonLink>
          </div>

          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            <Stat value="12+" label="Leagues covered" />
            <Stat value="Free" label="No card required" />
            <Stat value="18+" label="Bet responsibly" />
          </dl>
        </div>
      </Container>
    </section>
  );
}

function Row({ team, score }: { team: Match["home"]; score: number | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Crest src={team.crest} name={team.name} size={20} />
      <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
      {score !== null && <span className="tnum text-sm font-bold">{score}</span>}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-display text-2xl font-bold text-brand">{value}</dt>
      <dd className="mt-1 text-xs leading-snug text-ink-muted">{label}</dd>
    </div>
  );
}
