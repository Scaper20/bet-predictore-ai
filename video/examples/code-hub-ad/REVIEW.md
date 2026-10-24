# Review: KiqStat Code Hub ad (1080x1080, 45 s)

## v2: motion rebuilt after the Puntrr reference
The person found v1's text "hard and not smooth" and pointed at Puntrr's "Boomsday" post. Measured on
that video at 60 fps (https://x.com/PuntrrAi/status/2113862877123686459): no hard cuts anywhere; each line slides up one line height
from behind a mask in ~0.4 s (quart-out), the next 0.07 s behind; lines leave upward through the mask in
~0.2 s; persistent objects (the kickoff time, the wordmark footer) morph instead of cutting.
v1's titles were the opposite: a 4-frame opacity + blur pop per word, no movement, at 30 fps.
Changes (story, copy, timing slots, music and SFX kept):
- Every title rises line by line through a mask and leaves upward; title swaps flow like a conveyor.
  "Code Hub" rises per letter, the claim per word.
- S01-S03: the whips are gone. The hook card stays put and only its content scrolls (slip -> picks -> chat).
- S04: the hard swap from "There's a smarter way" to "Code Hub" is a conveyor; the tab row unfolds from
  the active pill.
- S05-S07: the tab row never leaves; its active pill slides Today's codes -> Code editor -> Community and
  takes the light theme on the carry. Tab changes push the page sideways.
- S06: the scan card unfolds from under the input, badges wipe in, the safer card slides up as a sheet,
  and the light world floods out from the post box the code lands in (was a grey crossfade).
- Softer UI: Copy -> Copied rolls, clicks and presses ease back, the list sort keeps ours on top, the
  S08 iris now closes exactly on the logo ball (it was 9 px off).
- Rendered at 60 fps (v1: 30) with motion blur on.
Checked: `hyperframes check` ok; strips across every seam and title swap looked at, and 20 frames pulled
from the rendered file. Render: 1080x1080, 60 fps, 45.0 s, 9.7 MB; audio -16.7 LUFS, true peak -1.8 dB, no
clipping (measured, not heard). Since moved into video/kit: build.py regenerates the rendered v2 scenes
byte for byte (checked with cmp), apart from a layout-check attribute since added to the cursor.

## Creative calls
- Followed the person's structure: three relatable questions -> "There's a smarter way" -> Code Hub reveal ->
  Today's codes, Code editor, Community in the rebuilt product UI -> claim -> performed end card.
- One piece of data travels: the stranger's code 7XK2QP from the chat (S03) is the code pasted into the
  editor (S06); its safer version M3ZT8P is the code posted to the community (S07).
- Three worlds: ink (product, the app's dark theme), volt (reveal and claim), chalk (community, the app's
  light theme). Transitions: whips, colour floods, zoom-through a tab, blur swap, carry-across, iris into
  the logo's ball.
- Product UI rebuilt from the app's components (HubTabs, HubCard, CodeEditor, PostCard) at about 1.8x.
  Real labels, except "SportyBet code" -> "Booking code", "SportyBet odds" -> "Odds" and "Get the new
  SportyBet code" -> "New code" (brief: no SportyBet on screen). All games, codes and numbers are
  illustrative; the end card says "Example codes for illustration". The maths in the examples is
  consistent (8% -> 24% = one pick 25% -> 74%; fair odds 4.22 = 1/0.237).
- Music: HeyGen catalog track 2b7f3438 (afro-pop, 120 BPM, -13 LUFS body). Started 1.505 s into the file
  so its quiet intro sits under the hook, its two intro hits land on the whips (2.5 s, 4.5 s) and the
  beat drops at 6.5 s as the volt flood starts. Cuts and clicks placed on beats: 8.5 Code Hub slam,
  10.5 tab click, 17.0 Copy, 18.5 editor, 20.5 Make it safer, 26.5 safer card (payoff, riser into it),
  33.0 the sort, 38.5 claim, 42.0 the logo ball (impact). Bed at 0.62, 1.5 s fade-out.
- 37 SFX (Pixabay-licensed bundled set + HeyGen SFX catalog), each placed so its peak lands one frame
  after its picture; whooshes and pops rotate between 2-3 different files.

## Measured vs looked at
- `hyperframes check`: ok. Snapshot review sheets (beats, 8 seams, phone width) looked at; fixed: the
  card overlap on Today's codes, crop-heavy punch-ins (S05, S06, S07), the claim wrapping to 3 lines, the
  scan card showing under the safer card, the S07 title pushed off screen, an invisible iris in the last
  3 frames of S08, and the carry-across now lands in the Post box.
- Sound was measured (placement, file peaks, loudness of the bed), not heard. Nobody has listened to the
  mix.

## Warnings kept on purpose
- text_below_floor: secondary labels (badges, small caps field labels, team names) at 24-26 px; the
  reading line of every shot (titles, picks, numbers) is 28 px or more.
- line_unread: the input placeholder "Booking code, e.g. 5CKNWH" is replaced by typing after 0.4 s; it is
  UI texture, not a line to read.
- (v2) line_unread on #s06-post "M3ZT8P" at the S06 end may appear on some runs: that box continues as S07's
  post box, so it is on screen for 7 s.

## Weakest shot / with more time
- S02 ("Not sure which pick is risky?") is the least eventful: a scanner over five rows. With more time,
  make one row's badge flicker between Strong / Fair / Risky before settling on "?".
- The community sort could show the model "scoring" each post (a small chance number counting up).
