import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two files that cache under the same key must store the same shape. In
 * November 2026 team-page.ts kept mapped fixtures under `team:fixtures:<id>`
 * and player-page.ts kept the raw rows there; whichever page filled the entry
 * first crashed the other for five minutes (2,746 errors, 290 visitors, in a
 * week). A shared key is allowed only when listed here, with both sides
 * checked by hand to hold the same thing.
 */
const SHARED_ON_PURPOSE: Record<string, string[]> = {
  // Both hold the raw team_fixtures rows; each page maps them outside the cache.
  "team:fixtures:": ["src/lib/player-page.ts", "src/lib/team-page.ts"],
};

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("cache keys", () => {
  it("are not shared between files unless listed as the same shape", () => {
    const owners = new Map<string, Set<string>>();
    for (const file of sources("src")) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bcached(?:<[^(]*>)?\(\s*[`"']([^`"'$]*)/g)) {
        const set = owners.get(m[1]) ?? new Set<string>();
        set.add(file.replaceAll("\\", "/"));
        owners.set(m[1], set);
      }
    }
    expect(owners.size).toBeGreaterThan(20);
    const clashes = [...owners]
      .filter(([, files]) => files.size > 1)
      .map(([key, files]) => [key, [...files].sort()] as const)
      .filter(([key, files]) => JSON.stringify(SHARED_ON_PURPOSE[key]) !== JSON.stringify(files));
    expect(clashes).toEqual([]);
  });

  it("keeps the raw rows under the key the team and player pages share", () => {
    const team = readFileSync("src/lib/team-page.ts", "utf8");
    const block = team.slice(team.indexOf("cached(`team:fixtures:"), team.indexOf("return rows.map"));
    expect(block).toContain("return (data ?? []) as FixtureRow[]");
    expect(block).not.toContain("publicMatchId");
  });
});
