import Link from "next/link";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <p className="font-display text-6xl font-extrabold text-brand/25">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold">This page does not exist</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          The fixture may have finished and rolled out of the feed, or the link may be wrong.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/predictions">Today&apos;s predictions</ButtonLink>
          <ButtonLink href="/live" variant="secondary">Live scores</ButtonLink>
        </div>
        <Link href="/" className="mt-6 text-xs text-ink-dim underline underline-offset-4 hover:text-ink">
          Back to home
        </Link>
      </div>
    </div>
  );
}
