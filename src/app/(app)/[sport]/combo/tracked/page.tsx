import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { TrackedSlipsView } from "@/components/slip/tracked-slips-view";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/combo/tracked" },
  title: "My Combos",
  description: "Follow every combo you've tracked, pick by pick, from kickoff to the final whistle.",
  robots: { index: false, follow: true },
};

export default function TrackedSlipsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Selections"
        title="My combos"
        description="Your combos, followed pick by pick."
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <TrackedSlipsView />
      </div>
    </>
  );
}
