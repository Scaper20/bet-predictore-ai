"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** Copies `text` to the clipboard on click, with a 2s "Copied" confirmation
 * — the whole reason /admin/whatsapp-digest exists is "select this exact
 * text and paste it into WhatsApp," so the button doing that itself in one
 * tap beats a select-all-then-copy every time. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — the text is still
      // right there on the page to select by hand.
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleClick} className="px-4 py-2 text-xs">
      {copied ? "Copied ✓" : label}
    </Button>
  );
}
