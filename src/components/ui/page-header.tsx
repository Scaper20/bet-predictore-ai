import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";

/**
 * A page's title bar. On a phone it is the title alone, small and tight, so
 * the page's own content starts near the top; the eyebrow and the line under
 * the title show from the sm breakpoint up.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-shell">
      <Container className="py-4 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:items-end sm:gap-5">
          <div className="min-w-0 max-w-2xl">
            {eyebrow && (
              <p className="mb-2 hidden text-xs font-semibold uppercase tracking-[0.18em] text-brand sm:block">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {description && (
              <p className="mt-2 hidden truncate text-sm text-ink-muted sm:block">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </Container>
    </div>
  );
}
