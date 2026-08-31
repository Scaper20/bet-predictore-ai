# Contributing

## Branching

- `Main/Production` is what's live. `dev` is the integration branch — always deployable, always
  green.
- Cut working branches from `dev`, named `<type>/<short-kebab-description>`, e.g.
  `feat/slip-share-image`, `fix/settlement-push-case`. Reuse the commit types below as the branch
  type.
- PR into `dev`. Once `dev` has a batch worth shipping, PR `dev` into `Main/Production` and tag the
  release (`vX.Y.Z`).
- Hotfix exception: a production-breaking bug may branch straight from `Main/Production` as
  `hotfix/*`, and merges back into **both** `Main/Production` and `dev` so the fix isn't lost on
  the next regular release.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint on
`commit-msg`:

```
<type>(<optional scope>): <imperative, present-tense summary>

<optional body — the why, not the what>
```

| Type | Use |
|---|---|
| `feat` | New capability or route |
| `fix` | Bug fix |
| `content` | Copy/wording changes, no logic change |
| `design` | Visual/CSS/layout changes, no logic change |
| `refactor` | Restructuring, no behavior change |
| `test` | Test-only changes |
| `chore` | Tooling, deps, config, CI |
| `docs` | README, comments, docs |

## Project structure

- `src/app/(app)/` is the authenticated/shell route group — every page that renders inside the
  site header/footer belongs there. Marketing (`src/app/page.tsx`), API routes, and admin sit
  outside it deliberately.
- `src/lib/` is organized by domain, not by type — `model/`, `providers/`, `ai/`, `supabase/`,
  `paystack/`. A new concern gets its own folder under `src/lib/`, not a shared `utils.ts`.
- Tests live next to what they test (`fit.ts` next to `model.test.ts`'s siblings). Add a test file
  in the same directory as the module it covers.
- One-off/admin scripts go in `scripts/`, run via `tsx`, and stay out of `src/` — they're not
  application code.

## Before opening a PR

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

All four run in CI on every PR into `dev` or `Main/Production`; running them locally first saves a
round trip.
