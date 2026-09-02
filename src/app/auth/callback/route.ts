import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Where Supabase sends people back to after they click a link in an email.
 *
 * This route did not exist, which meant the app only worked because email
 * confirmation happens to be switched off in the Supabase dashboard: turning
 * it on would have sent every new user to a URL that 404s, with a confirmed
 * account and no way into the product. Adding it now costs nothing and
 * removes a setting that can silently break sign-up.
 *
 * It is also the piece OAuth would need, if a provider is ever added.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // `next` arrives from a link in an email, so it gets the same treatment as
  // the one on the sign-in form — see safe-redirect.ts.
  const next = safeNext(url.searchParams.get("next"), "/onboarding");

  if (!supabaseConfigured || !code) {
    return NextResponse.redirect(new URL("/account/login", url.origin));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A used or expired link is the common case here, and it is not worth an
    // error page — the login form can say what to do next.
    return NextResponse.redirect(new URL("/account/login?expired=1", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
