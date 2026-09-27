-- BetriX — signup traffic-source attribution
--
-- First-touch: captured once, at the visitor's first request (see
-- src/proxy.ts), and carried through to whichever account they eventually
-- create — never overwritten by a later visit. That's the answer to
-- "where did this user actually come from," as opposed to last-touch
-- (whichever link they happened to click right before signing up, which
-- for a returning visitor is usually just "direct").
--
-- All nullable: most visitors arrive with no UTM params at all, and a
-- request can arrive with no Referer header (direct traffic, or a browser
-- that strips it) — that's data, not something to force a value for.
alter table public.profiles
  add column signup_referrer_host text,
  add column signup_utm_source text,
  add column signup_utm_medium text,
  add column signup_utm_campaign text,
  add column signup_utm_term text,
  add column signup_utm_content text,
  add column signup_landing_page text;
