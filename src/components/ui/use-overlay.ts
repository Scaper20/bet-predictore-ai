"use client";

import { useEffect, useRef } from "react";

/**
 * The four things every overlay owes a keyboard user.
 *
 * Extracted from record-detail-modal.tsx, which had all of this inline. The
 * mobile drawer needs exactly the same behaviour, and the second copy is where
 * these implementations start to drift — one of them keeps the Escape handler
 * and forgets to restore focus, and nobody notices because both still *look*
 * right with a mouse.
 *
 *   1. Body scroll lock, so the page behind does not move under the panel.
 *   2. Escape closes.
 *   3. Tab is trapped inside the panel, rather than walking into the page
 *      behind it — which is still there, still focusable, and now invisible.
 *   4. Focus returns to whatever opened the overlay, so a keyboard user is not
 *      dropped at the top of the document on close.
 *
 * Attach `containerRef` to the panel and `initialFocusRef` to whatever should
 * hold focus on open (usually the close button).
 */

/** Elements that can hold focus, for the tab trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlay<
  C extends HTMLElement = HTMLElement,
  F extends HTMLElement = HTMLElement,
>(open: boolean, onClose: () => void) {
  const containerRef = useRef<C>(null);
  const initialFocusRef = useRef<F>(null);
  /** Whatever had focus when the overlay opened, so it can be handed back. */
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Restore the previous value rather than clearing to "". Clearing assumes
    // nothing else had an opinion about body overflow, which stops being true
    // the moment a second overlay exists.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    initialFocusRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const nodes = containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return { containerRef, initialFocusRef };
}
