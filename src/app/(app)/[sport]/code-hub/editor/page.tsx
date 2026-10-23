import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { CodeEditor } from "@/components/code-hub/code-editor";
import { HubTabs } from "@/components/code-hub/hub-tabs";
import { WaitlistWall } from "@/components/code-hub/waitlist-wall";
import { hubGate, onWaitlist } from "@/lib/code-hub-gate";

export const metadata: Metadata = {
  alternates: { canonical: "/football/code-hub/editor" },
  title: "Code editor: check any booking code",
  description: "Paste a booking code to see the model's chance for every pick, then make it safer or re-pick it to the odds you want.",
};

export const dynamic = "force-dynamic";

export default async function CodeEditorPage() {
  const { entitlement, preview, allowed } = await hubGate();
  return (
    <>
      <PageHeader eyebrow="Code Hub" title="Code editor" description="Check any code, make it safer, or hit the odds you want." />
      <Container className="space-y-6 py-4 sm:space-y-8 sm:py-10">
        {allowed ? (
          <>
            <HubTabs active="codeEditor" />
            <CodeEditor signedIn={entitlement.signedIn || preview} />
          </>
        ) : (
          <WaitlistWall email={entitlement.email} joined={await onWaitlist(entitlement.userId)} />
        )}
      </Container>
    </>
  );
}
