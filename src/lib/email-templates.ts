import "server-only";

import { emailLayout } from "@/lib/email";
import { naira } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import { sportPath } from "@/lib/routes";
import { TIER_LABEL } from "@/lib/outreach";
import type { Tier } from "@/lib/entitlements";

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;"><a href="${href}" style="display:inline-block;background:#00c97a;color:#05080d;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;">${label}</a></p>`;
}

/** Only on the one-off outreach campaigns below — transactional email
 * (receipts, replies, cancellations) isn't marketing and doesn't carry
 * this. See supabase/migrations/0020_email_campaigns.sql. */
function unsubscribeFooter(url: string): string {
  return `<p style="margin:28px 0 0;font-size:12px;color:#8d9db2;">Sent to you personally by the BetriX team, not an automated blast.
  If you'd rather not get these, <a href="${url}" style="color:#8d9db2;">unsubscribe here</a> — this never affects your account or billing emails.</p>`;
}

export function welcomeEmail(): { subject: string; html: string } {
  return {
    subject: "Welcome to BetriX",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Welcome to BetriX</p>
      <p style="margin:0;">Your account is set up. BetriX gives you data-driven football predictions from a
      statistical model fitted on real results — real fixtures, real live scores, no guesswork.</p>
      ${button(SITE_URL, "See today's matches")}
      <p style="margin:24px 0 0;font-size:13px;color:#8d9db2;">Want to see how it has actually done? Every
      published pick is settled and kept on the
      <a href="${SITE_URL}${sportPath("trackRecord")}" style="color:#00925c;">track record</a>.</p>
    `),
  };
}

export function receiptEmail(opts: {
  tier?: Tier;
  amountKobo: number;
  reference: string;
  date: string;
}): { subject: string; html: string } {
  const label = opts.tier ? TIER_LABEL[opts.tier] : undefined;
  const amount = naira(opts.amountKobo / 100);
  const when = new Date(opts.date).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });

  return {
    subject: label ? `Receipt: ${label} payment` : "Receipt: BetriX payment",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Payment received</p>
      <p style="margin:0 0 20px;">${
        label ? `Thanks for subscribing to ${label}.` : "Thanks for your payment."
      } Here's your receipt.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:6px 0;color:#8d9db2;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700;">${amount}</td></tr>
        ${label ? `<tr><td style="padding:6px 0;color:#8d9db2;">Plan</td><td style="padding:6px 0;text-align:right;">${label}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#8d9db2;">Date</td><td style="padding:6px 0;text-align:right;">${when}</td></tr>
        <tr><td style="padding:6px 0;color:#8d9db2;">Reference</td><td style="padding:6px 0;text-align:right;">${opts.reference}</td></tr>
      </table>
      ${button(`${SITE_URL}/account/billing`, "View billing")}
    `),
  };
}

/** HTML-escapes a value pulled from user input before it's interpolated
 * into an email body — ticket subjects and messages aren't otherwise
 * sanitized, so this is the one place they meet raw HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function whatsappDigestReadyEmail(opts: { hasPicks: boolean; messageCount: number }): {
  subject: string;
  html: string;
} {
  return {
    subject: opts.hasPicks ? "Today's WhatsApp digest is ready" : "No pick today — WhatsApp digest ready",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">${opts.hasPicks ? "Today's digest is ready" : "No pick today"}</p>
      <p style="margin:0;">${
        opts.hasPicks
          ? `${opts.messageCount} message${opts.messageCount === 1 ? "" : "s"} ready to paste into the WhatsApp community.`
          : "Nothing cleared the sample-size bar today — a single no-pick message is ready to paste, if you want to send it."
      }</p>
      ${button(`${SITE_URL}/admin/whatsapp-digest`, "Open in admin dashboard")}
    `),
  };
}

export function giftSubscriptionEmail(opts: {
  tier: Extract<Tier, "pro" | "vip">;
  months: number;
  expiresAt: string;
  note: string | null;
}): { subject: string; html: string } {
  const label = TIER_LABEL[opts.tier];
  const until = new Date(opts.expiresAt).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
  const duration = opts.months === 1 ? "one month" : `${opts.months} months`;

  return {
    subject: `You've been gifted ${duration} of BetriX ${label}`,
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">🎁 You just got ${label}, on the house</p>
      <p style="margin:0;">BetriX gifted you ${duration} of ${label} — free, no card required. It's active now
      and runs through ${until}.</p>
      ${
        opts.note
          ? `<p style="margin:20px 0 0;padding:12px 16px;background:#f6f8fb;border-radius:8px;font-size:14px;color:#1c2430;font-style:italic;">"${escapeHtml(opts.note)}"</p>`
          : ""
      }
      ${button(SITE_URL, "See what's unlocked")}
      <p style="margin:24px 0 0;font-size:13px;color:#8d9db2;">Nothing to cancel — this isn't a subscription, it
      just quietly ends on ${until} unless you decide to subscribe for real.</p>
    `),
  };
}

export function newTicketNotificationEmail(opts: {
  subject: string;
  fromEmail: string;
  preview: string;
  ticketId: string;
}): { subject: string; html: string } {
  return {
    subject: `New ticket: ${opts.subject}`,
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">New support ticket</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${escapeHtml(opts.fromEmail)}</p>
      <p style="margin:0 0 20px;"><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
      <p style="margin:0 0 20px;padding:12px 16px;background:#f6f8fb;border-radius:8px;font-size:14px;color:#1c2430;">${escapeHtml(opts.preview)}</p>
      ${button(`${SITE_URL}/admin/tickets/${opts.ticketId}`, "Reply in the admin dashboard")}
    `),
  };
}

export function ticketReplyNotificationEmail(opts: { subject: string }): { subject: string; html: string } {
  return {
    subject: "An admin replied to your support request",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">You have a reply</p>
      <p style="margin:0;">An admin replied to your support request, "${opts.subject}".</p>
      ${button(SITE_URL, "Open BetriX")}
      <p style="margin:24px 0 0;font-size:13px;color:#8d9db2;">Reply from the chat icon in the bottom corner of the site.</p>
    `),
  };
}

export function subscriptionCanceledEmail(opts: {
  tier?: Tier;
  accessUntil?: string | null;
}): { subject: string; html: string } {
  const label = opts.tier ? TIER_LABEL[opts.tier] : "subscription";
  const until = opts.accessUntil
    ? new Date(opts.accessUntil).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return {
    subject: "Your BetriX subscription was canceled",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Subscription canceled</p>
      <p style="margin:0;">Your ${label} subscription has been canceled. ${
        until ? `You'll keep access until ${until}.` : "You'll keep access until the end of your current billing period."
      }</p>
      ${button(`${SITE_URL}/account/billing`, "Resubscribe")}
    `),
  };
}

/* --------------------------------------------------------- Outreach campaign */

export function warmCheckInEmail(opts: { unsubscribeUrl: string }): { subject: string; html: string } {
  return {
    subject: "A quick note from Scaper",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here, I built BetriX.</p>
      <p style="margin:0 0 16px;">No ask in this one, I just wanted to check in. I look at every ticket and every
      piece of feedback that comes through myself, but I don't always get to hear from people who are quietly
      using the site without ever needing to reach out — which is most of you.</p>
      <p style="margin:0 0 16px;">So: how's it been? If something's confusing, missing, or just annoying, hit
      reply — this inbox reaches me directly, not a queue.</p>
      <p style="margin:0;">Thanks for being here.<br />— Scaper, Founder &amp; CEO, BetriX</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function subscriberSurveyEmail(opts: {
  tier: Extract<Tier, "pass" | "pro" | "vip">;
  surveyUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const label = TIER_LABEL[opts.tier];
  return {
    subject: "2 minutes? I'd love your take on BetriX",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here, founder of BetriX.</p>
      <p style="margin:0 0 16px;">We're excited to see you subscribed to the <strong>${label}</strong> plan — genuinely,
      thank you. Paying for something means you expect it to be worth it, and I want to make sure it actually is.</p>
      <p style="margin:0 0 16px;">I put together a short survey — 6 questions, under 3 minutes, no account needed.
      Your answers go straight to me and shape what gets built next, not a marketing team.</p>
      ${button(opts.surveyUrl, "Take the 3-minute survey")}
      <p style="margin:24px 0 0;">Thanks for trusting us with your subscription.<br />— Scaper, Founder &amp; CEO, BetriX</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function freeSurveyEmail(opts: { surveyUrl: string; unsubscribeUrl: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "2 minutes? I'd love your take on BetriX",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here, founder of BetriX.</p>
      <p style="margin:0 0 16px;">You've been using BetriX on the free plan, and I'd genuinely like to know how
      it's going — what's working, what isn't, and what (if anything) would make the paid side worth it to you.</p>
      <p style="margin:0 0 16px;">I put together a short survey — 6 questions, under 3 minutes, no account needed.
      Your answers go straight to me, not a marketing team, and directly shape what we build next.</p>
      ${button(opts.surveyUrl, "Take the 3-minute survey")}
      <p style="margin:24px 0 0;">Thanks for giving BetriX a shot.<br />— Scaper, Founder &amp; CEO, BetriX</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function whatsappCommunityAnnouncementEmail(opts: { communityUrl: string; unsubscribeUrl: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "New: BetriX picks on WhatsApp",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here.</p>
      <p style="margin:0 0 16px;">Quick one: we just launched a BetriX WhatsApp community. Once a day, before
      kickoff, everyone in it gets that day's value picks — individual picks plus safe/balanced/risky
      accumulator combos — in one message. Only picks that clear our sample-size bar, same standard as the
      site.</p>
      <p style="margin:0 0 16px;">Free, no spam, leave anytime.</p>
      ${button(opts.communityUrl, "Join the WhatsApp community")}
      <p style="margin:24px 0 0;">— Scaper, Founder &amp; CEO, BetriX</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}
