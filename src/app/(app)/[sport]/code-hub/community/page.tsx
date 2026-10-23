import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { CommunityCodes } from "@/components/code-hub/community-codes";
import { HubTabs } from "@/components/code-hub/hub-tabs";
import { WaitlistWall } from "@/components/code-hub/waitlist-wall";
import { hubGate, onWaitlist } from "@/lib/code-hub-gate";
import { communityPosts, postForViewer } from "@/lib/code-hub-posts";
import { viewerForTier } from "@/lib/viewer";

export const metadata: Metadata = {
  alternates: { canonical: "/football/code-hub/community" },
  title: "Community codes, ranked by the model",
  description: "Booking codes posted by members, each read game by game and ranked by the model's chance and the price.",
};

export const dynamic = "force-dynamic";

export default async function CodeCommunityPage() {
  const { entitlement, allowed } = await hubGate();
  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Code Hub" title="Community codes" />
        <Container className="py-4 sm:py-10">
          <WaitlistWall email={entitlement.email} joined={await onWaitlist(entitlement.userId)} />
        </Container>
      </>
    );
  }
  const [community, viewer] = await Promise.all([communityPosts(), viewerForTier(entitlement.tier)]);
  const shown = (posts: typeof community.open) => posts.map((p) => postForViewer(p, viewer));
  return (
    <>
      <PageHeader eyebrow="Code Hub" title="Community codes" description="Codes from members, ranked by the model." />
      <Container className="space-y-6 py-4 sm:space-y-8 sm:py-10">
        <HubTabs active="codeCommunity" />
        <CommunityCodes initial={shown(community.open)} recent={shown(community.recent)} signedIn={entitlement.signedIn} />
      </Container>
    </>
  );
}
