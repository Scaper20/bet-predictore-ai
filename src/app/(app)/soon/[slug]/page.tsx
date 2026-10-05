import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SOON } from "@/lib/nav";
import { containerClass } from "@/components/ui/container";
import { NotifyButton } from "@/components/layout/notify-button";

/**
 * Where every announced-but-unbuilt feature in the nav leads. One page,
 * driven by SOON in lib/nav.ts; when a feature ships its nav items point at
 * the real route and its entry here is deleted.
 */
export function generateStaticParams() {
  return Object.keys(SOON).map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = SOON[slug];
  return {
    title: f ? `${f.title} — coming soon` : "Coming soon",
    description: f?.blurb,
    robots: { index: false, follow: true },
  };
}

export default async function SoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = SOON[slug];
  if (!f) notFound();

  return (
    <div className={`${containerClass("narrow")} py-12 sm:py-20`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-amber/35 bg-amber/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber">
        <span className="size-1.5 rounded-full bg-amber" aria-hidden />
        Coming soon
      </span>
      <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">{f.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-muted">{f.blurb}</p>

      <ul className="mt-8 space-y-3">
        {f.points.map((point) => (
          <li key={point} className="flex gap-3 text-[15px] leading-relaxed text-ink">
            <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-brand" aria-hidden>
              <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {point}
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink">Be first to know</p>
        <p className="mt-1 text-sm text-ink-muted">We&apos;ll send a notification the day it goes live.</p>
        <NotifyButton className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-strong" />
      </div>

      <div className="mt-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-dim">Meanwhile</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {f.meanwhile.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              {m.label} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
