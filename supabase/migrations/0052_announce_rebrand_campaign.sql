-- One-off announcement: BetriX is now KiqStat. Same pattern as 0021, a new
-- campaign value reusing the outreach queue and batched send.
alter table public.email_campaign_recipients
  drop constraint email_campaign_recipients_campaign_check,
  add constraint email_campaign_recipients_campaign_check
    check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand'));
