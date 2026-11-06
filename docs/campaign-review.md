# Campaign review (checklist 4.5)

How the 48-hour and 7-day reviews of the X test (`utm_campaign=nov26-test`, plan in `docs/reports/x-pack-2026-11.md`) are run. Nothing to run until posts have gone out; the query below was checked on 6 November 2026 and returns no rows because no tagged link has been used yet.

## When

- **48 hours** after the first tagged post (P1 pinned): is anything arriving?
- **7 days** after it: which posts brought people, and did any pay?
- The ₦500 pass cohort has its own check on 8 November (see `docs/reports/conversion-and-free-tier-2026-11.md`).

## The query

First-touch signups from the campaign, by post (`utm_content`) and medium, with how many came back and how many paid (naira, our own accounts excluded):

```sql
with people as (
  select id, created_at, last_seen_at, signup_utm_campaign camp, signup_utm_content content, signup_utm_medium medium
  from profiles
  where signup_utm_source = 'x' and signup_utm_campaign = 'nov26-test'
    and email !~* '@(kiqstat\.app|kiqstat\.com\.ng|betrix\.com\.ng)$'
), paid as (
  select user_id, sum(coalesce(amount_minor,amount_kobo))/100.0 naira, count(*) orders
  from payments where status='success' and (currency is null or currency='NGN') group by 1
)
select coalesce(p.content,'(no content tag)') post, coalesce(p.medium,'-') medium, count(*) signups,
  count(*) filter (where p.last_seen_at - p.created_at > interval '10 minutes') came_back,
  count(pd.user_id) payers, coalesce(round(sum(pd.naira)),0) naira
from people p left join paid pd on pd.user_id = p.id group by 1,2 order by signups desc;
```

Also read, for the same window:

1. Admin → Traffic → KiqStat signups → Revenue by source: the `x` rows against the old untagged `t.co` row.
2. Vercel Web Analytics: visitors with `utmSource = x` and `utmCampaign = nov26-test`, by `utmContent`. Compare Nigeria only (the rest of the traffic is non-human; see the SEO plan).
3. Signups from X that arrived without a tag (referrer `t.co` or `com.twitter.android`, no campaign): a measure of how many links were posted untagged.

## How to report

- Per post: signups, came back, payers, naira. State the sample size beside every rate.
- Against the baseline: before this test X had sent 16 signups and 1 payer in all time.
- Say plainly if the result is nothing. Do not read a difference between posts with fewer than about 10 signups each.
- End with one recommendation: continue unchanged, change the mix of posts, or stop.
