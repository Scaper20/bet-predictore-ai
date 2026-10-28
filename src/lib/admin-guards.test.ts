import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, NAV_SECTIONS } from "./admin-access";

/**
 * Every admin page, action and route checks a named permission on the server.
 *
 * The protected layout only proves the visitor is staff; what they may open
 * is decided page by page. A page or action added without its own check
 * would be open to every role, so this test reads the source and fails the
 * build when one is missing, the same way migration-grants.test.ts guards
 * the database grants.
 */

const ROOT = path.resolve(__dirname, "../..");

function files(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full, match));
    else if (match.test(name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f);
const PERMISSION = /(?:requirePermission|checkPermission)\("([a-z]+\.[a-z]+)"\)/g;

/** Pages every staff member may open: the dashboard tailors itself to their roles, and denied explains a refusal. */
const OPEN_TO_ALL_STAFF = new Set(["src/app/admin/(protected)/page.tsx", "src/app/admin/(protected)/denied/page.tsx"]);

const pages = files(path.join(ROOT, "src/app/admin/(protected)"), /^page\.tsx$/).filter((f) => !OPEN_TO_ALL_STAFF.has(rel(f)));
const routes = [
  ...files(path.join(ROOT, "src/app/admin/(protected)"), /^route\.ts$/),
  ...files(path.join(ROOT, "src/app/api/admin"), /^route\.ts$/),
];
const actions = files(path.join(ROOT, "src/app/actions/admin"), /\.ts$/);

describe("admin pages", () => {
  it.each(pages.map(rel))("%s requires a permission", (file) => {
    expect(readFileSync(path.join(ROOT, file), "utf8")).toMatch(/requirePermission\("[a-z]+\.[a-z]+"\)/);
  });

  it("names only real permissions", () => {
    for (const f of [...pages, ...routes, ...actions]) {
      for (const [, p] of readFileSync(f, "utf8").matchAll(PERMISSION)) {
        expect(ALL_PERMISSIONS, `${rel(f)} names ${p}`).toContain(p);
      }
    }
  });

  it("gates each nav page with the permission the nav shows it for", () => {
    for (const item of NAV_SECTIONS.flatMap((s) => s.items)) {
      if (!item.permission) continue;
      const file = path.join(ROOT, "src/app/admin/(protected)", item.href.replace(/^\/admin\/?/, ""), "page.tsx");
      expect(readFileSync(file, "utf8"), item.href).toContain(`requirePermission("${item.permission}")`);
    }
  });
});

describe("admin routes", () => {
  it.each(routes.map(rel))("%s checks a permission", (file) => {
    expect(readFileSync(path.join(ROOT, file), "utf8")).toMatch(/checkPermission\("[a-z]+\.[a-z]+"\)/);
  });
});

describe("admin actions", () => {
  it.each(actions.map(rel))("%s checks a permission in every exported action", (file) => {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    expect(src).not.toMatch(/\bcheckAdmin\(/);
    // Each exported function's body, up to the next top-level function.
    const bodies = src.split(/^(?=export async function )/m).filter((b) => b.startsWith("export async function "));
    for (const body of bodies) {
      const name = body.match(/^export async function (\w+)/)?.[1];
      // A helper that gates (mail's requireMailAdmin) counts as the check.
      expect(body, `${file} ${name}`).toMatch(/checkPermission\(|requireMailAdmin\(/);
    }
  });
});
