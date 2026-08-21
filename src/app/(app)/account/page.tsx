import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { signOut } from "@/app/actions/auth";
import { Badge, ButtonLink } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Account" };

const TIER_LABEL = { free: "Free", pass: "Weekend Pass", pro: "Pro", vip: "VIP" } as const;

export default async function AccountPage() {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="font-display text-2xl font-bold">Accounts aren&apos;t set up yet</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This deployment hasn&apos;t configured Supabase. Live scores, fixtures and predictions all work without it.
        </p>
      </div>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login?next=/account");

  const entitlement = await getEntitlement();

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Account</h1>

      <div className="card mt-6 p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Signed in as</p>
        <p className="mt-1 text-sm font-semibold">{user.email}</p>

        <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plan</p>
            <Badge tone={entitlement.tier === "free" ? "neutral" : "brand"} className="mt-1.5">
              {TIER_LABEL[entitlement.tier]}
            </Badge>
          </div>
          <ButtonLink href="/account/billing" variant="secondary">
            {entitlement.tier === "free" ? "Upgrade" : "Manage plan"}
          </ButtonLink>
        </div>
      </div>

      <form action={signOut} className="mt-4">
        <button type="submit" className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
          Sign out
        </button>
      </form>
    </div>
  );
}
