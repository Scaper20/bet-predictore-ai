/**
 * The site's navigation, in one place.
 *
 * Desktop menus, the mobile menu, the bottom bar and search all read from
 * here, so a destination is defined once. Anything not built yet is still
 * listed — the menus show where BetriX is going — but points at its
 * coming-soon page (/soon/<slug>). Shipping a feature is a one-line change:
 * give its item an `href` and delete its `soon` slug.
 */

import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import { sportPath } from "@/lib/routes";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";

/* ------------------------------------------------------------- features */

export interface SoonFeature {
  title: string;
  /** One line: what it does. */
  blurb: string;
  /** What it will do, for the coming-soon page. */
  points: string[];
  /** Live features to try meanwhile. */
  meanwhile: { label: string; href: string }[];
}

const fb = (route: Parameters<typeof sportPath>[0]) => sportPath(route, DEFAULT_SPORT);

/** Everything announced but not yet built, by slug. */
export const SOON: Record<string, SoonFeature> = {
  basketball: {
    title: "Basketball",
    blurb: "NBA, EuroLeague, BAL and FIBA, modelled like our football.",
    points: [
      "Tonight's slate with tip-off times in WAT — most NBA games land after midnight here.",
      "Projected score, spread and total points for every game.",
      "Rest and back-to-backs priced into every number.",
    ],
    meanwhile: [
      { label: "Football predictions", href: fb("predictions") },
      { label: "Live scores", href: fb("live") },
    ],
  },
  "slip-checker": {
    title: "Slip Checker",
    blurb: "Paste any slip or booking code and see how likely it is to land.",
    points: [
      "Every leg graded with our chance of landing.",
      "Weak legs flagged, with a stronger swap from the same game.",
      "Works with SportyBet booking codes or games added by hand.",
    ],
    meanwhile: [
      { label: "Selection builder", href: fb("slip") },
      { label: "Forge", href: fb("forge") },
    ],
  },
  "cash-out": {
    title: "Cash-out Checker",
    blurb: "Is SportyBet's cash-out offer fair? We'll tell you.",
    points: [
      "Your slip's real value right now, from live win probability.",
      "A clear Hold or Cash out verdict against the offer.",
      "An alert when the offer becomes fair.",
    ],
    meanwhile: [
      { label: "Track my slips", href: fb("trackedSlips") },
      { label: "Live scores", href: fb("live") },
    ],
  },
  "tipster-league": {
    title: "Tipster League",
    blurb: "Publish picks, build a public record, climb the monthly table.",
    points: [
      "Every pick locked at publish and graded automatically — no edits, no deletes.",
      "Ranked on return, not wins, with prizes for the top three each month.",
      "Follow the best tipsters and copy their picks to your slip.",
    ],
    meanwhile: [
      { label: "Our own track record", href: fb("trackRecord") },
      { label: "Forge", href: fb("forge") },
    ],
  },
  "odds-converter": {
    title: "Odds converter",
    blurb: "Decimal, fractional, American and implied chance, side by side.",
    points: ["Type any price in any format.", "See the implied chance and the bookmaker's margin."],
    meanwhile: [{ label: "Selection builder", href: fb("slip") }],
  },
  "bet-calculator": {
    title: "Bet calculator",
    blurb: "Returns on singles, accumulators and systems.",
    points: ["Stake, odds and returns for any slip.", "Each-way and system bets explained."],
    meanwhile: [{ label: "Selection builder", href: fb("slip") }],
  },
  "stake-planner": {
    title: "Stake planner",
    blurb: "How much to stake on each pick for your bankroll.",
    points: ["Kelly and flat staking, side by side.", "Keeps every stake inside limits you set."],
    meanwhile: [{ label: "Pricing", href: "/pricing" }],
  },
  results: {
    title: "Results",
    blurb: "Every final score, by league and by day.",
    points: ["Yesterday's and this week's results.", "How each of our picks did, game by game."],
    meanwhile: [
      { label: "Track record", href: fb("trackRecord") },
      { label: "Live scores", href: fb("live") },
    ],
  },
  tables: {
    title: "League tables",
    blurb: "Standings for every league we model.",
    points: ["Home and away tables.", "Our strength rating beside each club."],
    meanwhile: [{ label: "Fixtures", href: fb("fixtures") }],
  },
  h2h: {
    title: "Head-to-head",
    blurb: "Any two teams, every meeting.",
    points: ["Past results and goals.", "How often each side wins at home."],
    meanwhile: [{ label: "Match pages", href: fb("predictions") }],
  },
  "team-form": {
    title: "Team form",
    blurb: "Last 10, home and away, for every team.",
    points: ["Results, goals and clean sheets.", "Who's improving and who's slipping."],
    meanwhile: [{ label: "Trends", href: fb("trends") }],
  },
  "goals-stats": {
    title: "Goals stats",
    blurb: "Over/under and GG rates by team and league.",
    points: ["Which teams play high and low.", "League averages to compare against."],
    meanwhile: [{ label: "Trends", href: fb("trends") }],
  },
  ratings: {
    title: "Model ratings",
    blurb: "How strong we rate every team, attack and defence.",
    points: ["The ratings behind every prediction.", "Movers since last week."],
    meanwhile: [{ label: "Predictions", href: fb("predictions") }],
  },
  markets: {
    title: "Predictions by market",
    blurb: "Every game's read for one market at a time.",
    points: ["1X2, double chance, over/under, GG/NG, draw no bet, handicap and correct score.", "Sorted by our confidence."],
    meanwhile: [
      { label: "Today's predictions", href: fb("predictions") },
      { label: "Forge — pick your markets", href: fb("forge") },
    ],
  },
  "best-bets": {
    title: "Best bets",
    blurb: "Our highest-confidence picks across every league.",
    points: ["Ranked by confidence and data behind them.", "Refreshed through the day."],
    meanwhile: [
      { label: "Today's predictions", href: fb("predictions") },
      { label: "Forge, safe mode", href: fb("forge") },
    ],
  },
  "how-it-works": {
    title: "How our picks work",
    blurb: "The model, in plain words.",
    points: ["What a Dixon-Coles model is and why we use it.", "How we decide there's enough data to publish."],
    meanwhile: [{ label: "Track record", href: fb("trackRecord") }],
  },
  guides: {
    title: "Guides",
    blurb: "Markets and staking, explained.",
    points: ["What each market means.", "Value, margin and staking without the jargon."],
    meanwhile: [{ label: "Responsible gambling", href: "/responsible-gambling" }],
  },
  blog: {
    title: "Blog",
    blurb: "Model updates and matchday reads.",
    points: ["What changed in the model and why.", "Weekend previews."],
    meanwhile: [{ label: "Track record", href: fb("trackRecord") }],
  },
  help: {
    title: "Help centre",
    blurb: "Answers to common questions.",
    points: ["Accounts, payments and plans.", "How to read a prediction."],
    meanwhile: [
      { label: "Pricing", href: "/pricing" },
      { label: "Your account", href: "/account" },
    ],
  },
  "odds-format": {
    title: "Odds format",
    blurb: "Show prices as decimal, fractional or American.",
    points: ["One setting, used across the whole site."],
    meanwhile: [{ label: "Predictions", href: fb("predictions") }],
  },
};

export const soonHref = (slug: string) => `/soon/${slug}`;

/* ---------------------------------------------------------------- items */

export type NavAction = "ask" | "install";

export type Badge = { text: string; tone: "brand" | "amber" | "violet" | "rose" | "muted" };

export interface NavLink {
  label: string;
  desc?: string;
  href: string;
  /** Set when the destination is a coming-soon page. */
  soon?: boolean;
  badge?: Badge;
  /** Does something instead of navigating: opens Ask BetriX or the install prompt. */
  action?: NavAction;
}

export interface NavColumn {
  title: string;
  links: NavLink[];
  all?: { label: string; href: string };
}

export interface NavFeature {
  kicker: string;
  title: string;
  body: string;
  cta: { label: string; href: string; action?: NavAction };
  tone: "brand" | "violet" | "gold";
}

export interface NavMenu {
  id: string;
  label: string;
  /** Pathnames that light this tab up. */
  match: string[];
  columns: NavColumn[];
  feature: NavFeature;
}

export type NavTab =
  | { kind: "menu"; menu: NavMenu }
  | { kind: "link"; id: string; label: string; href: string; live?: boolean };

const SOON_BADGE: Badge = { text: "Soon", tone: "muted" };
const soon = (label: string, slug: string, desc?: string): NavLink => ({
  label,
  desc,
  href: soonHref(slug),
  soon: true,
  badge: SOON_BADGE,
});

const TOP_LEAGUES = ["premier-league", "npfl", "champions-league", "la-liga", "serie-a", "afcon-qualifiers"];

export function leagueLinks(sport: SportId): NavLink[] {
  const all = [...CLUB_LEAGUES, ...INTERNATIONAL_LEAGUES];
  return TOP_LEAGUES.flatMap((code) => {
    const l = all.find((x) => x.code === code);
    return l ? [{ label: `${l.flag} ${l.shortName}`, href: `${sportPath("predictions", sport)}?league=${l.code}` }] : [];
  });
}

/** The desktop menus and the mobile menu's sections, for one sport. */
export function navFor(sport: SportId): { tabs: NavTab[]; tools: NavLink[] } {
  const p = (route: Parameters<typeof sportPath>[0]) => sportPath(route, sport);

  const predictions: NavMenu = {
    id: "predictions",
    label: "Predictions",
    match: [p("predictions"), p("forYou"), p("valueAlerts"), "/soon/best-bets", "/soon/markets"],
    columns: [
      {
        title: "Picks",
        links: [
          { label: "For You", desc: "Picks from your leagues and markets", href: p("forYou") },
          { label: "Today", desc: "Every game we rate today", href: p("predictions") },
          { label: "Tomorrow & this weekend", desc: "What's coming, day by day", href: p("fixtures") },
          soon("Best bets", "best-bets", "Our highest-confidence picks"),
          { label: "Value Alerts", desc: "When the bookie price beats ours", href: p("valueAlerts"), badge: { text: "VIP", tone: "amber" } },
        ],
      },
      {
        title: "By market",
        links: ["1X2", "Double chance", "Over/Under goals", "GG/NG", "Draw no bet", "Handicap", "Correct score"].map((m) =>
          soon(m, "markets"),
        ),
      },
      {
        title: "Top leagues",
        links: leagueLinks(sport),
        all: { label: "All leagues", href: p("predictions") },
      },
    ],
    feature: {
      kicker: "BetriX Forge",
      title: "Tell us how you bet. We'll build the slip.",
      body: "Pick your style, total odds and markets. Forge picks the games and shows the chance of the slip winning.",
      cta: { label: "Build a slip", href: p("forge") },
      tone: "brand",
    },
  };

  const matches: NavMenu = {
    id: "matches",
    label: "Matches",
    match: [p("fixtures"), p("trends"), "/soon/results", "/soon/tables", "/soon/h2h", "/soon/team-form", "/soon/goals-stats", "/soon/ratings"],
    columns: [
      {
        title: "Matches",
        links: [
          { label: "Fixtures", desc: "The next two weeks, day by day", href: p("fixtures") },
          { label: "Live scores", href: p("live"), badge: { text: "Live", tone: "rose" } },
          soon("Results", "results"),
          soon("League tables", "tables"),
          soon("Head-to-head", "h2h"),
        ],
      },
      {
        title: "Insights",
        links: [
          { label: "Trends", desc: "Streaks and patterns across leagues", href: p("trends") },
          soon("Team form", "team-form", "Last 10, home and away"),
          soon("Goals stats", "goals-stats", "Over/under and GG rates by team"),
          soon("Model ratings", "ratings", "How strong we rate every team"),
        ],
      },
    ],
    feature: {
      kicker: "Live now",
      title: "Every game in play, grouped by league",
      body: "Scores and the clock straight from the feed, with a goal flash when the score changes.",
      cta: { label: "Open live scores", href: p("live") },
      tone: "brand",
    },
  };

  const tools: NavMenu = {
    id: "tools",
    label: "Tools",
    match: [p("forge"), p("slip"), "/soon/slip-checker", "/soon/cash-out", "/soon/odds-converter", "/soon/bet-calculator", "/soon/stake-planner"],
    columns: [
      {
        title: "Build and check",
        links: [
          { label: "Forge", desc: "Build a slip from how you like to bet", href: p("forge"), badge: { text: "New", tone: "brand" } },
          { label: "Selection builder", desc: "Your slip, priced against the model", href: p("slip") },
          { label: "My slips", desc: "Track your slips live", href: p("trackedSlips") },
          soon("Slip Checker", "slip-checker", "Grade any slip or booking code"),
          soon("Cash-out Checker", "cash-out", "Is the cash-out offer fair?"),
        ],
      },
      {
        title: "Calculators",
        links: [
          soon("Odds converter", "odds-converter", "Decimal, fractional, American and %"),
          soon("Bet calculator", "bet-calculator", "Returns on singles and accas"),
          soon("Stake planner", "stake-planner", "How much to stake on each pick"),
        ],
      },
    ],
    feature: {
      kicker: "Ask BetriX",
      title: "Ask anything about a match",
      body: "“Is Over 2.5 a good bet in Arsenal v Brighton?” Answers use the same model as our picks.",
      cta: { label: "Open Ask BetriX", href: "#ask", action: "ask" },
      tone: "violet",
    },
  };

  const league: NavMenu = {
    id: "league",
    label: "Tipster League",
    match: ["/soon/tipster-league"],
    columns: [
      {
        title: "The league",
        links: [
          soon("Leaderboard", "tipster-league", "Ranked on results, not followers"),
          soon("Following", "tipster-league", "Tipsters you follow"),
          soon("Publish a pick", "tipster-league"),
        ],
      },
      {
        title: "About",
        links: [soon("How the league works", "tipster-league"), soon("Rules and prizes", "tipster-league"), soon("My tipster profile", "tipster-league")],
      },
    ],
    feature: {
      kicker: "Coming soon",
      title: "Think you can beat the model?",
      body: "Publish picks, build a public record and climb the table every month.",
      cta: { label: "See what's coming", href: soonHref("tipster-league") },
      tone: "gold",
    },
  };

  const more: NavMenu = {
    id: "more",
    label: "More",
    match: ["/responsible-gambling", "/soon/how-it-works", "/soon/guides", "/soon/blog", "/soon/help"],
    columns: [
      {
        title: "BetriX",
        links: [
          { label: "Track record", desc: "Every pick we've published, graded", href: p("trackRecord") },
          soon("How our picks work", "how-it-works"),
          soon("Guides", "guides", "Markets and staking, explained"),
          soon("Blog", "blog"),
        ],
      },
      {
        title: "Help",
        links: [
          { label: "Your account", href: "/account" },
          soon("Help centre", "help"),
          { label: "Responsible gambling", desc: "Limits, breaks and support", href: "/responsible-gambling" },
        ],
      },
    ],
    feature: {
      kicker: "Get the app",
      title: "Install BetriX on your phone",
      body: "Picks and kick-off alerts on your home screen. No app store needed.",
      cta: { label: "Install the app", href: "#install", action: "install" },
      tone: "brand",
    },
  };

  return {
    tabs: [
      { kind: "menu", menu: predictions },
      { kind: "link", id: "live", label: "Live", href: p("live"), live: true },
      { kind: "menu", menu: matches },
      { kind: "menu", menu: tools },
      { kind: "menu", menu: league },
      { kind: "link", id: "track", label: "Track Record", href: p("trackRecord") },
      { kind: "link", id: "pricing", label: "Pricing", href: "/pricing" },
      { kind: "menu", menu: more },
    ],
    tools: [
      { label: "Forge", desc: "Build a slip from how you bet", href: p("forge") },
      { label: "Ask BetriX", desc: "Ask anything about a match", href: "#ask", action: "ask" },
      soon("Slip Checker", "slip-checker", "Grade any slip or code"),
      soon("Cash-out Checker", "cash-out", "Is the offer fair?"),
    ],
  };
}

/** Is this nav item where the user is now? Query strings are ignored. */
export function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  if (!path || path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Every destination as a flat list, for search. */
export function allLinks(sport: SportId): NavLink[] {
  const { tabs, tools } = navFor(sport);
  const out: NavLink[] = [];
  for (const t of tabs) {
    if (t.kind === "link") out.push({ label: t.label, href: t.href });
    else for (const c of t.menu.columns) out.push(...c.links);
  }
  out.push(...tools);
  const seen = new Set<string>();
  return out.filter((l) => {
    const key = `${l.label}|${l.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
