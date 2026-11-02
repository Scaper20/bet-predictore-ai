# Mixpanel

Project token `d87ceb24b5c4ac90aaddae5a8f6df97b` (public by design; `NEXT_PUBLIC_MIXPANEL_TOKEN` overrides it).
Code: `src/lib/mixpanel/` (catalogue, browser and server wrappers), `src/components/analytics/`.

## How it is wired

- **Browser** (`mixpanel-browser`): `<MixpanelProvider>` in the `(app)` layout loads the SDK when the page is idle,
  calls `identify(<database user id>)` for signed-in visitors on every load, and `reset()` on sign-out. Autocapture and
  automatic page views are off (Vercel and GA4 count page views). Nothing is sent from `next dev`.
- **Server** (`mixpanel` for Node): events that happen on the server are sent after the response (`after()`), awaited,
  and never throw into the request. Signed-in users are tracked under their user id; a visitor who isn't signed in
  under the browser's anonymous id (cookie `kq_did`). `kq_sn` carries the browser's session number to the server.
- **Consent:** visitors from the EU/EEA, UK and Switzerland are not tracked (browser and server) until the app has a
  consent prompt (`needsConsent` in `events.ts`).
- Every event carries `environment` (`production`, `preview`...). Use a separate Mixpanel project for previews by setting
  `NEXT_PUBLIC_MIXPANEL_TOKEN` on the Preview environment.

## Events

| Event | Fired from | Notes |
|---|---|---|
| `user_signed_up` | `actions/auth.ts` `signUp`; `auth/callback` for a new OAuth account | `acquisition_channel` from the first-touch cookie and partner link (`channel.ts`); `country` from the geo cookie |
| `login_started` | `actions/auth.ts` `signIn`; `auth/callback` for an existing account | `device_type`: `mobile_web`, `tablet_web`, `desktop_web` |
| `forge_combo_created` | `api/forge` POST, once a combo comes back | `combo_type`: `accumulator` (2+ legs) or `single` |
| `ask_kiqstat_question_submitted` | `api/ask` POST, when the answer finishes | `question_topic` is a keyword bucket; the question text is never sent. `response_time_ms` is request start to answer |
| `code_hub_code_generated` | `api/slip/book` on a booked code | `validation_mode` is `generate_and_validate` when the code was read back from SportyBet |
| `code_hub_validation_completed` | `api/code-hub/scan` | `pass` all games read, `partial` some, `fail` none; `error_count` = games not read |
| `model_performance_viewed` | match page, `ModelInsightViewed` | `accuracy_score_bucket` = the model's confidence in the pick shown: high 70+, medium 50-69, low <50, `unrated` with no pick |
| `upgrade_to_pro_started` | Paystack and Flutterwave checkout routes | Pro only; `plan_period`: `monthly`, `quarterly`, `annual` |
| `upgrade_to_vip_completed` | Paystack subscription webhook, pay-once grant, Flutterwave grant | One per payment (`$insert_id`); `vip_start_datetime` is ISO 8601 |

## Before relying on it

- Confirm the project's data residency. The default host is US; for an EU or India project set
  `NEXT_PUBLIC_MIXPANEL_API_HOST` and `MIXPANEL_API_HOST` (the CSP already allows all three hosts).
- Set Lexicon descriptions for the nine events and an owner for the tracking plan.
