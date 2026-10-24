---
name: kiqstat-video
description: Make or edit a KiqStat video (ad, teaser, launch film, explainer, social clip, Reel/TikTok) in the house style with the video kit in video/. Use whenever a KiqStat video, motion graphic or animated post is asked for, together with the hyperframes skill.
---

# KiqStat video

KiqStat has a house style for video, approved on the Code Hub ad. Build every KiqStat film with it
so they look like one brand and take a fraction of the time.

1. Read `video/DESIGN.md` (the style and its numbers) and skim `video/examples/code-hub-ad/` (the
   reference: `build.py`, `SPEC.md`, `STORYBOARD.md`, `REVIEW.md`). Load the `hyperframes` skill for
   the render contract and the work loop; this skill only adds the brand layer.
2. Agree the brief as usual (format, length, story, audio). Defaults: 1:1 for X and Instagram feeds,
   9:16 (`--format portrait`) for Reels, TikTok and WhatsApp Status; music + SFX, text only; the
   product's real UI rebuilt from its components.
3. Start the project: `python3 video/new.py <name> --format <square|portrait|landscape>`. It writes
   `video/projects/<name>/build.py` from the starter and a working HyperFrames project around it.
4. Write the film in `build.py` with the kit: titles with `title()` + `rise()` / `leave()` (never a
   fade or blur-in on its own), hero words with `letters()` + `riseEach()`, the tab row with `tabs()`
   + `tab_to()`, badges with `wipe()`, cursor with `CURSOR` + `cursorPath()` / `click()` / `press()`,
   and close with `claim_scene()` + `endcard_scene()`. Keep a frame on screen across seams (card stays
   while content scrolls; tab row persists) and change worlds only with a flood or iris from a cause.
5. Music from the HeyGen catalog into `assets/bgm/` (video/README.md, Sound); SFX from `kit/sfx`
   placed with the `SFX` table (peak lands one frame after the picture).
6. `python3 build.py`, `npx hyperframes check`, snapshot strips across every seam and title swap, fix,
   then `npx hyperframes render -q delivery --fps 60`. Pull a contact sheet from the MP4 before
   sending it, and say that the sound was measured, not heard.
7. If the film adds a pattern worth reusing (a new component or transition), move it into
   `video/kit/kiqstat_video.py` and note it in `video/DESIGN.md`.

Copy rules that always hold: no promise of winning, no bookmaker names on screen ("booking code"),
example codes marked as illustrative on the end card, 18+.
