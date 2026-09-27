-- One-time outreach campaigns (a personal check-in from the founder, plus
-- two survey variants) — distinct from the app's transactional email
-- (welcome, receipts, ticket replies) and from the recurring WhatsApp
-- digest. Two tables:
--
--   email_campaign_recipients — the send queue + audit trail. Enqueued in
--     one batch per campaign/segment, then drained in small batches from
--     the admin panel (src/app/actions/admin/outreach.ts) rather than a
--     cron: Vercel's Hobby-plan cron can only fire once a day, far too
--     slow to page through a whole user base, and a human clicking
--     "send next batch" keeps someone in the loop for a one-time blast —
--     the same posture already chosen for the WhatsApp digest (compute,
--     don't auto-post). `tier` is a snapshot of the segment they qualified
--     under at enqueue time, so the subscriber survey's "you're on ___"
--     line stays correct even if their subscription changes before their
--     batch is actually sent.
--
--   survey_responses — one row per survey recipient, keyed by a random
--     token embedded in their email link so they can answer from the
--     inbox without signing in. answers is null until they submit.
create table public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign text not null check (campaign in ('warm_checkin', 'survey_subscribed', 'survey_free')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  tier text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- One row per (campaign, user) — re-enqueuing a campaign that's already
-- been queued must only add newly-eligible users, never double-send.
create unique index email_campaign_recipients_campaign_user_key
  on public.email_campaign_recipients (campaign, user_id);

create index email_campaign_recipients_pending_idx
  on public.email_campaign_recipients (campaign, status);

alter table public.email_campaign_recipients enable row level security;

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  survey text not null check (survey in ('survey_subscribed', 'survey_free')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index survey_responses_survey_user_key on public.survey_responses (survey, user_id);

alter table public.survey_responses enable row level security;
-- No RLS policy for authenticated/anon on either table — same posture as
-- admin_audit_log/whatsapp_digests/subscription_gifts. The survey and
-- unsubscribe pages are reached by a random token/id, not a session, and
-- resolve/write through supabaseAdmin() after checking that token
-- server-side, never through the visitor's own (usually nonexistent)
-- session.

-- Marketing opt-out, separate from user_preferences.digest (which only
-- covers the recurring matchday digest and still permits "account and
-- billing messages"). A one-time outreach blast is neither of those, so it
-- gets its own flag, checked when enqueueing a campaign — never touched by
-- anything transactional.
alter table public.profiles add column marketing_opt_out boolean not null default false;
