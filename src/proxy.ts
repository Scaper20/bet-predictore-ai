import { createServerClient } from "@supabase/ssr";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

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
export async function proxy(request: NextRequest, event: NextFetchEvent) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "Active users" signal for the admin dashboard (profiles.last_seen_at).
  // Throttled: the WHERE-equivalent .or() below means most requests execute
  // a fast no-op update (0 rows match), so the row only actually changes
  // roughly once per user per 10 minutes — but every request still makes
  // the call, this just keeps each call's DB work cheap, not skipped
  // outright. Backgrounded via waitUntil so it adds no latency to the
  // response. Uses this same RLS-scoped client, not the service-role one —
  // this runs in the user's own request context, writing their own row,
  // exactly what profiles_update_own already permits (see admin.ts's doc
  // comment for why the service-role client is never used for this).
  /*
   * A non-httpOnly hint so the header can pick its shape at hydration rather
   * than after a round trip to /api/entitlements.
   *
   * The header cannot read the session itself: doing that means cookies() in
   * the shared layout, which opts every route below it out of static
   * rendering (see the comment in (app)/layout.tsx). So it renders a neutral
   * placeholder and swaps once the tier arrives — and for an anonymous
   * visitor that means the sign-up CTA, the single most important element on
   * the page for this work, shows up a network round trip late.
   *
   * This carries no identity and no claim of any kind: it says only "there
   * was a session on the last request", it is trivially forgeable by anyone
   * who cares to, and NOTHING may authorize on it. Every real check still
   * goes through getEntitlement() server-side. It is a hint about which of
   * two buttons to paint.
   *
   * Written only when the value actually changes — roughly once per sign-in
   * and once per sign-out — so it does not attach Set-Cookie to responses
   * that would otherwise be cacheable.
   */
  const hint = user ? "1" : "0";
  if (request.cookies.get("bx_auth")?.value !== hint) {
    response.cookies.set("bx_auth", hint, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  if (user) {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    event.waitUntil(
      Promise.resolve(
        supabase
          .from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", user.id)
          .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`),
      ).catch(() => {}), // best-effort — a missed activity ping isn't worth failing over
    );
  }

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
