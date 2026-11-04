-- 0098: Remove the VIP WhatsApp chat (0064, 0065).
--
-- The feature is gone from the product: no /vip page, no invite link, no
-- roster, no launch emails. This drops its two tables and the three campaign
-- names it added, and deletes the queued/sent rows of those campaigns so the
-- campaign check can be put back to what it was before 0065.

drop table if exists public.vip_chat_members;
drop table if exists public.vip_chat_settings;

delete from public.email_campaign_recipients
where campaign in ('vip_chat_launch', 'vip_chat_reminder', 'vip_chat_free');

alter table public.email_campaign_recipients drop constraint if exists email_campaign_recipients_campaign_check;
alter table public.email_campaign_recipients add constraint email_campaign_recipients_campaign_check check (
  campaign in (
    'warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand',
    'checkout_reminder', 'announce_pay_once'
  )
  or campaign ~ '^offer:[a-z0-9-]{2,40}$'
);
