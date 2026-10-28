import Link from "next/link";

/** The one line under every auth card. */
export function ResponsibleNote() {
  return (
    <>
      18+ · Chances, not promises ·{" "}
      <Link href="/responsible-use" className="underline underline-offset-2 hover:text-ink">
        Play responsibly
      </Link>
    </>
  );
}
