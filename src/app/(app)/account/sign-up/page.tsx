import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Free, and not required for the core site — this just unlocks saved preferences and paid plans.
      </p>
      <div className="card mt-6 p-6">
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}
