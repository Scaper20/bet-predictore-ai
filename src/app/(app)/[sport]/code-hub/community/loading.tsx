import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/** The tabs and one card while the page resolves. */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Code Hub" title="Community codes" />
      <Container className="space-y-6 py-4 sm:space-y-8 sm:py-10" aria-hidden>
        <Skeleton className="h-8 w-72 max-w-full rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Container>
    </>
  );
}
