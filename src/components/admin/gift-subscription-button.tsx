"use client";

import { useActionState, useState } from "react";
import { grantGift, type GiftActionState } from "@/app/actions/admin/gifts";
import { Button, Field, Select } from "@/components/ui/primitives";
import { useOverlay } from "@/components/ui/use-overlay";

const initialState: GiftActionState = { error: null, message: null };

/** Per-row action on /admin/users — opens a small dialog to grant a
 * temporary Pro/VIP boost (subscription_gifts, not a real Paystack
 * subscription) to this one account. Stays open after a successful grant
 * so the confirmation message is visible; the admin closes it manually. */
export function GiftSubscriptionButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [state, formAction, pending] = useActionState(grantGift, initialState);
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLSelectElement>(open, close);

  const titleId = `gift-dialog-title-${userId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
      >
        🎁 Gift
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-canvas/70 p-4 backdrop-blur-sm">
          <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="card w-full max-w-sm p-5 sm:p-6">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-sm font-semibold text-ink">
                Gift a subscription
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="text-ink-dim transition-colors hover:text-ink">
                ✕
              </button>
            </div>
            <p className="mb-4 truncate text-xs text-ink-muted">{userEmail}</p>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="userEmail" value={userEmail} />

              <Field label="Plan" htmlFor={`gift-tier-${userId}`}>
                <Select id={`gift-tier-${userId}`} name="tier" defaultValue="vip" ref={initialFocusRef}>
                  <option value="pro">Pro</option>
                  <option value="vip">VIP</option>
                </Select>
              </Field>

              <Field label="Duration" htmlFor={`gift-months-${userId}`}>
                <Select id={`gift-months-${userId}`} name="months" defaultValue="1">
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </Select>
              </Field>

              <Field label="Note (optional)" htmlFor={`gift-note-${userId}`} hint="Shown in the email they get.">
                <textarea
                  id={`gift-note-${userId}`}
                  name="note"
                  rows={2}
                  maxLength={200}
                  placeholder="Enjoy VIP for a month, on us!"
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
                />
              </Field>

              {state.error && <p className="text-xs text-rose">{state.error}</p>}
              {state.message && <p className="text-xs text-brand">{state.message}</p>}

              <Button type="submit" variant="primary" disabled={pending} className="w-full">
                {pending ? "Sending…" : "Send gift"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
