# KiqStat Code Hub ad: spec

GOAL:    A football fan who books codes feels "that's me" in the first 7 s, then sees, in the
         real product, that KiqStat reads any code before they book it. They leave knowing
         the three tabs (Today's codes, Code editor, Community) and the address kiqstat.app.

OUTPUT:  HyperFrames, 1080 x 1080, 60 fps (v2; v1 was 30). 1:1 for the X and Instagram feeds. Plays muted:
         every word is on screen; music and effects only add energy.

TIME:    45 s x 30 = 1350 frames. Planned on a 120 BPM grid: 15 frames a beat, 60 frames a
         bar (2 s). Cuts land on beats, layout changes on bars; re-timed to the real track
         once one is picked.

LOOK:    The brand's own, three worlds:
         - Ink world (product): ground #07090B, cards #0F1513 -> #0B0E0D, lines #1E2723 /
           #2E3A34, ink #F2F4EC, muted #97A39C, dim #6B7670. Volt #D4FF3A only on: the one
           highlighted word per title, Strong badges, the primary button, the end card.
           Verdict colours as the app: Risky #FF4D6D, Can't read #FFB020.
         - Volt world (reveal, claim): flat #D4FF3A ground, ink #07090B type. No gradient.
         - Chalk world (community, the app's light theme): ground #F4F5EF, cards #FFFFFF,
           lines #E1E4DA, ink #07090B, muted #4C5650, brand olive #4F6B00. Card shadow
           0 24px 60px -24px rgba(7,9,11,.35).
         Type: display Unbounded ExtraBold, titles 64-84 px (6-8% of frame), tracking -2.5%,
         max 2 lines. UI and body Space Grotesk Medium/Bold, UI text >= 28 px. Codes and
         numbers IBM Plex Mono Medium, codes tracked +0.12em.
         Medium: the product UI itself, rebuilt from the app's components at ~1.8x their
         phone size (card radius 24 px, 2 px borders). No grain, no vignette, no glow.

OBJECTS: - Booking slip: a card of 5 games, each a row with a status dot (grey pending, volt
           landed, rose lost), pick label, "Home v Away", price.
         - Chat thread: 3 incoming grey bubbles from strangers, each holding a 6-character
           code in mono. Generic chat, no app branding.
         - Code Hub tabs: the real pill row "Today's codes / Code editor / Community",
           active pill volt with ink text.
         - Today's code card (real HubCard): tier label BALANCED 5 in mono volt, blurb "The
           everyday combo", big odds 5.12, "4 games · model chance 24% (1 in 4)", 4 legs,
           code box "Booking code K7Q2MX" + Copy.
         - Code editor (real CodeEditor): code input, "Make it safer" volt button, scan card
           (code, "5 of 5 games read", "As it is: chance 9%", 5 rows with % + verdict badge),
           safer card ("Safer version · 1 changed", "Edited: chance 17%", "was Over 3.5").
         - Community (real PostCard): rank numeral, code in mono, "Ada · 14 landed, 6
           missed", "Well priced" badge, Games / Odds / Our chance, "Copy code".
         - Cursor: a 56 px ink arrow with chalk outline (5% of frame), enters from off frame.
         - KiqStat mark: ring (chalk), needle and ball (volt), from assets/brand/mark.svg.
         Every game, code and number is an illustrative example; the end card says so.

MOTION:  v2, after the person's reference (Puntrr "Boomsday", X, 1080x1080 60 fps), measured frame by
         frame at 60 fps:
         - Titles rise line by line from behind a mask (overflow-hidden line box): yPercent 130 -> 0,
           0.62 s power4.out (reference: one line height in ~0.4 s on a quart-out curve, 90% done by
           0.17 s), next line 0.08 s behind. Never a fade-in, never a blur-in on its own.
         - Titles leave upward through the same mask: yPercent 0 -> -130, 0.28 s power3.in, lines
           0.045 s apart (reference ~0.2 s). The next title rises as the last line clears (+0.25 s),
           so text flows upward like a conveyor. Landed titles are dead still.
         - Hero words per letter (Code Hub, 0.04 s apart); the claim per word (0.07 s apart), both
           inside their line masks.
         - Persistent objects instead of cuts: the hook card frame stays put S01-S03 while its content
           scrolls (y -300 out in 0.33 s power3.in, rows rise in 0.62 s power4.out, 0.045 s apart);
           the tab row persists S05-S07 and its active fill is one pill sliding between tabs
           (0.42-0.45 s power3.inOut), restyling to the light theme on the carry.
         - UI: card push for tab changes (out x -760 power3.in, in from x +760 power4.out); the scan card
           unfolds (clip inset, 0.75 s power4.out); the safer card slides up as a sheet over it; badges
           wipe in left to right (clip, 0.42 s power4.out); Copy -> Copied rolls through a mask.
         - Camera pushes 0.7-0.8 s power3.inOut; floods power2.inOut 0.35-0.5 s from a cause on screen.
         - Rendered at 60 fps with data-motion-blur on the root (the reference is 60 fps).

SHOTS:
  S01 hook-cut     0.0-2.4  (f0-72)    Slip on screen at frame 0; dots fill volt one per beat
                   half; the 5th flips rose on 1.6 s with a 2-frame jolt. Reads "One game cut /
                   your code again?" (0.2-2.3). Sound: tick per dot, low thud on the rose.
                   Hand-off: whip left.
  S02 hook-risky   2.4-4.6  (f72-138)  The 5 pick labels with "?" badges; title "Which pick was /
                   the risky one?" with "risky" rolling through pick names. Reads 2.5-4.5.
                   Sound: roll ticks. Hand-off: whip up into the chat.
  S03 hook-blind   4.6-6.8  (f138-204) 3 stranger bubbles stack in, codes in mono; title
                   "Copying codes from / strangers, blind?" (blind in volt). Reads 4.7-6.7.
                   Sound: 3 message pops. Hand-off: colour flood from the last bubble.
  S04 reveal       6.8-11.0 (f204-330) Volt flood; "There's a smarter way" per word (6.9-8.4);
                   cut on the bar to "Code Hub" huge + "by KiqStat" (8.4-9.4); the real tab
                   row lands under it (9.4-11.0). Sound: music opens fully here, whoosh on
                   flood. Hand-off: cursor clicks "Today's codes", zoom through the pill.
  S05 todays       11.0-18.5 (f330-555) Ink world. Title "Fresh codes / every morning" (11.2-
                   13.2) over the card building row by row; punch-in on the odds 5.12 and model
                   chance (13.4-15.4); title swaps to "Built on the model's / strongest reads"
                   (15.4-17.2); cursor taps Copy -> "Copied" (17.4). Sound: pops per row, click
                   on Copy. Hand-off: tab row slides in, cursor clicks "Code editor" (morph).
  S06 editor       18.5-31.0 (f555-930) "Paste any code" (18.7-20.2): input types 7XK2QP (the
                   chat's code). Cursor clicks "Make it safer" (20.6). Scan card builds, verdict
                   badges pop: Strong, Fair, Strong, Risky, Fair; title "See every pick's read"
                   (21.4-24.0). Punch-in on the Risky row, Over 3.5 at 21% (24.0-25.6). Safer
                   card slides over: Over 3.5 -> "Home or Draw 74%", "was Over 3.5", chance 9% ->
                   17% count-up; title "Make it safer / in one tap" (25.8-28.6). Hold the
                   payoff 28.6-31.0. Sound: key ticks on typing, click, pop per badge, riser
                   into the safer card. Hand-off: the safer card carries across into the next
                   world.
  S07 community    31.0-38.5 (f930-1155) Chalk world. The code drops into "Post my code"
                   (31.0-32.4, click). The list sorts: our post lands at rank 1 among 3; title
                   "Post it. The model / ranks it." (32.6-35.0). Punch-in on "Ada · 14 landed,
                   6 missed" + "Well priced"; title "Every poster's / record, counted"
                   (35.2-37.6). Sound: click, whoosh on the sort, pop on the badge. Hand-off:
                   colour flood to volt.
  S08 claim        38.5-41.5 (f1155-1245) Volt ground: "Read every code / before you book it"
                   grey -> ink per word (38.6-40.4), holds to 41.5. Sound: bed lifts.
                   Hand-off: the volt shrinks into the mark's ball (object becomes the world,
                   reversed).
  S09 endcard      41.5-45.0 (f1245-1350) Ink ground. The mark is performed: the ring draws
                   (0.35 s), the needle swings in, the volt ball drops onto it; the wordmark
                   wipes in beside it (lockup 30% of frame width). "Code Hub · kiqstat.app" and
                   a volt button "Check any code free" land (42.6); footer "18+ · Example codes
                   for illustration" (dim). Hold 42.8-45.0. Sound: impact on the ball drop,
                   bed ends on the bar with a 1.5 s fade.

BANNED:  glow, bloom, particles, mesh or purple gradients, glass; small UI floating in an
         empty dark frame (every UI shot fills >= 70% of the frame); everything fading and
         sliding up; titles drifting after they land; breathing/pulsing loops; text that fades or blurs in without moving (v2); click rings;
         the logo docked in a corner; "Introducing", "unlock", "seamless", "game-changer";
         any promise of winning; the word "SportyBet" on screen (the landing page says
         "code"); a made-up feature or label not in the app.

QA:      f0 (thumbnail: slip + title readable), 1.7 s (rose dot), 3.5 s, 5.8 s, 7.8 s, 10.4 s
         (tabs readable), 14.4 s, 17.6 s (Copied), 22.8 s (all badges), 27.5 s (safer card,
         17%), 33.8 s (rank 1), 36.4 s (record), 40.0 s (claim), 43.8 s (end card). Each: text
         >= 28 px, inside title-safe 108 px margins, one accent word.
