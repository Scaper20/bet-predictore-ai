/**
 * Grants a paid tier directly in `subscriptions`, bypassing Paystack
 * entirely — for creating test/review accounts (VIP walkthroughs, etc.),
 * not a real billing path.
 *
 * Deliberately does NOT import supabaseAdmin from src/lib/supabase/admin —
 * that file (and everything it transitively pulls in) starts with
 * `import "server-only"`, which throws immediately outside a Next.js
 * react-server bundling context. tsx runs this as a plain Node script, so
 * that import would crash before main() ever executes. Builds its own
 * client inline instead (same reasoning as scripts/create-admin.ts).
 *
 * Usage:
 *   npx tsx scripts/grant-subscription.ts --email=you@example.com --tier=vip --create
 *   npx tsx scripts/grant-subscription.ts --email=you@example.com --tier=pro
 *
 * --create makes a brand-new login with a random password printed ONCE
 * below — never written to disk or git. Without --create, promotes an
 * existing account, found by matching profiles.email.
 *
 * current_period_end is set 1 year out for pro/vip (pass_expires_at 1 year
 * out for pass) so getEntitlement() (src/lib/entitlements.ts) resolves this
 * as a normal, unambiguously-active paid subscription rather than relying
 * on its no-period-end-yet fallback path.
 *
 * This is a real, hard-to-reverse action against whichever Supabase project
 * your .env points at — confirm that's genuinely the intended project
 * before running it for real.
 */
import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
// @supabase/supabase-js unconditionally constructs a Realtime client inside
// createClient(), even though this script never uses realtime — and on
// Node 20 and below (no native `WebSocket` global; that lands in Node 22)
// that constructor throws immediately unless an explicit transport is
// given. `ws` is only ever passed as that transport, never opened.
import WebSocket from "ws";

type Tier = "pass" | "pro" | "vip";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const email = get("email");
  const tier = get("tier") as Tier | undefined;
  const create = args.includes("--create");

  if (!email || !tier || !["pass", "pro", "vip"].includes(tier)) {
    console.error("Usage: tsx scripts/grant-subscription.ts --email=you@example.com --tier=<pass|pro|vip> [--create]");
    process.exit(1);
  }
  return { email, tier, create };
}

async function main() {
  const { email, tier, create } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env first.");
    process.exit(1);
  }
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

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
    console.log(`Sign in at /account/login.`);
  } else {
    const { data: profile, error } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (error || !profile) {
      console.error(`No existing account found for ${email}. Pass --create to make a new login, or have them sign up first.`);
      process.exit(1);
    }
    userId = profile.id as string;
  }

  const oneYearOut = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const row: {
    user_id: string;
    tier: Tier;
    status: "active";
    updated_at: string;
    current_period_end?: string;
    pass_expires_at?: string;
  } =
    tier === "pass"
      ? { user_id: userId, tier, status: "active", pass_expires_at: oneYearOut, updated_at: new Date().toISOString() }
      : { user_id: userId, tier, status: "active", current_period_end: oneYearOut, updated_at: new Date().toISOString() };

  const { error: upsertError } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
  if (upsertError) {
    console.error("Failed to grant subscription:", upsertError.message);
    process.exit(1);
  }

  console.log(`Done: ${email} now has ${tier.toUpperCase()} access (expires ${oneYearOut}).`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
