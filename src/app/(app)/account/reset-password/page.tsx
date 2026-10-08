import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ExpiredLink, ResetPasswordForm } from "@/components/auth/reset-password-form";
import { plausibleResetToken } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The one-time token is in this page's URL; never hand it to another site.
  // Not "no-referrer": that also blanks the Origin header on the form's own
  // POST, and Next rejects a Server Action whose Origin doesn't match.
  referrer: "same-origin",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const token = (await searchParams)?.token;
  return (
    <AuthCard title="Choose a new password" intro="Pick something you haven't used here before. At least 8 characters.">
      {plausibleResetToken(token) ? <ResetPasswordForm token={token} /> : <ExpiredLink />}
    </AuthCard>
  );
}
