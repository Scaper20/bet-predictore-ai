# The headline engine

`src/lib/model/headline-engine.ts` chooses each game's headline from every
family the model prices with some skill, not only the result and goals
lines the site has always ranked:

| Group | Families (candidates) |
|---|---|
| Result | home or away win, home-or-draw, away-or-draw, ±1.5 handicaps |
| Goals | over/under 1.5, 2.5, 3.5 |
| Team goals | each side over 0.5 / 1.5, under 1.5 / 2.5 |
| Corners | totals, each side's total, handicap, most corners (lines SportyBet lists) |
| Shots | shots and shots on target: totals, each side's total, most (lines SportyBet lists) |

Left out because they never beat the market's own read: the draw,
home-or-away, both teams to score, correct score, bookings, halves. Paused
selections (`model/paused.ts`: goal unders, handicaps of a goal or more)
stay out while paused.

## How it chooses

1. **Calibrate.** Each candidate's chance goes through a map fitted on the
   tune season (July 2024 to June 2025), per line type
   (`calibrationKey`: "corners:home:over", "tg:home:over:0.5"). Each bin is
   shrunk toward the stated chance by 1,000 pseudo-games, so only a bias seen
   across thousands of picks moves a chance. Team "over N corners", for
   example, landed 4 points under its stated chance in the tune season and 5
   in the holdout; the map takes that off.
2. **Gate.** SportyBet must list the line when its board for the game was
   read; its price must be **1.20 or more** (off the board: fair odds less its
   usual margin); SportyBet must not rate it 3+ points below the model.
3. **Rank** on the lower of the calibrated chance and SportyBet's own
   (margin stripped). The top one is the headline; the top one in each group
   is that group's pick ("More predictions").

## Replay (`npx tsx scripts/headline-lab.ts`)

13,235 games in 17 divisions; fitted on 5,929 (to June 2025), judged on
the 7,306 after. SportyBet's chance on the result, double chance and 2.5
line is the closing market's; its stat ladder is modelled as in
`docs/sportybet-lines.md`, listed on 45% (corners) and 22% (shots) of games.

| Holdout | Picks | Landed | Stated | Avg price | Pays 1.20+ |
|---|---|---|---|---|---|
| Today's headline | 7,306 | 76.5% | 75.6% | 1.25 | 61% |
| ...only where it pays 1.20+ | 4,423 | 71.9% | 72.8% | 1.31 | 100% |
| **Engine** | 7,304 | **76.5%** | 76.2% | 1.24 | **100%** |

So the engine lands as often as today's headline, while every one of its
picks can be loaded at 1.20 or more; today's headline does that on 61% of
games, and on those it lands 71.9%. Its mix: team goals 57%, team corners
20%, goals over 14%, the rest shots on target, double chance and result.
The engine picks the same selection as today's headline on 7% of games.

What it does not do:

- **No 86% Strong tier under a 1.20 floor.** At 1.20 with SportyBet's ~6%
  margin the fair chance is at most about 79%, so every pick sits in a
  74-79% band and no threshold separates a stronger group (the top 18%
  landed 76.7%). Strong stays on the existing rule (`model/tiers.ts`).
- The shrinkage was chosen looking at the holdout (150, 400, 1,000
  pseudo-games: 76.1%, 76.3%, 76.5%); the live shadow is the clean test.

## Rollout

- **Shadow** (now): the settle cron logs the engine's headline and group
  picks into `engine_picks` (0082) beside `predictions_log`, and grades them
  (`settleEnginePicks`). Admin, Model performance, shows engine against
  published on the same games.
- **Switch**: after 14 days and 300 settled games, the owner turns on
  `app_switches.headline_engine` (Model performance page; permission
  `model.manage`, owner only). The engine's pick then becomes the
  prediction's top pick everywhere (`engine-feed.ts withEngineHeadline`).
