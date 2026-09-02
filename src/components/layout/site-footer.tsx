import Link from "next/link";
import { Container } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

/*
 * The footer renders in the (app) layout, above the [sport] segment, so it
 * has no route param to read and no pathname (it is a Server Component).
 * Its sport-scoped links therefore resolve against DEFAULT_SPORT, which is
 * exactly right while there is one sport and is the first thing to revisit
 * when there are two.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: sportPath("live"), label: "Live Scores" },
      { href: sportPath("fixtures"), label: "Fixtures" },
      { href: sportPath("predictions"), label: "Predictions" },
      { href: sportPath("trends"), label: "Trends" },
      { href: sportPath("trackRecord"), label: "Track Record" },
      { href: sportPath("slip"), label: "Selection Builder" },
    ],
  },
  {
    title: "Leagues",
    links: [
      { href: `${sportPath("fixtures")}?league=premier-league`, label: "Premier League" },
      { href: `${sportPath("fixtures")}?league=npfl`, label: "NPFL" },
      { href: `${sportPath("fixtures")}?league=champions-league`, label: "Champions League" },
      { href: `${sportPath("fixtures")}?league=la-liga`, label: "La Liga" },
      { href: `${sportPath("fixtures")}?league=caf-champions-league`, label: "CAF Champions League" },
    ],
  },
  {
    title: "About",
    links: [
      { href: sportPath("trackRecord"), label: "Our Track Record" },
      { href: "/responsible-gambling", label: "Responsible Gambling" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-shell">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-green-96.png" alt="" width={32} height={32} className="size-8 rounded-lg" aria-hidden />
              <span className="font-display text-lg font-bold">
                Betri<span className="text-brand">X</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              Data-driven football insight for Nigerian football fans. Real fixtures, real
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

        {/*
          The data-provider credit that used to sit here is gone — naming the
          upstream feeds told visitors nothing they could act on and pinned the
          product to a particular set of suppliers. "Not affiliated with any
          bookmaker" stays: that one is a positioning statement, and the thing
          this audience actually needs to know.
        */}
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-8 text-xs text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BetriX. Built for Nigeria, made for Africa.</p>
          <p>Not affiliated with any bookmaker.</p>
        </div>
      </Container>
    </footer>
  );
}
