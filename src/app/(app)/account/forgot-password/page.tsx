import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" intro="It happens. We'll email you a link.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
