-- The Code Hub: a day's ready-made combos, one row per target price, each
-- with the SportyBet booking code that loads it (src/lib/code-hub-feed.ts).
--
-- A day is published once, on the first request of the Lagos day, and never
-- rebuilt: the model refits through the day as results come in, and a combo
-- that changed after people had loaded its code would no longer be the combo
-- they were shown. Insert-if-absent on (day, tier) makes two instances racing
-- the first request agree on one copy.
--
-- booking_code stays null until parse.bot is live (PARSEBOT_LIVE) and the
-- booking succeeds; the page shows the combo with "code coming" until then.
--
-- Service role only: RLS on, no policies. Which codes a viewer may see
-- depends on their plan and on kickoff times, so the server decides and
-- nothing reads this table with a user's key.

create table if not exists public.code_hub_codes (
  day date not null,
  tier text not null check (tier in ('2', '3', '5', '10', '20')),
  legs jsonb not null,
  odds numeric(8, 2) not null,
  probability numeric(6, 5) not null,
  first_kickoff timestamptz not null,
  last_kickoff timestamptz not null,
  booking_code text,
  booking_deadline timestamptz,
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (day, tier)
);

create index if not exists code_hub_codes_day_idx on public.code_hub_codes (day desc);

alter table public.code_hub_codes enable row level security;
