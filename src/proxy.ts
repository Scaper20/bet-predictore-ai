import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Refreshes the Supabase auth session on every request so Server Components
 * (which can read cookies but not write them) always see a valid token.
 *
 * Skipped entirely when Supabase isn't configured, so the app keeps working
 * with zero env vars set — same "runs with nothing configured" posture as
 * the football-data providers.
 *
 * Named `proxy` (not `middleware`) per Next.js 16 — the `middleware` file
 * convention is deprecated. See node_modules/next/dist/docs/.../proxy.md.
 */
export async function proxy(request: NextRequest) {
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) — it revalidates the token against Supabase
  // rather than trusting whatever the cookie claims, which matters the moment
  // this session is used as an authorization boundary (it is, from Phase 3 on).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, images, the favicon files, and
     * the Paystack webhook — that call carries no Supabase cookie and must
     * never be redirected or rewritten.
     */
    "/((?!_next/static|_next/image|icon.png|apple-icon.png|brand/|favicon.ico|api/billing/webhook).*)",
  ],
};
