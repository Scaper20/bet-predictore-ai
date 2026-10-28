/**
 * KiqStat's own accounts and rooms, in one place: the footer links them, the
 * structured data names the profiles (sameAs) so search engines tie them to
 * the site, and the WhatsApp community link defaults to the room here.
 */
export interface Social {
  id: "x" | "instagram" | "linkedin" | "telegram" | "whatsapp";
  label: string;
  href: string;
  /** A profile (named in structured data), not an invite link. */
  profile: boolean;
}

export const SOCIALS: readonly Social[] = [
  { id: "x", label: "X (@kiqstat)", href: "https://x.com/kiqstat", profile: true },
  { id: "instagram", label: "Instagram (@kiqstat)", href: "https://www.instagram.com/kiqstat", profile: true },
  { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/company/kiqstat", profile: true },
  { id: "telegram", label: "Telegram channel", href: "https://t.me/+KqDctr5IoMwzM2Rk", profile: false },
  { id: "whatsapp", label: "WhatsApp community", href: "https://chat.whatsapp.com/Bna3Th433DWAGo0VdVS5aa", profile: false },
];

export const X_HANDLE = "@kiqstat";

export const socialHref = (id: Social["id"]) => SOCIALS.find((s) => s.id === id)!.href;
