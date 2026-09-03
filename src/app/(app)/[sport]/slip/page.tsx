import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SlipView } from "@/components/match/slip-view";
import { DownloadSlipImage } from "@/components/slip/download-slip-image";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Selection Builder",
  description:
    "Combine your selections and see their true combined probability, fair price and expected " +
    "return against the prices you've actually been offered.",
};

export default function SlipPage() {
  return (
    <>
      <PageHeader
        eyebrow="Selections"
        title="Selection builder"
        description="Combine selections and see what the accumulator is really worth. Your slip is stored on this device only — nothing is sent anywhere."
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <SlipView />
        <div className="mt-5">
          <DownloadSlipImage />
        </div>
      </div>
    </>
  );
}
