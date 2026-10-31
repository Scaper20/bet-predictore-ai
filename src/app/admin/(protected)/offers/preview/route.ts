import { checkPermission } from "@/lib/admin";
import { previewCampaignEmail } from "@/lib/outreach-feed";
import { offerCampaign } from "@/lib/offers";

export const dynamic = "force-dynamic";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** /admin/offers/preview?slug=…: an email offer as a free member would get it. Nothing is queued or sent. */
export async function GET(request: Request) {
  const gate = await checkPermission("offers.manage");
  if (!gate.ok) return new Response(gate.error, { status: gate.status });

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const email = /^[a-z0-9-]{2,40}$/.test(slug) ? await previewCampaignEmail(offerCampaign(slug), "free").catch(() => null) : null;
  if (!email) return new Response("No preview for this offer.", { status: 404 });

  const banner = `<div style="font:14px system-ui,sans-serif;background:#111;color:#eee;padding:12px 16px;">
    <strong>Preview, not sent.</strong> Subject: ${escape(email.subject)}</div>`;
  return new Response(banner + email.html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
