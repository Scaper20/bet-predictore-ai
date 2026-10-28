import { checkPermission } from "@/lib/admin";
import { previewCampaignEmail } from "@/lib/outreach-feed";
import type { CampaignType } from "@/lib/outreach";

export const dynamic = "force-dynamic";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * /admin/outreach/preview?campaign=vip_chat_launch&tier=pro: an email as a
 * recipient would get it, with its subject above. Nothing is queued or sent.
 */
export async function GET(request: Request) {
  const gate = await checkPermission("outreach.manage");
  if (!gate.ok) return new Response(gate.error, { status: gate.status });

  const url = new URL(request.url);
  const campaign = url.searchParams.get("campaign") as CampaignType | null;
  const email = campaign ? await previewCampaignEmail(campaign, url.searchParams.get("tier")).catch(() => null) : null;
  if (!email) return new Response("No preview for this campaign.", { status: 404 });

  const banner = `<div style="font:14px system-ui,sans-serif;background:#111;color:#eee;padding:12px 16px;">
    <strong>Preview, not sent.</strong> Subject: ${escape(email.subject)}</div>`;
  return new Response(banner + email.html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
