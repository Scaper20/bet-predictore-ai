import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAdminGate } from "@/lib/admin";
import { signOut } from "@/app/actions/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  const gate = await getAdminGate();

  if (gate.ok) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Admin sign in</h1>

      {gate.reason === "forbidden" ? (
        <div className="card mt-6 p-6">
          <p className="text-sm text-ink-muted">
            You&apos;re signed in, but that account doesn&apos;t have admin dashboard access.
          </p>
          <form action={signOut} className="mt-4">
            <button
              type="submit"
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Sign out and try a different account
            </button>
          </form>
        </div>
      ) : (
        <div className="card mt-6 p-6">
          <Suspense>
            <LoginForm defaultNext="/admin" showSignUpLink={false} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
