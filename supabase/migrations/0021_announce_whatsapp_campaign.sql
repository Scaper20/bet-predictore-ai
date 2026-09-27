-- Adds a fourth campaign type: one-off "we shipped something" announcements,
-- first used for "the WhatsApp community is live, come join." The intent
-- is for this to become the standing pattern for future feature launches —
-- a new campaign value + a short template each time, reusing the same
-- queue/batched-send machinery as the founder check-in and surveys, rather
-- than a new system per announcement.
alter table public.email_campaign_recipients
  drop constraint email_campaign_recipients_campaign_check,
  add constraint email_campaign_recipients_campaign_check
    check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp'));
