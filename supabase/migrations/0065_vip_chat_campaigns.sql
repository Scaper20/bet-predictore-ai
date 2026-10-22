-- The VIP chat launch emails (0064): to Pro and VIP, a reminder to VIP
-- members who haven't joined, and to free users. Same pattern as 0061.
alter table public.email_campaign_recipients
  drop constraint email_campaign_recipients_campaign_check,
  add constraint email_campaign_recipients_campaign_check
    check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand', 'checkout_reminder', 'announce_pay_once', 'vip_chat_launch', 'vip_chat_reminder', 'vip_chat_free'));
