/**
 * The KiqStat Picks WhatsApp community invite link. Not set until the
 * community actually exists (created by hand in the WhatsApp app — there's
 * no API for that part) — every component that shows a "join" CTA reads
 * this and renders nothing at all when it's unset, same "runs with zero
 * config" posture as Supabase/Resend/Paystack elsewhere in this app.
 *
 * NEXT_PUBLIC_ because the join link itself isn't sensitive — it's meant
 * to be public, and this is read from client components (the popup) as
 * well as server ones.
 */
export const WHATSAPP_COMMUNITY_URL = process.env.NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL || null;
