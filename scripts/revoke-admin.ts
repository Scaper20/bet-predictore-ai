/**
 * Removes admin-dashboard access from an account, or wipes the login
 * entirely. The counterpart to scripts/create-admin.ts.
 *
 * Deliberately does NOT import supabaseAdmin from src/lib/supabase/admin —
 * same reasoning as create-admin.ts: that import chain starts with
 * `import "server-only"`, which throws outside a Next.js bundling context.
 *
 * Usage:
 *   npx tsx scripts/revoke-admin.ts --email=old-admin@example.com
 *   npx tsx scripts/revoke-admin.ts --email=old-admin@example.com --delete
 *
 * Without --delete: removes the admin_users row only — the login still
 * works for the ordinary site, it just loses /admin access. Reversible via
 * create-admin.ts.
 *
 * With --delete: deletes the underlying auth user outright. profiles.id and
 * admin_users.id both cascade off auth.users(id) (0001_init.sql,
 * 0004_admin_users.sql), so this takes the profile and admin grant with it
 * in one step. Not reversible — the account is gone.
 *
 * This is a real, hard-to-reverse action against whichever Supabase project
 * your .env points at — confirm that's genuinely the intended project
 * before running it for real.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const email = get("email");
  const del = args.includes("--delete");

  if (!email) {
    console.error("Usage: tsx scripts/revoke-admin.ts --email=old-admin@example.com [--delete]");
    process.exit(1);
  }
  return { email, del };
}

async function main() {
  const { email, del } = parseArgs();

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

  const { data: profile, error } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (error || !profile) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }
  const userId = profile.id as string;

  if (del) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete user:", deleteError.message);
      process.exit(1);
    }
    console.log(`Deleted ${email} entirely (login, profile, and admin access all gone).`);
    return;
  }

  const { error: deleteAdminError } = await admin.from("admin_users").delete().eq("id", userId);
  if (deleteAdminError) {
    console.error("Failed to revoke admin access:", deleteAdminError.message);
    process.exit(1);
  }
  console.log(`Revoked admin-dashboard access for ${email}. The login itself still works for the ordinary site.`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
