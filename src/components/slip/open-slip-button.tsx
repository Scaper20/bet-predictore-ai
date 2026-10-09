"use client";

import { Button } from "@/components/ui/primitives";
import { openSlipSheet } from "@/components/layout/nav-actions";

/** Opens the slip overlay, for server-rendered pages. */
export function OpenSlipButton({ className = "" }: { className?: string }) {
  return (
    <Button variant="secondary" onClick={openSlipSheet} className={className}>
      Your slip
    </Button>
  );
}
