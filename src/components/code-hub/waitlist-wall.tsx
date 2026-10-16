import { WaitlistForm } from "@/components/code-hub/waitlist-form";
import { HUB_TIERS } from "@/lib/code-hub";
import { GENERATOR_ALLOWANCE } from "@/lib/code-hub-plans";

/** What everyone but admins sees while the Code Hub is on its waitlist. */
export function WaitlistWall({ email, joined }: { email: string | null; joined: boolean }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Coming soon</p>
        <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
          Ready-made combos, with the code to load them
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted sm:text-base">
          Every morning the model builds five combos, from about 2 to 20 odds. Each one comes with a SportyBet booking
          code and the model&apos;s honest chance of it landing. Every code stays on the page afterwards with its
          result.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-ink-muted">
          <li>• One 2-odds code a day free; every code with Pro</li>
          <li>
            • Turn your own combo into a code:{" "}
            {GENERATOR_ALLOWANCE.map((a) => `${a.label} ${a.perWeek} a week`).join(", ")}
          </li>
          <li>• Graded in public, landed or missed</li>
        </ul>
        <div className="mt-6">
          <WaitlistForm email={email} joined={joined} />
          <p className="mt-2 text-xs text-ink-dim">One email when it opens. 18+ only.</p>
        </div>
      </div>

      <div className="relative" aria-hidden>
        {/* Right padding holds the staircase: each card steps 6px right. */}
        <div className="space-y-3 pr-6">
          {HUB_TIERS.map((t, i) => (
            <div
              key={t.id}
              className="card flex items-center justify-between px-5 py-4"
              style={{ opacity: 1 - i * 0.14, transform: `translateX(${i * 6}px)` }}
            >
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{t.name}</p>
                <p className="mt-1 text-xs text-ink-dim">
                  {t.games} games · <span className="tracking-[0.2em]">••••••</span>
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-ink">~{t.target}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
