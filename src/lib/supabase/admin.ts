import "server-only";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer the newer secret key name; fall back to the legacy service_role key.
// Whichever name is used, this value must NEVER carry a NEXT_PUBLIC_ prefix —
// it bypasses Row Level Security entirely.
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role client — bypasses Row Level Security entirely.
 *
 * Only ever import this from code that never runs in a user's request
 * context on their behalf: the Paystack webhook, and scheduled jobs (the
 * predictions-log/settlement crons). Never call this from a Server Action
 * or Route Handler that's acting on the current signed-in user's session —
 * use `supabaseServer()` for that so RLS still applies.
 *
 * One narrow, deliberate exception: `deleteAccount` (src/app/actions/account.ts)
 * calls `auth.admin.deleteUser()` here, because that's the only primitive
 * that can delete a user's own `auth.users` row at all — there is no
 * RLS-scoped equivalent. It's safe there specifically because the session is
 * re-verified via `signInWithPassword` immediately beforehand, and the id
 * passed is always the one from that freshly-verified session, never
 * client-supplied.
 *
 * A second, distinct exception: any Server Action, Route Handler, or Server
 * Component under src/app/admin/** (or src/app/actions/admin/**) that has
 * already called `requireAdmin()`/`checkAdmin()` (src/lib/admin.ts) and
 * confirmed the caller has an `admin_users` row. That check runs through the
 * ordinary RLS-scoped `supabaseServer()` client first — `admin_users` has
 * exactly one RLS policy, a plain self-select — and only once it passes does
 * the code reach for this service-role client, to read or write OTHER
 * users' data (every user's row for the dashboard's registered-user count,
 * another user's support_messages when replying as an admin, etc.). This
 * differs from the general prohibition above: that one is about a user's
 * own session bypassing RLS to act on ITS OWN behalf; this is a
 * verified-admin's session, having proven its status through a real,
 * explicit gate, acting on other users' data through a consistently gated
 * path — never a raw, ungated query.
 */
export function supabaseAdmin() {
  if (!url || !secretKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
