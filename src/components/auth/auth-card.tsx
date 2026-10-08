import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";

/** The single centred card the password-reset pages sit in. */
export function AuthCard({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <Container width="shell" className="py-8 sm:py-12 md:py-20">
      <div className="card glow-brand relative mx-auto max-w-md overflow-hidden p-8 sm:p-10">
        <div className="mb-6 border-b border-line pb-6">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-xs text-ink-muted">{intro}</p>
        </div>
        {children}
      </div>
    </Container>
  );
}
