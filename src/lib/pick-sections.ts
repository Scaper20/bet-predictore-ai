import type { Match } from "@/lib/types";
import { relativeDay } from "@/lib/format";
import { isStaleInPlay } from "@/lib/match-status";

/**
 * The Picks page's sections, in the order people want them: games under
 * way first, then the rest of today, then tomorrow and each day after.
 *
 * Within a section, followed competitions come first (the onboarding
 * choices have to visibly change the page), then kickoff order.
 */

export interface PickSection<T> {
  key: string;
  title: string;
  live: boolean;
  items: T[];
}

export function pickSections<T extends { match: Match }>(
  items: T[],
  opts: { followed?: Set<string>; now?: Date } = {},
): PickSection<T>[] {
  const now = opts.now ?? new Date();
  const followed = opts.followed ?? new Set<string>();
  const rank = (t: T) => (followed.has(t.match.league.code ?? "") ? 0 : 1);
  const order = (a: T, b: T) => rank(a) - rank(b) || Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff);

  const live: T[] = [];
  const days = new Map<string, T[]>();
  for (const t of items) {
    const { status, kickoff } = t.match;
    const inPlay = (status === "live" || status === "halftime") && !isStaleInPlay(status, kickoff, now.getTime());
    if (inPlay) {
      live.push(t);
      continue;
    }
    const day = relativeDay(kickoff, now);
    const list = days.get(day);
    if (list) list.push(t);
    else days.set(day, [t]);
  }

  const sections: PickSection<T>[] = [];
  if (live.length) {
    sections.push({ key: "live", title: "Live now", live: true, items: live.sort((a, b) => Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff)) });
  }
  const earliest = (list: T[]) => Math.min(...list.map((t) => Date.parse(t.match.kickoff)));
  [...days.entries()]
    .sort((a, b) => earliest(a[1]) - earliest(b[1]))
    .forEach(([day, list]) => {
      sections.push({ key: day, title: day === "Today" ? "Upcoming today" : day, live: false, items: list.sort(order) });
    });
  return sections;
}
