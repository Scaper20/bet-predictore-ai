import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { TrackedSlipsView } from "@/components/slip/tracked-slips-view";
import { containerClass } from "@/components/ui/container";

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
        description="Your slips, followed leg by leg."
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <TrackedSlipsView />
      </div>
    </>
  );
}
