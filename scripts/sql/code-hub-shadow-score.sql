-- The Code Hub's team-form shadow run (lib/code-hub-shadow.ts, 0105) against
-- the real hub, on the days both were built and every game is finished.
-- Each code is graded leg by leg from match_results; profit is 1 unit a code
-- at the odds stored with it (SportyBet's price where the board had one).
-- Decide after about six weeks of days: the lab's edge was +4.5 codes landed
-- per 100 days, so a short run can only rule out a large loss.
-- The last row is the paired difference, shadow minus real, per 100 days: its
-- "landed" column is the change in codes landed and "expected" that change's
-- 95% half-width; "profit_units" the change in profit and "return %" its half-width.
with codes as (
  select 'real' src, day, tier, legs, odds, probability from public.code_hub_codes
   where tier in ('2', '3', '5', '10', '20')
  union all
  select 'shadow', day, tier, legs, odds, probability from public.code_hub_shadow
   where variant = 'team-hit-l8-x0.25'
),
both_days as (
  select day from codes group by day having count(distinct src) = 2
),
legs as (
  select c.src, c.day, c.tier, c.odds, c.probability, l->>'market' m, r.home_goals h, r.away_goals a, r.status
    from codes c join both_days using (day)
    cross join jsonb_array_elements(c.legs) l
    left join public.match_results r on r.match_id = l->>'matchId'
),
graded as (
  select *, case
    when status is distinct from 'finished' or h is null then null
    when m = '1x2:home' then (h > a)::int
    when m = '1x2:away' then (a > h)::int
    when m = 'dc:home-draw' then (h >= a)::int
    when m = 'dc:away-draw' then (a >= h)::int
    when m = 'dc:home-away' then (h <> a)::int
    when m like 'ou:over:%' then (h + a > split_part(m, ':', 3)::numeric)::int
    when m like 'ou:under:%' then (h + a < split_part(m, ':', 3)::numeric)::int
    when m = 'btts:yes' then (h > 0 and a > 0)::int
    when m = 'btts:no' then (h = 0 or a = 0)::int
    -- Asian lines: a push (exact) counts as landed, as SportyBet voids the leg.
    when m like 'ah:home:%' then (h + split_part(m, ':', 3)::numeric >= a)::int
    when m like 'ah:away:%' then (a + split_part(m, ':', 3)::numeric >= h)::int
  end won
  from legs
),
per_code as (
  select src, day, tier, max(odds) odds, max(probability) chance,
         bool_and(won = 1) landed, count(*) filter (where won is null) open_legs
    from graded group by src, day, tier
),
settled_days as (
  select day from per_code group by day having sum(open_legs) = 0
),
per_day as (
  select src, day, count(*) codes, sum(landed::int) landed, sum(chance) expected,
         sum(case when landed then odds - 1 else -1 end) profit
    from per_code join settled_days using (day) group by src, day
)
select src,
       count(*) days,
       sum(codes) codes,
       sum(landed) landed,
       round(sum(expected), 1) expected,
       round(100.0 * count(*) filter (where landed > 0) / count(*), 0) "days any landed %",
       round(sum(profit), 1) profit_units,
       round(100 * sum(profit) / sum(codes), 1) "return %"
  from per_day group by src
union all
-- Paired: shadow minus real, per 100 days, with a rough 95% interval.
select 'shadow - real (per 100 days)',
       count(*), null,
       round(100 * avg(dl), 1), round((196 * stddev_samp(dl) / sqrt(count(*)))::numeric, 1),
       null,
       round(100 * avg(dp), 1), round((196 * stddev_samp(dp) / sqrt(count(*)))::numeric, 1)
  from (
    select s.day, s.landed - r.landed dl, s.profit - r.profit dp
      from per_day s join per_day r on r.day = s.day and r.src = 'real'
     where s.src = 'shadow'
  ) d;
