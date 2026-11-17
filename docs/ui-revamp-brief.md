# UI/UX revamp brief (November 2026)

Branch: `ui-ux` (from `Main/Production`). Sources: the `screen-redesign-playbook` and
`ui-design-rules` skills.

## The request, rewritten

> Revamp every public page (~45 routes under `src/app/(app)`, plus survey, unsubscribe and offline)
> and every admin page (~25 routes under `src/app/admin`) of KiqStat, using the five passes of
> `screen-redesign-playbook` and the detail rules of `ui-design-rules`.
>
> **Keep:** the KiqStat identity (dark-first "floodlights on a night pitch", Volt `#D4FF3A` as the
> one accent, gold for premium, Signal orange for live, Unbounded / Space Grotesk / IBM Plex Mono),
> the light theme, every piece of data, copy, route, analytics event and test. Only structure and
> styling change. Where a skill default conflicts with the brand, the brand wins and the conflict
> is noted here.
>
> **Work one pass at a time, across the whole site**, starting with shared tokens and components
> (`globals.css`, `components/ui`, `components/layout`, `components/admin/admin-shell.tsx` and
> `kit.tsx`) so most pages change without being touched. Commit and push after each pass and stop
> for a look before the next.
>
> 1. **Foundation (Pass 1).** One type scale as tokens; no arbitrary `text-[Npx]` sizes. One card
>    style (radius, alpha border, padding, flat surface). Alpha borders, OKLCH for derived colours,
>    nested-radius rule. Strip slop tells: decorative gradients, glowing cards, "welcome back"
>    banners.
> 2. **Hierarchy (Pass 2).** Per screen: actions up top (search, one filled primary CTA, quieter
>    secondaries), one "needs attention" area, secondary content collapsed below, quiet charts
>    (one accent line, one marker). Admin sidebar regrouped into small labelled groups with rare
>    items under "More". Hick's and Miller's laws on nav and filters.
> 3. **CTAs (Pass 3).** The primary CTA on key screens (pricing, match, predictions, slip, admin
>    dashboard) swaps its label from action to outcome on hover, icon moves, under 300 ms.
> 4. **Depth (Pass 4).** Frosted glass on chrome only (sticky header, bottom nav, drawers, palette,
>    dialogs), never on data cards. See "Brand overrides".
> 5. **⌘K (Pass 5).** The admin already has `components/admin/command-palette.tsx`; bring a public
>    one (matches, teams, leagues, tools, account actions) using the same pattern.
>
> **Every pass also checks:** motion under 300 ms with overshoot easing for follow-through,
> `prefers-reduced-motion`, hover/press/focus/loading/empty states, 44 px hit areas on touch,
> `100dvh` for full-height sections, faded edges on horizontal scrollers, icon stroke matched to
> text weight, both themes, phone width.
>
> **Verify** with `npm run lint`, `npm test`, `npm run build`, and Playwright screenshots of a
> fixed set of pages (home, predictions, match, pricing, account, admin dashboard, admin users) in
> dark and light, phone and desktop, before and after each pass.

## Brand overrides (where the skills' defaults don't apply)

- **No photographic wallpaper (Pass 4).** The product is a data-dense dark UI; a photo behind
  odds and tables costs legibility. Glass is used on chrome that floats over content instead.
- **No new palette.** The palette recipes are for new brands; KiqStat already has one.
- **Type scale keeps Tailwind's names.** The scale is `text-2xs` (new, 11 px) plus Tailwind's
  `xs`–`base`–`lg`–`xl`–`2xl` for interface text; `3xl` and up are display sizes for marketing
  heroes only.

## Pass log

| Pass | Status | Notes |
| --- | --- | --- |
| 1 Foundation | done | `text-2xs` token + 475 arbitrary sizes mapped to the scale; one flat `.card` (no gradient), `.card-inner` nested radius; alpha `line` tokens in both themes; `glow-brand`/`glow-soft` removed (12 uses); repeated brand washes on match/team/player headers removed; dark hover = lighter surface, not shadow; OKLCH ratings gradient; faded scroller edges; `dvh` for full-height. |
| 2 Hierarchy | done | Admin: greeting removed; header carries the role's actions with one filled primary (Chase renewals / Check data health / New campaign / Answer tickets), secondaries quiet and hidden on phones; secondary sections (Operations, Voice of the user, Owned channels, Feedback and gifts) collapse below; revenue/signup/hit-rate charts quiet (neutral columns, accent on today only); sidebar puts Governance and rare pages under one "More" that opens when you're inside it; KPI numbers no longer truncate. Public: account page's "Hi, name" banner replaced by a compact identity row, shortcut glyphs replaced by icons, one "To do" card. Public nav left as is (deliberately placed and tour-anchored). |
| 3 CTAs | done | `OutcomeLabel` + `.cta` (globals.css): the label cross-fades to the outcome and the icon moves, 180-250 ms with overshoot, also on keyboard focus, off for reduced motion, outcome aria-hidden. Header "Create free account" → "27 competitions, free"; plan CTAs → each plan's headline benefit (`ctaOutcome` in lib/pricing.ts); admin primary → live stake ("Save 4 renewals", "Fix 3 failed runs", "Reach N people", "Clear N open"); hero arrow nudges. |
| 4 Depth | | |
| 5 ⌘K | | |
