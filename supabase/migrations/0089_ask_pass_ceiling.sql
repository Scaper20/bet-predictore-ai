-- 0089: Ask KiqStat spend over a pass's whole window (src/lib/ask/ledger.ts).
--
-- ask_spend books money per key per Lagos day (0088), so a 24-hour pass
-- bought in the afternoon got two days of cap. A pass is now booked to one
-- key, `pass:<pass id>`, on one day, the Lagos date its pass started, so its
-- cap covers the pass however many midnights it crosses.
--
-- ask_spend_reserve_on: ask_spend_reserve with the day given rather than
-- today. ask_spend_settle already takes the day.
--
-- offers.ask_cap_usd: the most one pass from this offer may spend on Ask,
-- over its whole window. Null falls back to a share of the price paid
-- (lib/ask/config.ts passCapMicros). The three offers of 0087 get the caps
-- that keep each at a 30% contribution margin at ₦1,600 to the dollar
-- (docs/reports/ask-kiqstat-staging-margin.pdf, section 5).
--
-- No new table; nothing here is reachable from the browser.

alter table public.offers
  add column if not exists ask_cap_usd numeric(8, 4)
  check (ask_cap_usd is null or (ask_cap_usd >= 0 and ask_cap_usd <= 100));

update public.offers
   set ask_cap_usd = case slug
     when 'vip-day-pass' then 0.14
     when 'members-vip-weekend' then 0.255
     when 'members-vip-trial' then 0.075
   end
 where slug in ('vip-day-pass', 'members-vip-weekend', 'members-vip-trial')
   and ask_cap_usd is null;

create or replace function public.ask_spend_reserve_on(
  p_key text, p_day date, p_amount bigint, p_min bigint, p_cap bigint, p_enforce boolean
)
returns table (allowed boolean, granted bigint, spent bigint, reserved bigint, spend_day date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent bigint;
  v_reserved bigint;
  v_grant bigint;
begin
  insert into public.ask_spend as s (key, day)
  values (p_key, p_day)
  on conflict on constraint ask_spend_pkey do nothing;

  select s.spent_micros, s.reserved_micros into v_spent, v_reserved
    from public.ask_spend s
   where s.key = p_key and s.day = p_day
   for update;

  if p_enforce then
    v_grant := least(p_amount, p_cap - v_spent - v_reserved);
    if v_grant < p_min then
      return query select false, 0::bigint, v_spent, v_reserved, p_day;
      return;
    end if;
  else
    v_grant := p_amount;
  end if;

  update public.ask_spend s
     set reserved_micros = s.reserved_micros + v_grant
   where s.key = p_key and s.day = p_day;

  return query select (v_spent + v_reserved + p_amount <= p_cap), v_grant, v_spent, v_reserved + v_grant, p_day;
end;
$$;

revoke all on function public.ask_spend_reserve_on(text, date, bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.ask_spend_reserve_on(text, date, bigint, bigint, bigint, boolean) to service_role;
