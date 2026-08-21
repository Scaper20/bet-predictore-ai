import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase is migrating anon/service_role (legacy JWTs) to publishable/secret
// keys; both work as drop-in values for these same client constructors, so
// this just prefers whichever name is actually set. New projects' dashboards
// show publishable/secret by default now.
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * For Server Components, Route Handlers and Server Actions.
 *
 * Server Components can read cookies but not write them — `setAll` below
 * no-ops there (wrapped in try/catch, per the @supabase/ssr docs) because
 * `middleware.ts` is what actually refreshes the session cookie on every
 * request. A Server Component calling this only ever reads.
 */
export async function supabaseServer() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — expected, middleware handles refresh.
        }
      },
    },
  });
}

/** True as soon as the required env vars exist, independent of whether the project is reachable. */
export const supabaseConfigured = Boolean(url && anonKey);
