import type { ReactNode } from "react";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";
import { LEAGUES } from "@/lib/leagues";
import { ProductIcon } from "@/components/icons/product-icon";

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

      <Container className="relative grid gap-8 sm:gap-14 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10 lg:py-24">
        {/* Live board leads: today's real predictions, not marketing copy, is
            the first thing anyone sees. No entrance animation on either
            column: they started at opacity 0, which kept the hero out of the
            browser's largest-paint measurement and made the page score as if
            its main content painted seconds late. */}
        <div>
          {board}
          <p className="mt-3 text-center text-xs text-ink-dim">
            Real fixtures, straight from the live feeds.
          </p>
        </div>

        <div>
          <Badge tone="brand" className="mb-6 max-w-full">
            <ProductIcon name="globe" className="size-3.5 shrink-0" />
            <span className="truncate">
              Built in Nigeria<span className="hidden sm:inline">, for football fans across Africa and the world</span>
              <span className="sm:hidden"> for Africa and the world</span>
            </span>
          </Badge>

          <h1 className="font-display text-[2.75rem] leading-[1.05] font-extrabold sm:text-6xl lg:text-[4.2rem]">
            Predict. Analyse.
            <br />
            <span className="text-gradient-brand">Decide smarter.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Every match gets its <strong className="text-ink">top three picks</strong>, a risk label
            from our own graded record, and the numbers behind them, from goals to match stats, fitted
            to real completed matches. Every miss stays on the record. See the chance, then decide for
            yourself.
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
            <Stat value={`${LEAGUES.length}`} label="Competitions covered" />
            <Stat value="Free" label="No card required" />
            <Stat value="18+" label="Use responsibly" />
          </dl>
        </div>
      </Container>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono tracking-tight text-xl font-medium text-brand">{value}</dt>
      <dd className="mt-1 text-xs leading-snug text-ink-muted">{label}</dd>
    </div>
  );
}
