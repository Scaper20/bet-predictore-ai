/**
 * The site's navigation, in one place.
 *
 * Desktop menus, the mobile menu, the bottom bar and search all read from
 * here, so a destination is defined once. Features not built yet stay out of
 * the menus (docs/roadmap.md lists them); basketball is the one announced
 * sport, behind its coming-soon page.
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

/**
 * Everything announced but not yet built, by slug. Only basketball is
 * announced; the rest of the plan lives in docs/roadmap.md until it ships.
 */
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
    match: [p("predictions"), p("forYou"), p("valueAlerts")],
    columns: [
      {
        title: "Picks",
        links: [
          { label: "For You", desc: "Picks from your leagues and markets", href: p("forYou") },
          { label: "Today", desc: "Every game we rate today", href: p("predictions") },
          { label: "Tomorrow & this weekend", desc: "What's coming, day by day", href: p("fixtures") },
          { label: "Value Alerts", desc: "When the bookie price beats ours", href: p("valueAlerts"), badge: { text: "VIP", tone: "amber" } },
        ],
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
    match: [p("fixtures"), p("trends"), p("results"), p("tables"), p("h2h"), p("teamForm"), p("goals"), p("ratings")],
    columns: [
      {
        title: "Matches",
        links: [
          { label: "Fixtures", desc: "The next two weeks, day by day", href: p("fixtures") },
          { label: "Live scores", href: p("live"), badge: { text: "Live", tone: "rose" } },
          { label: "Results", desc: "Every final score, day by day", href: p("results") },
          { label: "League tables", desc: "Standings that move while games are on", href: p("tables"), badge: { text: "Live", tone: "rose" } },
          { label: "Head-to-head", desc: "Any two teams, every meeting", href: p("h2h") },
        ],
      },
      {
        title: "Insights",
        links: [
          { label: "Trends", desc: "Streaks worth knowing before kick-off", href: p("trends") },
          { label: "Team form", desc: "Last 10, home and away", href: p("teamForm") },
          { label: "Goals stats", desc: "Over/under and GG rates by team", href: p("goals") },
          { label: "Model ratings", desc: "Every team rated 1 to 10", href: p("ratings"), badge: { text: "New", tone: "brand" } },
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
    match: [p("forge"), p("slip"), p("trackedSlips")],
    columns: [
      {
        title: "Build and check",
        links: [
          { label: "Forge", desc: "Build a slip from how you like to bet", href: p("forge"), badge: { text: "New", tone: "brand" } },
          { label: "Selection builder", desc: "Your slip, priced against the model", href: p("slip") },
          { label: "My slips", desc: "Track your slips live", href: p("trackedSlips") },
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

  const more: NavMenu = {
    id: "more",
    label: "More",
    match: [p("trackRecord"), "/responsible-gambling", "/how-it-works", "/guides", "/help"],
    columns: [
      {
        title: "BetriX",
        links: [
          { label: "Track record", desc: "Every pick we've published, graded", href: p("trackRecord") },
          { label: "How our picks work", desc: "The model, in plain words", href: "/how-it-works" },
          { label: "Guides", desc: "Markets and staking, explained", href: "/guides" },
        ],
      },
      {
        title: "Help",
        links: [
          { label: "Your account", href: "/account" },
          { label: "Help centre", desc: "Answers to common questions", href: "/help" },
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
      { kind: "link", id: "pricing", label: "Pricing", href: "/pricing" },
      { kind: "menu", menu: more },
    ],
    tools: [
      { label: "Forge", desc: "Build a slip from how you bet", href: p("forge") },
      { label: "Ask BetriX", desc: "Ask anything about a match", href: "#ask", action: "ask" },
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
