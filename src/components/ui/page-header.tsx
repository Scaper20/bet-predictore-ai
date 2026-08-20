import type { ReactNode } from "react";

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
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            {eyebrow && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
            {description && (
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
