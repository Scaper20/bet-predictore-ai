import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SlipView } from "@/components/match/slip-view";
import { ForgeLink, MySlipsLink, TrackSlipButton } from "@/components/slip/track-slip";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/slip" },
  title: "Selection Builder",
  description:
    "Combine your selections and see their true combined probability, with SportyBet's " +
    "current prices where it lists them.",
};

export default function SlipPage() {
  return (
    <>
      <PageHeader
        eyebrow="Selections"
        title="Selection builder"
        description="Build an accumulator and see its real chance."
        actions={
          <>
            <ForgeLink />
            <MySlipsLink />
          </>
        }
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <SlipView />
        <div className="mt-5">
          <TrackSlipButton />
        </div>
      </div>
    </>
  );
}
