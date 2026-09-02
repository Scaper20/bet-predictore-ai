import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";
import { signOut } from "@/app/actions/auth";
import { signOutAllDevices } from "@/app/actions/account";
import { Badge, ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { ProfileForm } from "@/components/account/profile-form";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";

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

  const [entitlement, subscription, profileResult] = await Promise.all([
    getEntitlement(),
    getSubscriptionRow(supabase, user.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  const displayName = profileResult.data?.display_name ?? "";
  const hasActiveSubscription = hasLivePaidSubscription(subscription);

  return (
    <div className="mx-auto max-w-lg space-y-12 px-4 py-16 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Account</h1>

        <div className="card mt-6 p-7">
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
      </div>

      <section>
        <SectionHeading eyebrow="Profile" title="Your details" />
        <div className="card mt-4 p-7">
          <ProfileForm initialDisplayName={displayName} />
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="Security" title="Login & security" />
        <div className="card mt-4 divide-y divide-line p-7">
          <div className="pb-6">
            <h3 className="mb-4 text-sm font-semibold">Change email</h3>
            <ChangeEmailForm currentEmail={user.email ?? ""} />
          </div>
          <div className="py-6">
            <h3 className="mb-4 text-sm font-semibold">Change password</h3>
            <ChangePasswordForm />
          </div>
          <div className="pt-6">
            <h3 className="mb-1 text-sm font-semibold">Sessions</h3>
            <p className="mb-4 text-xs text-ink-dim">Sign out of this device, or everywhere you&apos;re signed in.</p>
            <div className="flex flex-wrap gap-3">
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Sign out
                </button>
              </form>
              <form action={signOutAllDevices}>
                <button
                  type="submit"
                  className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Sign out everywhere
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="Danger zone" title="Delete account" />
        <div className="card mt-4 border-rose/25 p-7">
          <DeleteAccountForm hasActiveSubscription={hasActiveSubscription} />
        </div>
      </section>
    </div>
  );
}
