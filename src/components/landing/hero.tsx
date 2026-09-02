import type { ReactNode } from "react";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

/**
 * The board is passed in rather than built here, so this stays a Server
 * Component and only the board itself — the one part that polls — ships any
 * JavaScript.
 */
export function Hero({ liveCount, board }: { liveCount: number; board: ReactNode }) {
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
          {board}
          <p className="mt-3 text-center text-xs text-ink-dim">
            Real fixtures, straight from the live feeds.
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-display text-2xl font-bold text-brand">{value}</dt>
      <dd className="mt-1 text-xs leading-snug text-ink-muted">{label}</dd>
    </div>
  );
}
