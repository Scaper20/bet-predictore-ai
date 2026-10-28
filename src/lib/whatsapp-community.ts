import { socialHref } from "@/lib/socials";

/**
 * The KiqStat Picks WhatsApp community invite link, from lib/socials.ts so
 * the footer and every "join" CTA share one link. (It used to come from
 * NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL, which is no longer read.)
 *
 * NEXT_PUBLIC_ because the join link itself isn't sensitive — it's meant
 * to be public, and this is read from client components (the popup) as
 * well as server ones.
 */
export const WHATSAPP_COMMUNITY_URL: string | null = socialHref("whatsapp");
