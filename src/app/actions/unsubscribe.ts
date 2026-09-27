"use server";

import { unsubscribeRecipient } from "@/lib/outreach-feed";

export type UnsubscribeActionState = { error: string | null; done: boolean };

/** Public, POST-only (never a bare GET) — reached by a link-click
 * confirmation, not automatically, so an email client or security scanner
 * prefetching the link can't silently unsubscribe someone. */
export async function confirmUnsubscribe(_prev: UnsubscribeActionState, formData: FormData): Promise<UnsubscribeActionState> {
  const recipientId = String(formData.get("recipientId") ?? "");
  if (!recipientId) return { error: "Missing unsubscribe link.", done: false };

  const { error } = await unsubscribeRecipient(recipientId);
  if (error) return { error, done: false };
  return { error: null, done: true };
}
