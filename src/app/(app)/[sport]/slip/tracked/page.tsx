import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { TrackedSlipsView } from "@/components/slip/tracked-slips-view";
import { ButtonLink } from "@/components/ui/primitives";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  alternates: { canonical: "/football/slip/tracked" },
  title: "My Slips",
  description: "Follow every slip you've tracked, leg by leg, from kickoff to the final whistle.",
  robots: { index: false, follow: true },
};

export default function TrackedSlipsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Selections"
        title="My slips"
        description="Every slip you've tracked, followed leg by leg from kickoff to the final whistle. Saved on this device only."
        actions={
          <ButtonLink href={sportPath("slip")} variant="secondary" className="px-4 py-2 text-xs">
            Selection builder
          </ButtonLink>
        }
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <TrackedSlipsView />
      </div>
    </>
  );
}
