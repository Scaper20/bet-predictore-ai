import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SlipView } from "@/components/match/slip-view";
import { QuickSlip } from "@/components/slip/quick-slip";

export const metadata: Metadata = {
  title: "Bet Slip Builder",
  description:
    "Build an accumulator and see its true combined probability, fair price and expected return " +
    "against the odds your bookmaker is actually offering.",
};

export default function SlipPage() {
  return (
    <>
      <PageHeader
        eyebrow="Bet slip"
        title="Slip builder"
        description="Combine selections and see what the accumulator is really worth. Your slip is stored on this device only — nothing is sent anywhere."
      />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SlipView />
        <div className="mt-5">
          <QuickSlip />
        </div>
      </div>
    </>
  );
}
