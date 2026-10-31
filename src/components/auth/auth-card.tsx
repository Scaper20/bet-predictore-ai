import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

/** The password-reset pages: the auth frame without the sign-up / sign-in switch. */
export function AuthCard({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <AuthShell title={title} smallTalk={intro}>
      {children}
    </AuthShell>
  );
}
