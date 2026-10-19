import "server-only";

import { emailLayout } from "@/lib/email";
import { naira } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import { sportPath } from "@/lib/routes";
import { TIER_LABEL } from "@/lib/outreach";
import type { Tier } from "@/lib/entitlements";

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;"><a href="${href}" style="display:inline-block;background:#d4ff3a;color:#07090b;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;">${label}</a></p>`;
}

/** Only on the one-off outreach campaigns below — transactional email
 * (receipts, replies, cancellations) isn't marketing and doesn't carry
 * this. See supabase/migrations/0020_email_campaigns.sql. */
function unsubscribeFooter(url: string): string {
  return `<p style="margin:28px 0 0;font-size:12px;color:#6b7670;">Sent to you personally by the KiqStat team, not an automated blast.
  If you'd rather not get these, <a href="${url}" style="color:#6b7670;">unsubscribe here</a> — this never affects your account or billing emails.</p>`;
}

export function welcomeEmail(): { subject: string; html: string } {
  return {
    subject: "Welcome to KiqStat",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Welcome to KiqStat</p>
      <p style="margin:0;">Your account is set up. KiqStat gives you data-driven football predictions from a
      statistical model fitted on real results — real fixtures, real live scores, no guesswork.</p>
      ${button(SITE_URL, "See today's matches")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7670;">Want to see how it has actually done? Every
      published pick is settled and kept on the
      <a href="${SITE_URL}${sportPath("trackRecord")}" style="color:#4f6b00;">track record</a>.</p>
    `),
  };
}

/** Sent once, when someone joins the Code Hub waitlist (src/app/actions/code-hub.ts). */
export function codeHubWaitlistEmail(): { subject: string; html: string } {
  return {
    subject: "You're on the KiqStat Code Hub waitlist",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">You're on the list</p>
      <p style="margin:0;">Thanks for joining the Code Hub waitlist. Each morning the model will build
      five ready-made codes from 2 to 20 odds from the day's games. Each one comes with a SportyBet booking
      code and the model's chance of it landing.</p>
      <p style="margin:12px 0 0;">We'll send you one more email, on the day it opens. Until then, today's
      predictions are free to read.</p>
      ${button(`${SITE_URL}${sportPath("predictions")}`, "See today's predictions")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7670;">Every code we publish will stay on the page with its
      result, landed or missed. KiqStat is for adults 18 and over.</p>
    `),
  };
}

/**
 * Sent once to someone who opened checkout and didn't finish
 * (lib/checkout-recovery.ts). No discount: the plan is the plan. It names
 * what they were buying, says no money was taken, and offers the way back.
 */
export function unfinishedCheckoutEmail(opts: { tier: "pro" | "vip"; nigeria: boolean; unsubscribeUrl?: string }): {
  subject: string;
  html: string;
} {
  const name = opts.tier === "vip" ? "VIP" : "Pro";
  const perks =
    opts.tier === "vip"
      ? [
          "Picks before kick-off in the 15 Pro leagues, including the Champions League and Serie A",
          "Live win probability during every match",
          "Every prediction type, half-time and winning margin included",
          "Forge with every prediction type and Ask KiqStat 100 times a day",
          "Priority support",
        ]
      : [
          "Picks before kick-off in the 15 Pro leagues, including the Champions League and Serie A",
          "Every prediction type, half-time and winning margin included",
          "The full match breakdown on every game",
          "Forge with every prediction type, 100 combos a day",
          "Ask KiqStat 30 times a day",
        ];
  return {
    subject: `Your KiqStat ${name} upgrade is waiting`,
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">You were one step from ${name}</p>
      <p style="margin:0;">You started upgrading to KiqStat ${name} but the payment wasn't finished, so no money was
      taken. Your place is still there. Here's what ${name} unlocks:</p>
      <ul style="margin:12px 0 0;padding-left:20px;">${perks.map((p) => `<li style="margin:4px 0;">${p}</li>`).join("")}</ul>
      <p style="margin:20px 0 8px;font-weight:700;">What the model got right lately</p>
      <a href="${SITE_URL}${sportPath("trackRecord")}" style="text-decoration:none;">
        <img src="${SITE_URL}/api/og/recent-wins" width="496" alt="KiqStat's most recent winning picks" style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:10px;">
      </a>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7670;">Winning picks only. Every pick, won or lost, is on the
      <a href="${SITE_URL}${sportPath("trackRecord")}" style="color:#4f6b00;">track record</a>.</p>
      ${button(`${SITE_URL}/account/billing?plan=${opts.tier}`, `Finish upgrading to ${name}`)}
      <p style="margin:20px 0 0;font-size:13px;color:#6b7670;">${
        opts.nigeria
          ? "Card declined? Some banks block online payments until you allow them in your banking app, or you can try another card."
          : "Mobile money and cards both work on the payment page."
      } If something went wrong at checkout, message us from the Help page and we'll sort it out.</p>
      ${opts.unsubscribeUrl ? unsubscribeFooter(opts.unsubscribeUrl) : ""}
    `),
  };
}

export function passwordResetEmail(opts: { url: string }): { subject: string; html: string } {
  return {
    subject: "Reset your KiqStat password",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Reset your password</p>
      <p style="margin:0;">Someone asked to reset the password on your KiqStat account. If that was you, choose a
      new one below. The link works once and expires within the hour.</p>
      ${button(opts.url, "Choose a new password")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7670;">Didn't ask for this? Ignore this email and your
      password stays as it is. KiqStat will never ask you for your password by email, phone or WhatsApp.</p>
    `),
  };
}

export function receiptEmail(opts: {
  tier?: Tier;
  amountKobo: number;
  /** The amount already written in its own currency (Flutterwave payments); overrides amountKobo. */
  amountText?: string;
  /** Prepaid plans (Flutterwave): the date access now runs to. */
  accessUntil?: string;
  reference: string;
  date: string;
}): { subject: string; html: string } {
  const label = opts.tier ? TIER_LABEL[opts.tier] : undefined;
  const amount = opts.amountText ?? naira(opts.amountKobo / 100);
  const until = opts.accessUntil
    ? new Date(opts.accessUntil).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
    : undefined;
  const when = new Date(opts.date).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });

  return {
    subject: label ? `Receipt: ${label} payment` : "Receipt: KiqStat payment",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Payment received</p>
      <p style="margin:0 0 20px;">${
        label ? `Thanks for subscribing to ${label}.` : "Thanks for your payment."
      } Here's your receipt.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7670;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700;">${amount}</td></tr>
        ${label ? `<tr><td style="padding:6px 0;color:#6b7670;">Plan</td><td style="padding:6px 0;text-align:right;">${label}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6b7670;">Date</td><td style="padding:6px 0;text-align:right;">${when}</td></tr>
        ${until ? `<tr><td style="padding:6px 0;color:#6b7670;">Access until</td><td style="padding:6px 0;text-align:right;">${until}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6b7670;">Reference</td><td style="padding:6px 0;text-align:right;">${opts.reference}</td></tr>
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
    subject: `You've been gifted ${duration} of KiqStat ${label}`,
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">🎁 You just got ${label}, on the house</p>
      <p style="margin:0;">KiqStat gifted you ${duration} of ${label} — free, no card required. It's active now
      and runs through ${until}.</p>
      ${
        opts.note
          ? `<p style="margin:20px 0 0;padding:12px 16px;background:#f4f5ef;border-radius:8px;font-size:14px;color:#1a1f1c;font-style:italic;">"${escapeHtml(opts.note)}"</p>`
          : ""
      }
      ${button(SITE_URL, "See what's unlocked")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7670;">Nothing to cancel — this isn't a subscription, it
      just quietly ends on ${until} unless you decide to subscribe for real.</p>
    `),
  };
}

export function newTicketNotificationEmail(opts: {
  priority?: boolean;
  subject: string;
  fromEmail: string;
  preview: string;
  ticketId: string;
}): { subject: string; html: string } {
  return {
    subject: `${opts.priority ? "[VIP priority] " : ""}New ticket: ${opts.subject}`,
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">${opts.priority ? "New VIP priority ticket" : "New support ticket"}</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${escapeHtml(opts.fromEmail)}</p>
      <p style="margin:0 0 20px;"><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
      <p style="margin:0 0 20px;padding:12px 16px;background:#f4f5ef;border-radius:8px;font-size:14px;color:#1a1f1c;">${escapeHtml(opts.preview)}</p>
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
      ${button(SITE_URL, "Open KiqStat")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7670;">Reply from the chat icon in the bottom corner of the site.</p>
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
    subject: "Your KiqStat subscription was canceled",
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
      <p style="margin:0 0 16px;">Hey — Scaper here, I built KiqStat.</p>
      <p style="margin:0 0 16px;">No ask in this one, I just wanted to check in. I look at every ticket and every
      piece of feedback that comes through myself, but I don't always get to hear from people who are quietly
      using the site without ever needing to reach out — which is most of you.</p>
      <p style="margin:0 0 16px;">So: how's it been? If something's confusing, missing, or just annoying, hit
      reply — this inbox reaches me directly, not a queue.</p>
      <p style="margin:0;">Thanks for being here.<br />— Scaper, Founder &amp; CEO, KiqStat</p>
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
    subject: "2 minutes? I'd love your take on KiqStat",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here, founder of KiqStat.</p>
      <p style="margin:0 0 16px;">We're excited to see you subscribed to the <strong>${label}</strong> plan — genuinely,
      thank you. Paying for something means you expect it to be worth it, and I want to make sure it actually is.</p>
      <p style="margin:0 0 16px;">I put together a short survey — 6 questions, under 3 minutes, no account needed.
      Your answers go straight to me and shape what gets built next, not a marketing team.</p>
      ${button(opts.surveyUrl, "Take the 3-minute survey")}
      <p style="margin:24px 0 0;">Thanks for trusting us with your subscription.<br />— Scaper, Founder &amp; CEO, KiqStat</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function freeSurveyEmail(opts: { surveyUrl: string; unsubscribeUrl: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "2 minutes? I'd love your take on KiqStat",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here, founder of KiqStat.</p>
      <p style="margin:0 0 16px;">You've been using KiqStat on the free plan, and I'd genuinely like to know how
      it's going — what's working, what isn't, and what (if anything) would make the paid side worth it to you.</p>
      <p style="margin:0 0 16px;">I put together a short survey — 6 questions, under 3 minutes, no account needed.
      Your answers go straight to me, not a marketing team, and directly shape what we build next.</p>
      ${button(opts.surveyUrl, "Take the 3-minute survey")}
      <p style="margin:24px 0 0;">Thanks for giving KiqStat a shot.<br />— Scaper, Founder &amp; CEO, KiqStat</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function whatsappCommunityAnnouncementEmail(opts: { communityUrl: string; unsubscribeUrl: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "New: KiqStat picks on WhatsApp",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hey — Scaper here.</p>
      <p style="margin:0 0 16px;">Quick one: we just launched a KiqStat WhatsApp community. Once a day, before
      kickoff, everyone in it gets that day's value picks — individual picks plus safe/balanced/risky
      combos — in one message. Only picks that clear our sample-size bar, same standard as the
      site.</p>
      <p style="margin:0 0 16px;">Free, no spam, leave anytime.</p>
      ${button(opts.communityUrl, "Join the WhatsApp community")}
      <p style="margin:24px 0 0;">— Scaper, Founder &amp; CEO, KiqStat</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function rebrandAnnouncementEmail(opts: { unsubscribeUrl: string }): { subject: string; html: string } {
  return {
    subject: "BetriX is now KiqStat",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hi there,</p>
      <p style="margin:0 0 16px;">BetriX has a new name: <strong>KiqStat</strong>.</p>
      <p style="margin:0 0 16px;">Nothing you rely on has changed. Same team, same model, same picks and the same
      public track record. Your account and your plan carry over as they are. Just sign in at
      <a href="${SITE_URL}" style="color:#4f6b00;">www.kiqstat.app</a> with your usual email and password, and
      any old betrix.com.ng link brings you straight there.</p>
      <p style="margin:0 0 16px;">Why the change? We chose to settle a naming-rights question early, before it
      could ever affect you. KiqStat is a name that's fully ours, and it's here to stay.</p>
      <p style="margin:0 0 16px;">The standard behind every pick stays exactly where it was: fitted on real
      results, logged before kick-off, and published win or lose.</p>
      ${button(SITE_URL, "Open KiqStat")}
      <p style="margin:24px 0 0;">Thank you for being with us.<br>— Scaper, Founder &amp; CEO, KiqStat</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}

export function payOnceAnnouncementEmail(opts: { unsubscribeUrl: string }): { subject: string; html: string } {
  return {
    subject: "Pay for KiqStat with OPay, PalmPay or bank transfer",
    html: emailLayout(`
      <p style="margin:0 0 16px;">Hi there,</p>
      <p style="margin:0 0 16px;">A few of you told us you couldn't find OPay, PalmPay or your bank when you
      tried to upgrade. That's fixed.</p>
      <p style="margin:0 0 16px;">Pro and VIP can now be <strong>paid once</strong> by bank transfer, OPay,
      PalmPay, USSD (GTBank *737 and others) or card. You get the plan for the month, 3 months or year you
      choose, and nothing renews or charges you again.</p>
      <p style="margin:0 0 16px;">Pro is &#8358;5,000 a month: every pick type, Forge, Ask KiqStat and the full
      match breakdowns. Prefer it automatic? You can still choose card auto-renew on the same page.</p>
      ${button(`${SITE_URL}/account/billing`, "Choose a plan")}
      <p style="margin:24px 0 0;">Thanks for sticking with us.<br>— Scaper, Founder &amp; CEO, KiqStat</p>
      ${unsubscribeFooter(opts.unsubscribeUrl)}
    `),
  };
}
