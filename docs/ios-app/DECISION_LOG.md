# BetriX iOS App — Decision Log

Maintained by: Manager. This is the running record of what was decided, by whom, and
why, for the BetriX native iOS app build. Newest entries at the bottom.

## 2026-09-25 — Project kickoff

**Decision:** Stood up a 5-role virtual team (Manager, Researcher, Designer,
Developer, QA) per the human owner's directive to design and build BetriX's first
native iOS app store presence.

**Non-negotiable guardrails locked in** (from legal review + competitive research on
rival app PuntrrAI — no agent may propose work that violates these without escalating
to the Manager first):

1. No booking-code generation, no bet-slip building tied to named bookmakers, no
   wager facilitation of any kind. Informational only (probabilities, analysis, value
   detection).
2. Age rating and terms must be internally consistent — 18+ throughout, on the store
   listing and in-app.
3. No unverifiable accuracy claims ("95% sure", "guaranteed") anywhere in app copy,
   store listing, or marketing — lean on a public, timestamped, audited track record.
4. Payment and cancellation reliability is a P0 quality bar: does upgrade actually
   work, and can a user cancel in two taps.
5. App-store-facing description stays strictly analytics/insights framed, regardless
   of what any web-only feature does.

**Phase 1 (Research & Scoping) started.** Two research streams dispatched in
parallel (task board #2, #3):

- Codebase / Supabase schema / technical-approach research (native Swift vs.
  Capacitor vs. React Native), including App Store IAP implications.
- Apple App Store guideline research for gambling-adjacent/sports-analytics apps,
  Nigerian/South African gambling-advertising rules, a PuntrrAI App Store listing
  spot-check, and a search for relevant Claude Code skills/plugins/MCP connectors.

**Environment constraint flagged by Manager:** this build is running inside a Linux
cloud container with no macOS and no Xcode. Native Swift/SwiftUI source can be
authored here but not compiled, run in Simulator, or tested here — that requires a
macOS machine or CI runner as a separate step regardless of which technical approach
is chosen. This is a real input to the build-approach decision and will be surfaced
to the human owner alongside the Researcher's recommendation, not discovered later
in Phase 3.

**Open decision awaiting human owner confirmation:** iOS build approach (native
Swift/SwiftUI vs. Capacitor vs. React Native). Per the directive, the Manager will
not lock this in without confirming with Researcher findings and bringing the
recommendation for explicit sign-off. Phase 2 (Design) is blocked on this.

## 2026-09-25 — Research stream 1 complete: codebase, Supabase, technical approach

**Researcher findings (task #2, full detail in agent transcript):**

- Stack confirmed: Next.js 16 (App Router) / React 19 / TypeScript / Tailwind v4,
  Supabase Auth + Postgres (project `liciklbcvnkttukuydxi`, confirmed live and
  MCP-accessible), Paystack for billing (not Flutterwave/Stripe), Claude
  (`claude-opus-5`) used server-side only to rewrite a deterministic Dixon-Coles
  output into prose — never to invent stats. This backend is reusable as-is behind
  any client.
- The shipped mobile-responsive redesign (`bottom-nav.tsx`, `mobile-drawer.tsx`,
  `env(safe-area-inset-bottom)` handling) lives on `dev`, not yet merged to
  production, and is real, tested, phone-width UI — not a prototype.
- No PWA plumbing exists yet (no manifest, no service worker) — irrelevant to
  Capacitor viability but noted as a gap either way.
- Supabase's tracked migration history is empty despite 14 local migration files and
  11 live tables — schema was likely applied outside the CLI migration flow. Flagged
  so nobody assumes `supabase/migrations/` is an authoritative replay of the live
  schema without verifying first.
- Paystack webhook subscription/invoice field handling was implemented from general
  knowledge and never verified against live Paystack payloads per its own code
  comment — pre-existing risk, relevant to any iOS entitlement work built on top of
  it.

**Recommendation (Researcher → Manager, not yet a decision):** Capacitor, wrapping
the existing `dev` responsive app, as the fastest path to TestFlight — native
Swift/SwiftUI positioned as a possible later upgrade once iOS product-market fit is
proven. Rationale: near-full reuse of the real, already-built mobile UI; zero
backend changes needed either way; and it's the only option where meaningful
build/lint/test iteration is possible inside this Linux container today. Cost: a
webview-based IAP bridge (shared with React Native; only native Swift avoids it, at
the price of a full UI rebuild).

**Escalation — guardrail conflict found in the existing codebase, needs an explicit
ruling before Phase 2/3:** `src/app/(app)/[sport]/slip/page.tsx` ("Selection
Builder") lets users combine model picks, compute a combined probability, enter
"bookmaker odds," pulls a live SportyBet odds feed, and exports a downloadable
branded slip image. The code shows a prior, more literal booking-code feature was
already removed for compliance reasons — but this screen still names a specific
bookmaker and produces a shareable slip-style artifact, which sits close to (or
across) guardrail #1 above. **Needs a Manager/human-owner ruling**: ship as-is,
strip the SportyBet branding/rename it, or cut it from the iOS build entirely. This
does not block continuing Phase 1 research but must be resolved before Design work
touches this flow.

**Infrastructure gap confirmed:** no macOS/Xcode in this container, for any of the
three approaches — the team needs a macOS build machine or cloud-Mac CI (GitHub
Actions macOS runners, Bitrise, Codemagic, or EAS) provisioned before any TestFlight
build is possible. Recommend provisioning this in parallel with the approach
decision rather than after.

**App Store IAP gap confirmed as material, not cosmetic:** current billing is
entirely Paystack (hosted checkout + webhook entitlements). Apple Guideline 3.1.1
requires digital subscriptions to go through StoreKit in most cases — this means
either a dual-billing system with entitlement reconciliation, or a bigger billing
rework, either way needing explicit human-owner sign-off before Development starts.

Still awaiting research stream 2 (App Store guidelines / Nigerian-SA ad law / Claude
Code tooling) before the Manager brings a single consolidated recommendation.

## 2026-09-25 — Research stream 2 complete; Phase 1 closed; Manager recommendation

**Researcher findings (task #3, full detail in agent transcript):**

- **Apple guidelines:** No wagering mechanic means guideline 5.3 (gambling) shouldn't
  classify BetriX as a gambling app; live precedent apps (BettingPros, Outlier) prove
  odds/analytics apps pass review with the right vocabulary. Apple moved to a 5-tier
  age system (4+/9+/13+/16+/18+, mandatory since Jan 31 2026) with Gambling and
  Contests now separate questionnaire categories — real risk that answering the
  questionnaire "honestly-minimal" (no real-money wagering) auto-computes a rating
  *below* 18+, which would recreate guardrail #2's exact failure mode by accident.
  IAP: guideline 3.1.1 confirmed — the existing Paystack web subscription **cannot**
  unlock iOS features directly; a native StoreKit purchase path is required.
- **Nigeria/SA law:** Nigeria has a new unified gambling-ad framework (ARCON+FSGRN
  MoU, effective April 2026, ~5 months old — enforcement interpretation still
  forming). South Africa's NGB/ARB are actively tightening gambling-ad rules, and —
  important live signal — the South African Bookmakers Association has **publicly
  called for unregulated prediction/tipster apps to be treated as part of the
  illegal offshore gambling market**. This is an active regulatory pressure point
  aimed at exactly BetriX's category, not a settled or hypothetical risk. Researcher
  flagged this section as its lowest-confidence, least-sourced area and recommends a
  real NG/SA legal review before submission.
- **PuntrrAI verification — upgraded from competitive brief to primary source:**
  confirmed live listing (App Store id6752799419, developer Playcope (Pty) Ltd),
  displayed age rating **13+**; PuntrrAI's own privacy policy/ToS (Section 1.1)
  requires users be 18+, and Section 1.11 explicitly describes an "automated booking
  code service" that "acts as an intermediary for third-party gambling platforms."
  Both the age-rating mismatch and the booking-code claim are now independently
  confirmed with primary sources, not secondhand. A live App Store review also
  corroborates the "can't cancel, kept charging after I deleted the app" complaint.
- **Tooling:** Figma MCP is already connected and usable — Designer can start
  immediately, no setup needed. An uninstalled Figma plugin bundle includes a
  `figma-swiftui` skill (SwiftUI code generation from Figma designs) — recommended
  for enabling regardless of build approach, since it also supports a possible later
  native upgrade. No iOS/Swift/Xcode/App Store Connect/TestFlight/Fastlane skill or
  plugin exists in the catalog — confirmed gap, not a search miss. Independently
  reconfirms stream 1: no Xcode/simulator/codesigning/TestFlight upload is possible
  from this or any Claude Code cloud session — packaging needs a macOS CI runner or
  attached Mac.

**Manager's consolidated build-approach recommendation, for the human owner:**
**Capacitor**, wrapping the existing `dev`-branch responsive Next.js app for v1, with
native Swift/SwiftUI kept open as a fast-follow once iOS product-market fit and
budget justify a rebuild (the newly-found `figma-swiftui` tooling would materially
help that transition later). Both research streams converge here independently:
stream 1 on reuse/timeline/testability grounds, stream 2 by confirming IAP work is
required either way and that no native-specific tooling exists yet to offset
Capacitor's speed advantage. **Not locking this in — awaiting explicit human-owner
confirmation per the escalation rule**, as required before Phase 2 (Design) starts.

**Phase 1 (Research & Scoping) marked complete on the task board.** Phase 2 remains
gated on human sign-off below, not just task-graph completion — no Designer work
will start until that lands.

**Consolidated list of decisions needing explicit human-owner sign-off before Phase 2/3:**
1. **Build approach** — Capacitor (recommended) vs. native Swift/SwiftUI vs. React Native.
2. **"Selection Builder" slip screen** (`src/app/(app)/[sport]/slip/page.tsx`) —
   ship on iOS as-is, strip the SportyBet branding/rename it, or cut it from the iOS
   build entirely. Directly relevant now that PuntrrAI's own ToS confirms this is
   exactly the pattern regulators/reviewers scrutinize.
3. **iOS billing/IAP structure** — dual billing (Paystack on web, StoreKit on iOS)
   with entitlement reconciliation, vs. a broader billing rework. Affects margins:
   Apple's commission sits on top of the existing ₦700/₦3,500/₦12,000 tiers.
4. **macOS build infrastructure** — a paid cloud-Mac CI service (GitHub Actions
   macOS runners, Bitrise, Codemagic) or a physical Mac; required before any
   TestFlight build regardless of approach, so provisioning it now in parallel is
   recommended rather than discovering the gap during Phase 3.
5. **Commissioning a real NG/SA legal review** of the "informational, not gambling"
   positioning — recommended given the researcher's low confidence on this section
   and the live SABA pressure signal; not required to start Phase 2, but should not
   wait until submission.

Lower-stakes, non-blocking recommendation: enable the Figma plugin bundle
(`figma-swiftui` + design-to-code/code-connect skills) now so the Designer has it
available from day one of Phase 2.
