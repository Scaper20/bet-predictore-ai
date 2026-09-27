import type { Metadata } from "next";
import { ConfirmUnsubscribeForm } from "@/components/unsubscribe/confirm-unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/**
 * A confirm-click page, not a bare unsubscribing GET — see
 * src/app/actions/unsubscribe.ts. The recipientId itself isn't validated
 * here (a made-up one just fails harmlessly inside the action); this page
 * has nothing to look up before showing the confirm button.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;

  return (
    <div className="mx-auto max-w-sm px-4 py-10 sm:py-16 sm:px-6">
      <div className="mb-8 text-center">
        <span className="font-display text-lg font-bold tracking-tight">
          Betri<span className="text-brand">X</span>
        </span>
      </div>
      <ConfirmUnsubscribeForm recipientId={recipientId} />
    </div>
  );
}
