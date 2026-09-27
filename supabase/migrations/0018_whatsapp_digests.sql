-- BetriX — WhatsApp community daily digest
--
-- One row per Africa/Lagos calendar day: the ready-to-paste message(s) the
-- daily cron computed, for the admin dashboard to display and for a human
-- to copy into the WhatsApp group by hand (see src/lib/whatsapp-digest.ts
-- for why this is semi-automated rather than posted directly — no official
-- API exists for posting into a consumer WhatsApp group/community, and the
-- unofficial ones carry real, often-permanent ban risk).
--
-- `digest_date unique` doubles as idempotency: the cron upserts on it, so a
-- re-run on the same day (a retry, or a manual re-trigger from the admin
-- page) replaces the row instead of duplicating it.
create table public.whatsapp_digests (
  id uuid primary key default gen_random_uuid(),
  digest_date date not null unique,
  has_picks boolean not null,
  picks_message text not null,
  acca_messages text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index whatsapp_digests_date_idx on public.whatsapp_digests (digest_date desc);

alter table public.whatsapp_digests enable row level security;
-- No policy for `authenticated`/`anon` at all — service-role only, same
-- posture as admin_audit_log (0007) and every other admin-only table.
