# Notifications: what is sent, how fast, and how it works

Web Push to every device that has said yes, signed in or not. Each device
chooses its own topics in settings (account page, and the notification sheet).

Latencies below are what the design should give (scores land every minute, the
check runs every minute); they have not been measured live yet. After rollout,
time a real slip from full time to the notification and update this table.

| Topic | Sent | Who | Latency |
|---|---|---|---|
| Daily codes | When today's Code Hub codes get their SportyBet code | Everyone once the Code Hub is open. A free device hears about its one free code and a count of the Pro ones; a Pro-only code is never named to it | Seconds after booking (sent from the booking run), minute cron as backstop |
| Community codes | A member posts a code | Everyone with the topic on, except the poster | The first one at once; any that follow within 5 minutes go out together as "N new community codes" |
| Tracked slip results | Each game on a slip the device tracks, as it finishes: "2 of 4 in", the slip going out the moment a leg loses, the slip landing | The device that tracks the slip | 1–3 minutes after full time (scores land every minute, the check runs every minute) |
| Today's picks / yesterday's results | 08:00 Lagos | Everyone with the topic on | Unchanged |
| Strong pick alerts | 20 minutes before kickoff and when graded | Pro and VIP | Unchanged |

All new topics default on. Slip, code and community notifications use the
`tag` the service worker already understands, so a phone shows one notification
per slip (updated in place), one for the day's codes, one for community codes.

## How it works

- `supabase/functions/live-scores` writes each game's status and score to
  `public.matches` every minute (pg_cron `betrix-live-scores`).
- pg_cron `betrix-push-events` runs `invoke_push_events()` every minute
  (0074). It is a few indexed EXISTS checks, and only calls
  `/api/cron/push-events` when one finds work: a game finished on a tracked
  slip since the slip was last checked, a code booked and not announced, a
  community post waiting (and none sent in 5 minutes), a Strong pick due. A
  quiet night costs no invocations.
- `src/lib/push/events.ts` has the three dispatchers. Each finds what is new,
  **claims** it, then sends. Codes and posts claim a key in `push_events_sent`
  (primary key, so overlapping runs cannot both send); a slip is claimed by an
  update that only succeeds against the `checked_at` it was read with.
- Codes and community posts are also dispatched straight away by whatever made
  them (`bookMissing` in `code-hub-feed.ts`, the post route), so they do not wait
  for the cron. Claiming makes the double path safe.
- Tracked slips live in the browser (`lib/tracked-slips.ts`). When a device has
  notifications on, `TrackedSlipsPushSync` copies them to
  `push_tracked_slips` (`/api/push/slips`), sends only what changed, and removes a
  slip once the app has settled it itself (you saw it land, so no push). The
  server grades with the same `settleLeg` / `slipSettled` the Tracked slips page
  uses, over the same score sources (`lib/slip-scores.ts`).
- The Code Hub notifications wait for `app_switches.code_hub_open`: nothing is
  claimed while it is closed, so the day it opens that day's codes are announced.

## Rolling it out

Order matters, because the code reads the new columns and the new cron
precheck would otherwise call a handler that does not claim its work:

1. Apply `0073_push_realtime_topics.sql` (additive; the old push_sync
   arguments still work, so the running site is unaffected).
2. Deploy the app (merge `dev`).
3. Apply `0074_push_events_every_minute.sql` (moves pg_cron to every minute).
4. Send a test from the account page, track a slip with a game about to finish,
   and watch `/admin` push health: `push_subscriptions.last_error` shows why a
   device failed.

## Limits worth knowing

- Delivery is one HTTPS call per device at 25 at a time. Around ten thousand
  subscribed devices a broadcast starts to take minutes; past that it needs a
  queue (fan out in chunks) rather than one run.
- iPhone only gets push inside the Home Screen app, and Apple's push service
  rejects the `Topic` header, which `topicFor` already leaves off.
- A corners or shots leg on a slip waits for ESPN counts, checked every 5
  minutes, and is voided after three days without them (`STAT_VOID_AFTER_MS`).
- A leg SportyBet or the feed gives us an id we cannot map to a stored match is
  watched on the same 5-minute timer.
