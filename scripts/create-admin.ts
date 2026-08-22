/**
 * One-time (or occasional) setup: grants admin-dashboard access to an
 * account.
 *
 * Deliberately does NOT import supabaseAdmin from src/lib/supabase/admin —
 * that file (and everything it transitively pulls in) starts with
 * `import "server-only"`, which throws immediately outside a Next.js
 * react-server bundling context. tsx runs this as a plain Node script, so
 * that import would crash before main() ever executes. Builds its own
 * client inline instead.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts --email=you@example.com --create
 *   npx tsx scripts/create-admin.ts --email=you@example.com
 *
 * --create makes a brand-new login (a dedicated admin-only credential, not
 * tied to any existing site account) with a random password printed ONCE
 * below — never written to disk or git. Without --create, promotes an
 * existing account, found by matching profiles.email (kept in sync with
 * auth.users.email by 0003_profiles_email_sync.sql).
 *
 * This is a real, hard-to-reverse action against whichever Supabase project
 * your .env points at — confirm that's genuinely the intended project
 * before running it for real.
 */
import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const email = get("email");
  const create = args.includes("--create");

  if (!email) {
    console.error("Usage: tsx scripts/create-admin.ts --email=you@example.com [--create]");
    process.exit(1);
  }
  return { email, create };
}

async function main() {
  const { email, create } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env first.");
    process.exit(1);
  }
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userId: string;
  if (create) {
    const password = crypto.randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      console.error("Failed to create user:", error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Created a new login for ${email}.`);
    console.log(`TEMPORARY PASSWORD (shown once — not stored anywhere): ${password}`);
    console.log(`Sign in at /admin/login, then change this password from /account immediately.`);
  } else {
    const { data: profile, error } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (error || !profile) {
      console.error(`No existing account found for ${email}. Pass --create to make a new login, or have them sign up first.`);
      process.exit(1);
    }
    userId = profile.id as string;
  }

  const { error: upsertError } = await admin.from("admin_users").upsert({ id: userId }, { onConflict: "id" });
  if (upsertError) {
    console.error("Failed to grant admin access:", upsertError.message);
    process.exit(1);
  }

  console.log(`Done: ${email} now has admin dashboard access.`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
