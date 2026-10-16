-- The unfinished-checkout reminder as an outreach campaign too, so it can be
-- queued and sent by hand from /admin/outreach alongside the daily automatic
-- send (src/lib/checkout-recovery.ts). Same pattern as 0052.
alter table public.email_campaign_recipients
  drop constraint email_campaign_recipients_campaign_check,
  add constraint email_campaign_recipients_campaign_check
    check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand', 'checkout_reminder'));
