import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SlipView } from "@/components/match/slip-view";
import { DownloadSlipImage } from "@/components/slip/download-slip-image";
import { ForgeLink, MySlipsLink, TrackSlipButton } from "@/components/slip/track-slip";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/slip" },
  title: "Selection Builder",
  description:
    "Combine your selections and see their true combined probability, the price each leg has " +
    "to beat, and the expected return against the prices you've actually been offered.",
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
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <TrackSlipButton />
          <DownloadSlipImage />
        </div>
      </div>
    </>
  );
}
