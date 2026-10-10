import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";
import { PLANS } from "@/lib/pricing";
import { ELSEWHERE, formatMoney } from "@/lib/payments/markets";
import { SITE_URL as SITE } from "@/lib/site-url";
import { sportPath } from "@/lib/routes";

/**
 * /llms.txt — a plain-text map of the site for answer engines (the
 * llmstxt.org convention). ChatGPT search, Perplexity, Claude and AI Overviews
 * read pages, not marketing; this hands them the facts they would otherwise
 * have to infer, in the words we would want quoted.
 *
 * Built from the same catalogue and plan definitions the site renders, so it
 * cannot drift from what the pages actually say.
 */
export const dynamic = "force-static";
export const revalidate = 86400;

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export function GET() {
  const plans = PLANS.map((p) => {
    const prices = [
      p.price.monthly && `${naira(p.price.monthly)}/month`,
      p.price.quarterly && `${naira(p.price.quarterly)}/3 months`,
      p.price.yearly && `${naira(p.price.yearly)}/year`,
    ].filter(Boolean);
    const usd = p.id === "pro" || p.id === "vip" ? ELSEWHERE.prices?.[p.id] : undefined;
    const abroad = usd ? `; outside Africa ${formatMoney(usd.monthly, "USD")}/month, ${formatMoney(usd.yearly, "USD")}/year` : "";
    return `- ${p.name} (${prices.length ? `in Nigeria ${prices.join(", ")}${abroad}` : "free"}): ${p.description}`;
  });

  const body = `# BetriX

> BetriX is a football prediction and analytics site for football fans across Africa and the world, built in Nigeria. Every prediction comes from a statistical goal model (time-weighted Dixon-Coles Poisson) fitted on real completed matches, and every pick shows the sample size and data quality behind it. When the history is too thin, BetriX publishes no pick rather than guessing.

BetriX is an analytics product, not a bookmaker: it takes no bets and holds no funds. Prices are shown in the visitor's own currency: naira in Nigeria, the local currency in Ghana, Kenya, Uganda, Tanzania, Rwanda, Zambia, Cameroon, Côte d'Ivoire, Senegal and South Africa, and US dollars elsewhere. Kickoff times are shown in the visitor's own time zone. For adults only (18+, or older where local law requires).

## How the predictions work

- Team attack and defence ratings, home advantage and a low-score correction are fitted by maximum likelihood on each competition's completed results (goals blended with shots on target where recorded), with recent matches weighted more heavily.
- A headline pick is published only when the competition has at least 200 completed matches in the data.
- The two expected goal rates expand into a full scoreline distribution. 1X2, double chance, over/under, both teams to score, correct score and Asian handicap are all read off that one distribution, so they never contradict each other.
- Picks are ranked by their edge over what that competition normally does, not by raw probability.
- National teams are rated on every international in their confederation, and tournament finals are modelled at a neutral venue.
- Every match page lists the evidence behind the read: strength rankings, the key attack-versus-defence mismatch, home and away splits, form against season rate.
- Settled results are published on the track record page, wins and losses alike.

## Key pages

- [Today's predictions](${SITE}${sportPath("predictions")}): every upcoming fixture with model probabilities
- [Fixtures](${SITE}${sportPath("fixtures")}): upcoming matches, kickoff times in your own time zone
- [Live scores](${SITE}${sportPath("live")})
- [Results](${SITE}${sportPath("results")}): final scores by day, with how each published pick did
- [League tables](${SITE}${sportPath("tables")}): standings, updated live while games are in play
- [Head-to-head](${SITE}${sportPath("h2h")}): every meeting between any two teams
- [Team form](${SITE}${sportPath("teamForm")}) and [goals stats](${SITE}${sportPath("goals")}): last ten games, over/under and GG rates by team
- [Model ratings](${SITE}${sportPath("ratings")}): every team rated 1 to 10 from its results
- [Trends](${SITE}${sportPath("trends")}): streaks for every team playing in the next three days
- [How our picks work](${SITE}/how-it-works), [guides](${SITE}/guides) and [help](${SITE}/help)
- [Track record](${SITE}${sportPath("trackRecord")}): every settled pick and how it did
- [Pricing](${SITE}/pricing)
- [Responsible gambling](${SITE}/responsible-gambling)

## Competitions covered

Clubs: ${CLUB_LEAGUES.map((l) => l.name).join(", ")}.

National teams: ${INTERNATIONAL_LEAGUES.map((l) => l.name).join(", ")}.

Each competition has its own page, e.g. ${SITE}${sportPath("predictions")}?league=npfl

## Plans

${plans.join("\n")}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
