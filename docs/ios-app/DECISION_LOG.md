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
