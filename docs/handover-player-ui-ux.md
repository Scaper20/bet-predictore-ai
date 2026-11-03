# Handover to the CTO: player props, team and player pages (UI, headshots, UX, bugs)

Written 3 Nov 2026 against `dev` at the commit that renumbered the migrations. The data layer and models for this work are done and live on `dev`. What is left is the product surface: how it looks, how people find it, and the pictures. This document says what exists, what is missing, and gives four tasks with acceptance criteria.

Nothing here has been looked at on a real phone by the author of this note. Everything below comes from reading the code, the database and the docs. Where something is a guess, it says so.

---

## 0. What exists today (read this first)

### Routes

| Route | File | Notes |
|---|---|---|
| `/football/props` | `src/app/(app)/[sport]/props/page.tsx` | The board: picks first, then any market, grouped by competition. |
| `/football/player/[id]` | `src/app/(app)/[sport]/player/[id]/page.tsx` | Header, then tabs: Overview, Game log, Stats, Shots (if any), Lines cleared, Props (only if the player has a next game), Profile. |
| `/football/team/[id]` | `src/app/(app)/[sport]/team/[id]/page.tsx` | Club page: fixtures, form, squad, leaders, injuries, club facts. ISR, 30 minutes, no cookie read. |
| Match page, **Player props** tab | `src/app/(app)/[sport]/match/[id]/page.tsx` (line ~142) | Same `PropsPanel`, scoped to the match. |
| `/api/props?match=…` or `?player=…` | `src/app/api/props/route.ts` | Per-viewer, `no-store`. Redacts for free users on the server. |
| `/api/teams/search` | `src/app/api/teams/search/route.ts` | Header search; returns teams and (with a flag) players. |

### Components

- `src/components/props/` — `prop-card.tsx` (220 lines), `props-panel.tsx` (the client panel: fetch, market chips, grid), `prop-book.tsx` (SportyBet code button).
- `src/components/player/player-sections.tsx` (479 lines) — season tiles, rating strip, game log, stats and percentiles, shot map, hit rates, profile.
- `src/components/team/team-sections.tsx` — club panel, fixtures, form, squad, leaders, injuries.
- Shared: `MatchTabs` (tab strip used by match, team and player pages), `Crest`, `RatingChip`, `FormPips`, `containerClass()`.

### Data (production, checked 3 Nov)

- `players`: 10,692 rows, **all with a FotMob id** (`players.fotmob_id`).
- `player_profiles`: only **1,000** rows. Profile data (shirt, height, foot, market value, career) is filled by a job and is far from complete. Pages must cope with a missing profile (they do today: `p.hasProfile`).
- `player_lines`: 20,335 captured SportyBet lines.
- `app_switches.player_props` is **off**. Props are in a shadow trial: picks are logged and graded privately, projections are live. The UI already says so ("Picks are in their trial run…"). Do not remove that notice until the switch is turned on (rule in `docs/player-props.md`: about three weeks and 400 graded picks).

### Access rules (do not break these)

- Free: who, which market, and how often recent starts cleared the line.
- Pro: projection, the ladder, the pick, the SportyBet code.
- Redaction happens on the server in `src/lib/props-view.ts` (tested). Any new UI must take its data from `viewProps()`; never fetch the raw rows into a client component.

### Design system

Tokens and utilities already in use: `card`, `border-line`, `bg-surface`, `bg-surface-2`, `text-ink-muted`, `text-brand`, `font-display`, `tnum`, `stagger`, `no-scrollbar`. Palette: Ink / Pitch / Steel / Chalk / Volt / Signal. Fonts: Unbounded (display), Space Grotesk (body), IBM Plex Mono (numbers). Follow `docs/` and `video/DESIGN.md` for brand rules. House copy rules: no promise of winning, no bookmaker names in marketing copy (the product UI does say "SportyBet code" on props, which is existing behaviour; confirm with the founder before spreading it to new surfaces), 18+.

---

## 1. Task one: UI structure for player props, team pages, player pages

**Goal:** one coherent, mobile-first structure across the three surfaces, so a person who learns one can read the other two.

### What I found

1. **The three pages use the same tab component but not the same skeleton.** The player page puts its hero in a full-width header and its content in a 5xl container. Check the team page against it and make the header, spacing and tab behaviour match (same hero height, same chip row, same sticky tab strip).
2. **The player header is dense on a phone.** `HeroStat` chips (Position, Age, Country, Value, Rating) wrap under the name. With 5 chips plus a shirt-number badge on a 360px screen this will take 3 rows. Decide which two matter above the fold (suggestion: position and rating) and move the rest into the Profile tab or a "more" row.
3. **Seven tabs on the player page.** Overview, Game log, Stats, Shots, Lines, Props, Profile. On a phone the strip scrolls sideways; people will not find the last ones. Suggested fold: Overview · Games · Stats (shots live inside it as a section) · Props · Profile; move "Lines cleared" into Props as its first block, since "how often did this player clear the line" is the free half of props.
4. **The Props tab only exists when the player has a next game** (`page.next`). A player with no upcoming game has no Props tab at all, so the feature is invisible rather than explained. Show the tab always, with the empty text ("Props for the next game appear once FotMob has a likely eleven…").
5. **Prop cards are tall.** Each `PropCard` holds identity, market label, lineup status, the pick block, a hit-rate strip and a ±3 ladder. In a two-column grid that is fine on desktop; on a phone it is one very long scroll. Proposal: a compact row (player, market, pick, chance) that expands to the ladder.

### Deliverables

- A short written spec (one page per surface, mobile 360–414px first, then tablet, then desktop) before code. Figma is connected to this workspace if the team prefers to design there.
- Shared pieces extracted once: `PlayerAvatar` (see task two), `PlayerHeader`, `TeamHeader`, `StatTile`, `MarketChips`, `PropRow`.
- Empty, loading, error and "not enough data" states for every panel. `PropsPanel` already has loading and error states; the player and team sections need the same audit.

### Acceptance criteria

- No horizontal page scroll at 360px on any of the three pages (tab strips and ladders may scroll inside their own container).
- Tap targets 44px or more (the market chips are `h-8`, i.e. 32px; raise them).
- Lighthouse mobile performance on a player page does not drop. The team page is ISR; keep it static.
- Free, Pro and signed-out views all reviewed with screenshots.

---

## 2. Task two: player profile headshots

**Goal:** a headshot on the player page header, on prop cards and in search results, with initials as the fallback.

### What exists

- Today every avatar is **initials in a rounded square** (`p.initials` in the player page header; a 40px version with a position tag in `prop-card.tsx`). There is no image field anywhere in the schema (`player_profiles` stores position, shirt, height, foot, country, birth date, value, contract, club, career, trophies, injury).
- Every player has `players.fotmob_id`, so an image can be derived from the id without a new lookup.
- `img-src` in `next.config.ts` already allows any `https:` host, so no CSP change is needed for hotlinking. `Crest` already renders remote images (team logos), so there is a pattern to copy.

### The licensing question comes first (needs a decision, not code)

Our FotMob feed is an unofficial one. `supabase/migrations/0091` and `0093` already lock FotMob data to service-role reads "because it is an unofficial feed of licensed data". Player photos are the most commonly enforced asset. Options:

| Option | Cost | Risk |
|---|---|---|
| A. Hotlink FotMob's image CDN from the browser | None | Highest: our users' browsers hit their CDN, we can be blocked or asked to stop, and it is the clearest breach of their terms. Pattern to test (I could not reach it from the sandbox): `https://images.fotmob.com/image_resources/playerimages/{fotmob_id}.png`. |
| B. Download and re-host in Supabase Storage | Storage + one job | Still redistributes their images. Same legal question, better reliability. |
| C. A licensed source (API-Football, Sportmonks, Sportradar imagery, or club-supplied) | Subscription | Lowest risk. Check which of these we already pay for or can add to the budget. |
| D. Initials only, plus a stylised silhouette by position | None | None. Weakest visually. |

**My recommendation:** ship D polished now (see below), take the licensing decision with the founder, and build the avatar component so a source can be swapped without touching pages. Do not launch with option A in production without that decision.

### Build plan (works for any source)

1. `players.photo_url` (nullable) plus `photo_source` and `photo_checked_at`, in a new migration. Remember CLAUDE.md: any migration that creates a table or view must grant it in the same file (`src/lib/migration-grants.test.ts` enforces this; a column on an existing table is fine).
2. A job (the pattern in `ingestion/` and the cron routes under `src/app/api/cron/`) that fills it lazily: only for players who appear on a page, a prop, or in search, highest traffic first. Never all 10,692 at once.
3. `PlayerAvatar({ name, initials, src, size, position })` in `src/components/ui/`: `next/image` with a fixed size and `sizes`, `loading="lazy"`, a `blur` or flat placeholder, `onError` falls back to initials. Keep `aria-hidden` only when the name is printed next to it.
4. Use it in: player page header (80–96px), prop card (40px), search results, team squad list and leaders.
5. Cache: long `Cache-Control` and an image CDN domain in `images.remotePatterns` if `next/image` is used.

### Acceptance criteria

- A missing or broken photo never shows a broken-image icon; it shows initials.
- No layout shift when a photo loads (reserved box).
- Prop card list of 40 cards loads no more than the visible photos (lazy).
- The licensing decision is written down in this file before any photo ships.

---

## 3. Task three: UX flow to reach player props seamlessly (mobile first)

### How a person reaches props today

| Entry | Works on | Comment |
|---|---|---|
| Mega-menu: Predictions › Player props (badge "New") | Desktop | Defined in `src/lib/nav.ts` (~line 117). |
| Mobile drawer | Phone | Reads the same `navFor()`. Reachable only after opening **More**. |
| Match page › Player props tab | All | Good, but tab order and visibility depend on the match. |
| Player page › Props tab | All | Hidden when the player has no next game. |
| Prop card links to player and match | All | Good. |

**The mobile bottom bar has no props entry.** It carries Picks, Live, (centre action: Forge), Code Hub, More (`src/components/layout/bottom-nav.tsx`). So on a phone the feature is two taps deep and unlabelled.

### Proposed flow (decide, then build)

1. **Picks page gets a "Matches | Players" switch** at the top (or a "Player props" chip next to the league chips) so props sit inside the thing people already open. The `/props` route stays as the deep link.
2. **Match card on Picks** gets a small "Props" link or count ("12 props") that opens the match page on its Player props tab (`MatchTabs` already keeps the tab in the URL hash, so link to `…/match/<id>#props`).
3. **From a prop card, one tap to the answer:** the pick and chance visible without expanding; ladder and code behind an expand.
4. **Search finds players.** The header search already supports players (`/api/teams/search` with a flag). Make sure the mobile search sheet turns the flag on and shows photo, club, position.
5. **Upsell:** free users see the facts and the Pro lock. The lock should name the exact thing they get ("projection, pick and code for this player") and link to `/pricing`; `PropsUpsell` is one block at the top of the panel. Test whether an inline lock on the first card converts better than a banner.
6. **Return path:** after upgrading, return to the same props view (preserve the `returnTo`).

### Events (Mixpanel is wired; add these)

`props_board_viewed`, `props_market_filtered`, `prop_card_expanded`, `prop_player_opened`, `prop_code_booked`, `props_upsell_clicked`. Use `trackClient`/`trackLater` in `src/lib/mixpanel/` and register them in `events.ts` (the typed map). Session Replay is already masked on inputs; props pages are not in the `NO_REPLAY` list and do not need to be.

### Acceptance criteria

- From the home screen on a phone: Picks → player props in one tap, no menu.
- From a match card: its props in one tap.
- A first-time user can tell, without help, what a "prop" is (one line of plain English on the board; no jargon in the card headings).
- No new item in the bottom bar unless something is removed (five slots are full).

---

## 4. Task four: bugs and rough edges noticed

Severity is my judgement. "Checked" means I confirmed it in code or in the database; "suspected" means I read something that looks wrong and did not run it.

| # | Where | What | Status |
|---|---|---|---|
| 1 | Player page | Props tab missing when the player has no next game, so the feature looks absent. | Checked |
| 2 | `player_profiles` | Only 1,000 of 10,692 players have a profile. Header chips, Profile tab and percentiles are empty for the rest. The job needs to run to completion, or the UI must degrade gracefully everywhere. | Checked |
| 3 | Mobile nav | No props entry in the bottom bar; two taps via More. | Checked |
| 4 | Market chips | `h-8` (32px) tap target; below the 44px guidance. | Checked |
| 5 | `PropsPanel` | Every mount does a `no-store` fetch of `/api/props`. Switching away from and back to the tab, if the tab unmounts, refetches. Consider SWR-style caching per player/match for the session. | Suspected (depends on whether `MatchTabs` unmounts inactive panels) |
| 6 | Migrations | Production's migration history has no rows for 0094, 0095, 0096 although their objects exist. The history table and the repo disagree, so `supabase db push` would try to re-apply them. Add them to the history (or repair with `supabase migration repair`) before anyone uses the CLI against production. All three files use `if not exists` / `create or replace`, so a re-run is likely safe, but verify before trusting that. | Checked |
| 7 | Migrations | Numbering was duplicated (two 0091, two 0092). Fixed: ours are now 0097 and 0098. Rule going forward: take the next free number at merge time; two parallel branches collide. | Fixed |
| 8 | Data quality | Docs list known gaps: elite finishers under-projected for goals; passes can disagree widely with SportyBet in lopsided games. Check the shadow record per player before the switch goes on. | Documented in `docs/player-props.md` |
| 9 | Pre-commit hook | One commit attempt failed the pre-commit hook and the retry passed with nothing changed. Possibly a flaky test or a timing issue under load. Worth running the suite a few times in CI to find it. | Suspected |
| 10 | Copy | Props cards show "SportyBet code" (a bookmaker name in product UI). Elsewhere our rule is "booking code", no bookmaker names in marketing. Confirm the policy covers product UI. | Needs a decision |

Typecheck (`npx tsc --noEmit`) and ESLint on the player, team and props files are clean as of this note, and the full suite passed (1,202 tests).

---

## 5. Suggested order of work

1. Decide the photo source (task two, licensing). One conversation, blocks nothing else.
2. Spec the shared header and tab structure (task one) while that is decided.
3. Quick wins from the bug list: always show the Props tab, 44px chips, repair the migration history.
4. Entry points and flow (task three), then events.
5. Avatar component with the chosen source.
6. Screenshots across free, Pro and signed-out at 360 / 390 / 768 / 1280, and a review with the founder.

## 6. Where to read more

- `docs/player-props.md` — markets, pick rules, pipeline, access.
- `docs/props-backtest.md` — how the model was validated.
- `docs/fotmob-match-data.md` — the FotMob data and the live lane.
- `CLAUDE.md` / `AGENTS.md` — this is Next.js 16 with breaking changes; read `node_modules/next/dist/docs/` before writing routes or caching code. Migrations must grant their own tables.
- Team/player read layer: `src/lib/team-page.ts`, `src/lib/player-page.ts` (bounded database functions, one entity per call; do not add anything that pages through the whole set).
