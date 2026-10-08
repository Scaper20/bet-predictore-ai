/**
 * How long after one reset email before the same address can be sent
 * another. Without it, the forgot-password form is a free way to flood
 * any registered user's inbox. Five minutes caps that at twelve an hour,
 * while someone who genuinely lost the first email isn't stuck for long.
 */
export const RESET_COOLDOWN_MS = 5 * 60_000;

/** True while the address is still inside the cooldown from its last reset
 * email. `lastSentAt` is Supabase's `recovery_sent_at`, which generateLink()
 * stamps every time it issues a recovery link. */
export function resetCoolingDown(lastSentAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSentAt) return false;
  const sent = Date.parse(lastSentAt);
  if (Number.isNaN(sent)) return false;
  return now - sent < RESET_COOLDOWN_MS;
}

/** A recovery token as it arrives in the reset link: the hex SHA-224 hash
 * Supabase returns as `hashed_token`. Anything else is not worth a round trip
 * to the auth server. */
export function plausibleResetToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40,128}$/i.test(value);
}
