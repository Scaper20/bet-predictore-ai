-- Code Hub: the four-day 50 and 100 odds codes (lib/code-hub.ts HUB_TIERS).
-- Only the allowed tier values change; existing rows are untouched.
alter table public.code_hub_codes drop constraint if exists code_hub_codes_tier_check;
alter table public.code_hub_codes
  add constraint code_hub_codes_tier_check check (tier in ('2', '3', '5', '10', '20', '50', '100'));
