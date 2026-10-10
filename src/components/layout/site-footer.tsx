import { LogoLockup } from "@/components/brand/logo";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";
import { COMPANY } from "@/lib/company";
import { FooterColumn } from "@/components/layout/footer-column";

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
      { href: sportPath("results"), label: "Results" },
      { href: sportPath("tables"), label: "League Tables" },
      { href: sportPath("trends"), label: "Trends" },
      { href: sportPath("ratings"), label: "Model Ratings" },
      { href: sportPath("forge"), label: "Forge" },
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
      { href: `${sportPath("fixtures")}?league=afcon`, label: "AFCON" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "About KiqStat" },
      { href: "/pricing", label: "Pricing" },
      { href: sportPath("trackRecord"), label: "Our Track Record" },
      { href: "/how-it-works", label: "How Our Picks Work" },
      { href: "/guides", label: "Guides" },
      { href: "/help", label: "Help Centre" },
      { href: "/responsible-gambling", label: "Responsible Gambling" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-shell">
      <Container className="py-9 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-10">
          <div>
            <LogoLockup className="h-8 w-auto text-ink" />
            <span className="sr-only">KiqStat</span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              Data-driven football insight for fans across Africa and the world. Real fixtures,
              real results, and a model that shows its working.
            </p>
            <p className="mt-2 text-xs text-ink-dim">Formerly BetriX.</p>
          </div>

          {COLUMNS.map((col) => (
            <FooterColumn key={col.title} title={col.title} links={col.links} />
          ))}
        </div>

        {/*
          Nigeria's National Lottery Regulatory Commission (KiqStat is a
          Nigerian company) expects a visible 18+ notice on anything
          betting-adjacent, as regulators elsewhere do. It is also just the
          right thing to put in front of this audience, wherever they are.
        */}
        <div className="mt-8 rounded-2xl sm:mt-12 border border-amber/20 bg-amber/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber/40 text-xs font-bold text-amber">
              18+
            </span>
            <p className="min-w-[16rem] flex-1 text-sm text-ink-muted">
              <strong className="text-ink">Bet responsibly.</strong> Predictions are statistical
              estimates, not certainties. Only bet where it is legal for you, and never stake money
              you cannot afford to lose. If gambling stops being fun, take a break.{" "}
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
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6 sm:mt-8 sm:pt-8 text-xs text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY.legalName}. Built in Nigeria, for Africa and the world.
          </p>
          <p>Not affiliated with any bookmaker.</p>
        </div>
      </Container>
    </footer>
  );
}
