---
name: KiqStat video style
version: 1
source: KiqStat brand (src/app/globals.css, public/brand) + motion measured from the Puntrr "Boomsday" reference (X, 60 fps), first built in video/examples/code-hub-ad
colors:
  ink: "#07090B"          # ink world ground; type on volt
  shell: "#0B0E0D"        # card gradient end
  surface: "#0F1513"      # card gradient start
  surface-2: "#151C19"    # inputs, bubbles, fair badge
  line: "#1E2723"         # borders, row rules
  line-2: "#2E3A34"       # stronger borders, pending dots
  chalk: "#F2F4EC"        # type on ink
  muted: "#97A39C"        # secondary type on ink
  dim: "#6B7670"          # tertiary, placeholders
  volt: "#D4FF3A"         # the one accent: highlighted word, Strong, primary button, volt world ground
  risky: "#FF4D6D"        # verdict colour, lost legs
  cant-read: "#FFB020"    # verdict colour, unknowns, "was" notes
  light-ground: "#F4F5EF" # chalk world (the app's light theme)
  light-line: "#E1E4DA"
  light-muted: "#4C5650"
  light-dim: "#78827C"
  olive: "#4F6B00"        # accent in the chalk world (volt is unreadable on light)
typography:
  display: { family: "Unbounded", weight: 800, size: "64-88px titles, 172px hero", tracking: "-0.025em (hero -0.04em)", line-height: 1.08 }
  ui: { family: "Space Grotesk", weights: [500, 700], size: ">= 28px reading, 24-26px labels" }
  numbers: { family: "IBM Plex Mono", weight: 500, codes-tracking: "+0.12em" }
spacing:
  frame-margin: "72px UI, 96px titles (square 1080)"
  card-radius: "24px, 2px border"
  pill-radius: "999px"
components:
  title: "Unbounded 800, each line in a mask (.ln/.li); one accent word in volt (olive on chalk)"
  card: "linear-gradient(180deg, #0F1513, #0B0E0D), 2px #1E2723 border, radius 24"
  badge: "pill, 2px border, 26px bold: Strong volt / Fair muted / Risky rose / amber"
  tabs: "Today's codes / Code editor / Community, active fill is one sliding pill"
  cursor: "60px ink arrow with chalk outline"
  end-card: "performed lockup (ring, needle, ball, wordmark) + one line + volt button + 18+ footer"
---

# KiqStat video style

What every KiqStat film is: football fans see their own habit in the first seconds, then watch the
real product do something useful, in motion that never stops and never cuts hard. The approved
reference is `examples/code-hub-ad` (the Code Hub ad, v2). The kit in `kit/kiqstat_video.py` holds
everything below as code; this file is the why and the numbers.

## Worlds

Three grounds, each with a job. Change world only with a cause on screen (a flood from a bubble, a
button, the spot where an object lands; an iris onto the logo's ball). Worlds never crossfade.

- **Ink** (`#07090B`): the product, the app's dark theme. Volt only on the one highlighted word, Strong
  badges, the primary button.
- **Volt** (`#D4FF3A`, flat, no gradient): reveals and the claim. Ink type.
- **Chalk** (`#F4F5EF`): the app's light theme, for community and social proof. Olive accent.

No grain, vignette, glow, glass, particles or purple gradients. Every UI shot fills at least 70% of
the frame: the product's own components rebuilt at about 1.8x phone size, real labels only.

## Motion: the house grammar

Measured frame by frame on the reference at 60 fps, then tuned in the Code Hub ad.

- **Titles rise through a mask, line by line.** yPercent 130 -> 0, 0.62 s `power4.out`, next line 0.08 s
  behind (the reference travels one line height in ~0.4 s, 90% done by 0.17 s). Text never fades or
  blurs in on its own. Kit: `title()` + `rise()`.
- **Titles leave upward through the same mask.** yPercent 0 -> -130, 0.28 s `power3.in`, lines 0.045 s
  apart. The next title rises 0.25 s after the leave starts, so copy flows upward like a conveyor.
  Kit: `leave()`.
- **Hero words per letter** (0.04 s apart), **claims per word** (0.07 s apart), inside the line masks.
  Kit: `letters()` + `riseEach()`.
- **Landed text is dead still.** The motion moves to the next element, the camera or the UI.
- **Persistent objects instead of cuts.** Keep a frame on screen while its content changes: a card
  that stays while its rows scroll (out y -300 in 0.33 s `power3.in`, in from below 0.62 s
  `power4.out`, 0.045 s apart); a tab row whose active pill slides (0.42 s `power3.inOut`, kit
  `tab_to()`); an object carried into the next scene that lands in its new home.
- **UI moves**: a page push for tab changes (out x -760 `power3.in`, in from x +760 `power4.out`), a
  card that unfolds (clip inset, 0.75 s `power4.out`), a sheet that slides up over the last card,
  badges that wipe in left to right (0.42 s, kit `wipe()`), labels that roll through a mask
  (Copy -> Copied), clicks that ease back (kit `click()`, `press()`).
- **Camera** pushes 0.7-0.8 s `power3.inOut`; floods 0.35-0.5 s `power2.inOut`; the zoom through a
  button 0.4 s `power3.in`.
- **Render at 60 fps** with `data-motion-blur="on"` on the root. Turn blur off on a subtree whose
  elements slide behind each other (`data-motion-blur="off"`), or the blurred copies draw on top.

Transitions used and approved: card stays / content scrolls, title conveyor, colour flood from a
cause, zoom through a tab, tab pill + page push, sheet over, carry across + flood from the landing
spot, iris onto the logo's ball. Hard cuts only inside a scene.

## Copy

- Short lines, one or two per title, 64-88 px, max two lines. One accent word that carries meaning.
- Hook as questions in the fan's own voice ("One game cut your code again?"), then a turn
  ("There's a smarter way"), then the product doing it, then a claim, then the end card.
- No promise of winning, no "Introducing", "unlock", "seamless", "game-changer". No bookmaker names on
  screen ("booking code", not "SportyBet code"). Every game, code and number is an illustrative
  example and the end card says so, with 18+.

## Sound

- Music + effects, no voiceover unless asked; every word is on screen (feeds play muted).
- Bed: an upbeat track around 120 BPM from the HeyGen catalog (the Code Hub ad uses `2b7f3438`
  "modern energetic afro-pop beat", entered 1.505 s in), volume 0.8, 1.5 s fade-out. Land the drop on
  the reveal, cuts on beats, layout changes on bars (15 frames a beat at 30 fps, 30 at 60).
- Effects from `kit/sfx` (see its CREDITS.md), each placed so its peak lands one frame after its
  picture (kit `audio_tags()` does the maths and the lanes): key-press per tick, thud on a loss,
  whooshes on scrolls and floods, pops on badges and messages, click / click-sharp on taps, a riser
  into the payoff, impact-bass on the logo ball.
- Target about -16 to -17 LUFS integrated, true peak under -1.5 dB; check with
  `npx hyperframes audio <file> --json`.

## Do / Don't

- Do start on a full first frame (thumbnail): title and product visible at 0 s.
- Do keep one piece of data travelling through the film (the stranger's code is the code we check).
- Do keep reading text at 28 px or more; 24-26 px only for UI labels.
- Don't fade-and-slide every element, don't pulse or breathe anything, don't drift titles after they
  land, don't add click rings, don't dock the logo in a corner.

## QA before render

`npx hyperframes check` clean (the kit's small UI labels and placeholder flashes are the only
expected warnings); snapshot strips across every seam and title swap
(`npx hyperframes snapshot --range A,B --frames 12`); then
`npx hyperframes render -q delivery --fps 60` and pull a contact sheet from the MP4.
