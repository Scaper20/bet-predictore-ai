-- One-off announcement: Pro and VIP can now be paid once by bank transfer,
-- OPay, PalmPay or USSD (0060). Same pattern as 0052.
alter table public.email_campaign_recipients
  drop constraint email_campaign_recipients_campaign_check,
  add constraint email_campaign_recipients_campaign_check
    check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand', 'checkout_reminder', 'announce_pay_once'));
