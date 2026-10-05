import type { ReactNode } from "react";
import Link from "next/link";
import { containerClass } from "@/components/ui/container";
import { DocToc } from "./doc-toc";

export interface DocSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Long-form pages (how picks work, guides, help): a hero, a sticky contents
 * list that tracks the section being read, and sections that rise in as
 * they scroll into view (.scroll-reveal, CSS only).
 */
export function DocPage({
  eyebrow,
  title,
  intro,
  sections,
  aside,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: DocSection[];
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="bg-grid mask-fade-b pointer-events-none absolute inset-0 opacity-40" />
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <div className={`${containerClass()} relative py-10 sm:py-16`}>
          <p className="animate-rise mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
          <h1 className="animate-rise max-w-3xl font-display text-4xl font-bold leading-[1.05] sm:text-6xl" style={{ animationDelay: "80ms" }}>
            {title}
          </h1>
          <div className="animate-rise mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg" style={{ animationDelay: "160ms" }}>
            {intro}
          </div>
        </div>
      </header>

      <div className={`${containerClass()} py-8 sm:py-12`}>
        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_16rem]">
          <DocToc items={sections.map((s) => ({ id: s.id, title: s.title }))} />
          <div className="min-w-0 max-w-3xl space-y-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-reveal scroll-mt-[calc(var(--header-h)+1.5rem)]">
                <p className="mb-2 font-mono text-[11px] font-semibold text-ink-dim">{String(i + 1).padStart(2, "0")}</p>
                <h2 className="font-display text-2xl font-bold sm:text-3xl">{s.title}</h2>
                <div className="doc-body mt-4 space-y-4 text-[15px] leading-relaxed text-ink-muted">{s.body}</div>
              </section>
            ))}
            {footer}
          </div>
          {aside && <aside className="hidden xl:block"><div className="sticky top-[calc(var(--header-h)+1.5rem)] space-y-4">{aside}</div></aside>}
        </div>
      </div>
    </>
  );
}

/** A small call-out card for the aside or inline. */
export function DocCard({ title, children, href, cta }: { title: string; children: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">{children}</div>
      {href && cta && (
        <Link href={href} className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
          {cta} →
        </Link>
      )}
    </div>
  );
}

/** An example box: the worked numbers behind a rule. */
export function Example({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/[0.05] px-4 py-3.5 text-sm leading-relaxed text-ink">
      <span className="mr-2 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">Example</span>
      {children}
    </div>
  );
}
