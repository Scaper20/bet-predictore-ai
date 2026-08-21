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
