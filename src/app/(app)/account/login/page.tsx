import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-ink-muted">
        For your saved preferences and paid plan. Live scores, fixtures and predictions never require an account.
      </p>
      <div className="card mt-6 p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
