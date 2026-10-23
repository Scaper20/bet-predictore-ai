/**
 * The site's navigation, in one place.
 *
 * Desktop menus, the mobile menu, the bottom bar and search all read from
 * here, so a destination is defined once. Features not built yet stay out of
 * the menus (docs/roadmap.md lists them); basketball is the one announced
 * sport, behind its coming-soon page.
 */

import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import { sportPath, scoresPath } from "@/lib/routes";
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
      "Tonight's slate with tip-off times in your time zone.",
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

export type NavAction = "ask" | "install" | "slip" | "support" | "tour";

export type Badge = { text: string; tone: "brand" | "amber" | "violet" | "rose" | "muted" };

export interface NavLink {
  label: string;
  desc?: string;
  href: string;
  /** Set when the destination is a coming-soon page. */
  soon?: boolean;
  badge?: Badge;
  /** Does something instead of navigating: opens Ask KiqStat or the install prompt. */
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
  | { kind: "link"; id: string; label: string; href: string; live?: boolean; badge?: Badge; tour?: string };

const TOP_LEAGUES = ["premier-league", "npfl", "champions-league", "la-liga", "serie-a", "afcon-qualifiers"];

export function leagueLinks(sport: SportId): NavLink[] {
  const all = [...CLUB_LEAGUES, ...INTERNATIONAL_LEAGUES];
  return TOP_LEAGUES.flatMap((code) => {
    const l = all.find((x) => x.code === code);
    return l ? [{ label: `${l.flag} ${l.shortName}`, href: `${sportPath("predictions", sport)}?league=${l.code}` }] : [];
  });
}

/** The desktop menus and the mobile menu's sections, for one sport. */
export function navFor(sport: SportId): { tabs: NavTab[]; tools: NavLink[]; toolsMenu: NavMenu } {
  const p = (route: Parameters<typeof sportPath>[0]) => sportPath(route, sport);

  const predictions: NavMenu = {
    id: "predictions",
    label: "Predictions",
    match: [p("predictions")],
    columns: [
      {
        title: "Picks",
        links: [
          { label: "Today", desc: "Every game we rate today", href: p("predictions") },
        ],
      },
      {
        title: "Top leagues",
        links: leagueLinks(sport),
        all: { label: "All leagues", href: p("predictions") },
      },
    ],
    feature: {
      kicker: "KiqStat Forge",
      title: "Tell us how you like to pick. We'll build the combo.",
      body: "Pick your style, combined price and prediction types. Forge picks the games and shows the chance of the whole combo landing.",
      cta: { label: "Build a combo", href: p("forge") },
      tone: "brand",
    },
  };

  const matches: NavMenu = {
    id: "matches",
    label: "Matches",
    match: [p("trends"), p("tables"), p("h2h"), p("teamForm"), p("goals"), p("ratings")],
    columns: [
      {
        title: "Matches",
        links: [
          { label: "Fixtures", desc: "The next two weeks, day by day", href: scoresPath("fixtures", { sport }) },
          { label: "Live scores", href: p("live"), badge: { text: "Live", tone: "rose" } },
          { label: "Results", desc: "Every final score, day by day", href: scoresPath("results", { sport }) },
          { label: "League tables", desc: "Standings that move while games are on", href: p("tables"), badge: { text: "Live", tone: "rose" } },
          { label: "Head-to-head", desc: "Any two teams, every meeting", href: p("h2h") },
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

  const insights: NavMenu = {
    id: "insights",
    label: "Insights",
    match: [p("trends"), p("teamForm"), p("goals"), p("ratings")],
    columns: [
      {
        title: "Insights",
        links: [
          { label: "Trends", desc: "Streaks worth knowing before kick-off", href: p("trends") },
          { label: "Team form", desc: "Last 10, home and away", href: p("teamForm") },
          { label: "Goals stats", desc: "Over/under and both-teams-scoring rates by team", href: p("goals") },
          { label: "Model ratings", desc: "Every team rated 1 to 10", href: p("ratings"), badge: { text: "New", tone: "brand" } },
        ],
      },
    ],
    feature: {
      kicker: "Model ratings",
      title: "Every team rated 1 to 10",
      body: "Attack, defence and form in one number, from the same model as the picks.",
      cta: { label: "See the ratings", href: p("ratings") },
      tone: "brand",
    },
  };

  // Not a desktop menu any more: Forge, Code Hub and My combos sit in the
  // bar itself so they are seen, not found. The phone menu still groups them.
  const tools: NavMenu = {
    id: "tools",
    label: "Tools",
    match: [p("forge"), p("codeHub"), p("codeEditor"), p("codeCommunity"), p("slip"), p("trackedSlips")],
    columns: [
      {
        title: "Build and check",
        links: [
          { label: "Code Hub", desc: "Ready-made codes, 2 to 20 odds", href: p("codeHub"), badge: { text: "New", tone: "brand" } },
          { label: "Code editor", desc: "Check any code, make it safer", href: p("codeEditor") },
          { label: "Code community", desc: "Members' codes, ranked by the model", href: p("codeCommunity") },
          { label: "Forge", desc: "Build a combo from how you like to pick", href: p("forge") },
          { label: "My combos", desc: "Track your combos live", href: p("trackedSlips") },
        ],
      },
    ],
    feature: {
      kicker: "Ask KiqStat",
      title: "Ask anything about a match",
      body: "“How likely is Over 2.5 in Arsenal v Brighton?” Answers use the same model as our picks.",
      cta: { label: "Open Ask KiqStat", href: "#ask", action: "ask" },
      tone: "brand",
    },
  };

  const more: NavMenu = {
    id: "more",
    label: "More",
    match: [p("trackRecord"), "/responsible-use", "/how-it-works", "/guides", "/help", "/about"],
    columns: [
      {
        title: "KiqStat",
        links: [
          { label: "Track record", desc: "Every pick we've published, graded", href: p("trackRecord") },
          { label: "How our picks work", desc: "The model, in plain words", href: "/how-it-works" },
          { label: "Guides", desc: "Predictions and probabilities, explained", href: "/guides" },
          { label: "About KiqStat", desc: "Who we are and what we do", href: "/about" },
        ],
      },
      {
        title: "Help",
        links: [
          { label: "Your account", href: "/account" },
          { label: "Help centre", desc: "Answers to common questions", href: "/help" },
          { label: "Take the tour", desc: "A 30-second walkthrough", href: "#tour", action: "tour" },
          { label: "Chat with support", desc: "Message Oma, our support team", href: "/help", action: "support" },
          { label: "Responsible use", desc: "Limits, breaks and support", href: "/responsible-use" },
        ],
      },
    ],
    feature: {
      kicker: "Get the app",
      title: "Install KiqStat on your phone",
      body: "Picks and kick-off alerts on your home screen. No app store needed.",
      cta: { label: "Install the app", href: "#install", action: "install" },
      tone: "brand",
    },
  };

  return {
    tabs: [
      { kind: "menu", menu: predictions },
      { kind: "link", id: "live", label: "Live", href: p("live"), live: true, tour: "scores" },
      { kind: "menu", menu: matches },
      { kind: "menu", menu: insights },
      { kind: "link", id: "forge", label: "Forge", href: p("forge"), tour: "forge" },
      { kind: "link", id: "code-hub", label: "Code Hub", href: p("codeHub"), tour: "code-hub", badge: { text: "New", tone: "brand" } },
      { kind: "link", id: "combos", label: "My combos", href: p("trackedSlips"), tour: "combos" },
      { kind: "link", id: "pricing", label: "Pricing", href: "/pricing" },
      { kind: "menu", menu: more },
    ],
    toolsMenu: tools,
    // The phone menu's shortcut tiles (mobile-drawer.tsx), in this order.
    tools: [
      { label: "Code community", desc: "Members' codes, ranked", href: p("codeCommunity") },
      { label: "Code editor", desc: "Check any code, make it safer", href: p("codeEditor") },
      { label: "Ask KiqStat", desc: "Ask anything about a match", href: "#ask", action: "ask" },
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

/**
 * The phone menu's sections: the desktop menus, with Tools put back in
 * before More (on desktop its links sit in the bar itself).
 */
export function drawerMenus(sport: SportId): NavMenu[] {
  const { tabs, toolsMenu } = navFor(sport);
  const menus = tabs.flatMap((t) => (t.kind === "menu" ? [t.menu] : []));
  const at = menus.findIndex((m) => m.id === "more");
  menus.splice(at < 0 ? menus.length : at, 0, toolsMenu);
  return mobileMenus(menus);
}

/**
 * The mobile menu's sections, from the desktop menus.
 *
 * Phones already reach Picks and Live from the bottom bar, so the
 * Predictions section is dropped there; Matches leads, and Insights gets
 * its own section instead of sitting under Matches.
 */
export function mobileMenus(menus: NavMenu[]): NavMenu[] {
  return menus.flatMap((m): NavMenu[] => {
    if (m.id === "predictions") return [];
    if (m.id === "matches" && m.columns.length > 1) {
      const [main, ...rest] = m.columns;
      const insightLinks = rest.flatMap((c) => c.links);
      return [
        { ...m, columns: [main], match: main.links.map((l) => l.href) },
        { ...m, id: "insights", label: "Insights", columns: rest, match: insightLinks.map((l) => l.href) },
      ];
    }
    return [m];
  });
}
