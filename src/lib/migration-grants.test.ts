import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Since 30 October 2026 Supabase no longer grants Data API access to new
 * tables in public, so a table created without a grant is unreachable, even
 * from the server. 0063 covers every table before it; from then on each
 * migration that creates a table must grant it in the same file, at least to
 * service_role (see 0063 for the rule on anon and authenticated).
 */

const DIR = path.resolve(__dirname, "../../supabase/migrations");
const FIRST_CHECKED = 63;

const CREATE = /create\s+(?:table|(?:or\s+replace\s+)?(?:materialized\s+)?view)\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi;

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Tables and views a migration creates in public that it never grants to service_role. */
function ungranted(sql: string): string[] {
  const body = stripComments(sql);
  const grants = [...body.matchAll(/grant\s[^;]*?\son\s([^;]*?)\sto\s([^;]*);/gi)];
  const all = grants.some((g) => /all\s+tables\s+in\s+schema\s+public/i.test(g[1]) && /service_role/i.test(g[2]));
  const missing: string[] = [];
  for (const [, name] of body.matchAll(CREATE)) {
    const granted = all || grants.some((g) => /service_role/i.test(g[2]) && new RegExp(`public\\.${name}\\b`, "i").test(g[1]));
    if (!granted) missing.push(name);
  }
  return missing;
}

describe("ungranted", () => {
  it("flags a table with no grant", () => {
    expect(ungranted("create table public.foo (id int);")).toEqual(["foo"]);
  });
  it("accepts a table granted to service_role", () => {
    expect(ungranted("create table if not exists public.foo (id int);\ngrant select, insert on public.foo to service_role;")).toEqual([]);
  });
  it("accepts a grant on all tables", () => {
    expect(ungranted("create table public.foo (id int);\ngrant select on all tables in schema public to service_role;")).toEqual([]);
  });
  it("does not count a grant to anon alone", () => {
    expect(ungranted("create table public.foo (id int);\ngrant select on public.foo to anon;")).toEqual(["foo"]);
  });
  it("ignores commented-out SQL", () => {
    expect(ungranted("-- create table public.foo (id int);")).toEqual([]);
  });
});

describe("migrations", () => {
  const files = readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f) && Number.parseInt(f, 10) >= FIRST_CHECKED);

  it.each(files)("%s grants every table it creates", (file) => {
    expect(ungranted(readFileSync(path.join(DIR, file), "utf8"))).toEqual([]);
  });
});
