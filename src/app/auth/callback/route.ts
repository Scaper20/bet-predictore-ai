import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { PARTNER_REF_COOKIE } from "@/lib/partner-ref";
import { recordSignupSource } from "@/lib/signup-source";
import { FIRST_TOUCH_COOKIE } from "@/lib/first-touch";

/**
 * Where Supabase sends people back to after they click a link in an email,
 * or — now that social-auth-buttons.tsx calls signInWithOAuth() — after an
 * OAuth provider (Google/Apple/X) round trip. Supabase doesn't distinguish
 * "sign up" from "sign in" for OAuth: this fires either way, and creates the
 * account via the handle_new_user trigger the first time a given email is
 * seen, exactly like the email/password path.
 *
 * This route did not exist, which meant the app only worked because email
 * confirmation happens to be switched off in the Supabase dashboard: turning
 * it on would have sent every new user to a URL that 404s, with a confirmed
 * account and no way into the product. Adding it now costs nothing and
 * removes a setting that can silently break sign-up.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // `next` arrives from a link in an email or an OAuth redirect, so it gets
  // the same treatment as the one on the sign-in form — see safe-redirect.ts.
  const requestedNext = safeNext(url.searchParams.get("next"), "/account");

  if (!supabaseConfigured || !code) {
    return NextResponse.redirect(new URL("/account/login", url.origin));
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A used or expired link is the common case here, and it is not worth an
    // error page — the login form can say what to do next.
    return NextResponse.redirect(new URL("/account/login?expired=1", url.origin));
  }

  // Same "send a first-time arrival through onboarding" rule signIn() applies
  // (src/app/actions/auth.ts) — OAuth has no separate signup step to carry
  // that logic, so it has to live here instead, checked on every arrival.
  if (data.user) {
    const prefs = await getPreferencesFor(supabase, data.user.id);
    if (!hasOnboarded(prefs)) {
      // Where this user came from, same as signUp() (lib/signup-source.ts).
      await recordSignupSource(data.user.id, {
        firstTouch: request.cookies.get(FIRST_TOUCH_COOKIE)?.value,
        partnerRef: request.cookies.get(PARTNER_REF_COOKIE)?.value,
      });

      return NextResponse.redirect(new URL(`/onboarding?next=${encodeURIComponent(requestedNext)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL(requestedNext, url.origin));
}
