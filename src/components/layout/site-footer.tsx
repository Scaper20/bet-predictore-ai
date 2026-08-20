import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/live", label: "Live Scores" },
      { href: "/fixtures", label: "Fixtures" },
      { href: "/predictions", label: "AI Predictions" },
      { href: "/trends", label: "Betting Trends" },
      { href: "/slip", label: "Bet Slip Builder" },
    ],
  },
  {
    title: "Leagues",
    links: [
      { href: "/fixtures?league=premier-league", label: "Premier League" },
      { href: "/fixtures?league=npfl", label: "NPFL" },
      { href: "/fixtures?league=champions-league", label: "Champions League" },
      { href: "/fixtures?league=la-liga", label: "La Liga" },
      { href: "/fixtures?league=caf-champions-league", label: "CAF Champions League" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/how-it-works", label: "How The Model Works" },
      { href: "/responsible-gambling", label: "Responsible Gambling" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-shell">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-ink">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 17l5-6 4 4 6-8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="font-display text-lg font-bold">
                Naija<span className="text-brand">Odds</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              Data-driven football insight built for Nigerian bettors. Real fixtures, real
              results, and a model that shows its working.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-muted transition-colors hover:text-brand">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          Nigeria's National Lottery Regulatory Commission expects a visible
          18+ notice on anything betting-adjacent. It is also just the right
          thing to put in front of this audience.
        */}
        <div className="mt-12 rounded-2xl border border-amber/20 bg-amber/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber/40 text-xs font-bold text-amber">
              18+
            </span>
            <p className="min-w-[16rem] flex-1 text-sm text-ink-muted">
              <strong className="text-ink">Bet responsibly.</strong> Predictions are statistical
              estimates, not certainties. Never stake money you cannot afford to lose. If gambling
              stops being fun, take a break.{" "}
              <Link href="/responsible-gambling" className="text-amber underline underline-offset-2">
                Get help
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-8 text-xs text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NaijaOdds. Built for Nigeria, made for Africa.</p>
          <p>
            Match data from football-data.org, API-Football and TheSportsDB. Not affiliated with
            any bookmaker.
          </p>
        </div>
      </div>
    </footer>
  );
}
