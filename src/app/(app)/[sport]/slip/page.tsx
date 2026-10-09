import { redirect } from "next/navigation";
import { sportPath } from "@/lib/routes";
import type { SportId } from "@/lib/sports";

/**
 * The selection builder is an overlay now (components/slip/slip-sheet.tsx),
 * opened from the floating slip button on any page. Old links and the app
 * shortcut land on My slips with the overlay open.
 */
export default async function SlipPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  redirect(`${sportPath("trackedSlips", sport as SportId)}#slip`);
}
