import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SlipView } from "@/components/match/slip-view";
import { DownloadSlipImage } from "@/components/slip/download-slip-image";
import { BookingCode } from "@/components/slip/booking-code";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
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
        description="Combine selections and see what the accumulator is really worth. Your slip is stored on this device only — it's only sent anywhere if you fetch live prices or a booking code."
      />
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <SlipView />
        <div className="mt-5 space-y-5">
          <BookingCode />
          <DownloadSlipImage />
        </div>
      </div>
    </>
  );
}
