# KiqStat videos

Everything needed to make a KiqStat film in the house style with [HyperFrames](https://hyperframes.heygen.com)
(HTML + GSAP rendered to MP4).

| Path | What it is |
| --- | --- |
| `DESIGN.md` | The style: colours, type, the three worlds, the measured motion grammar, transitions, copy and sound rules, QA. HyperFrames reads it as the project's design spec. |
| `kit/kiqstat_video.py` | The style as code: brand CSS, motion helpers (`rise`, `leave`, `riseEach`, `wipe`, `cursorPath`, `click`, `press`), components (`title`, `letters`, `tabs`, `tab_to`, `CURSOR`, `claim_scene`, `endcard_scene`), `prepare()` and `build_index()` with SFX placement. |
| `kit/starter.py` | A 17.7 s starter film: hook question over a product card, volt reveal, the product at work, claim, end card. Square, portrait or landscape. |
| `kit/sfx/` | The effects palette (see its CREDITS.md). Fonts come from `assets/fonts`, brand marks from `kit/brand`. |
| `new.py` | Starts a project from the starter. |
| `examples/code-hub-ad/` | The approved reference: the Code Hub ad (45 s, 1:1, 60 fps), with its spec, storyboard and review. |

## Make a new film

```bash
python3 video/new.py weekend-codes --format portrait     # square | portrait | landscape
cd video/projects/weekend-codes
# edit COPY and the scenes in build.py, then:
python3 build.py
npx hyperframes check
npx hyperframes snapshot --range 2.4,3.4 --frames 12        # look at every seam and title swap
npx hyperframes render -q delivery --fps 60 -o renders/weekend-codes.mp4
```

Projects keep only `build.py` and their `.md` notes in git; everything else is regenerated
(`video/.gitignore`). Rebuild the reference with `python3 video/examples/code-hub-ad/build.py`.

Before a new film: write a short SPEC.md (goal, format, length, shots with times) and a storyboard,
and reuse the patterns in the reference rather than inventing new motion.

## Sound

Effects ship in `kit/sfx`. Music comes from the HeyGen catalog (free with the HeyGen CLI login):

```bash
heygen auth login                                   # once per machine (the media-use skill covers it)
heygen audio sounds list --query "energetic afro-pop beat" --type music --limit 5 --human
# each result carries its audio URL: curl it to assets/bgm/bed.mp3 (the starter mixes it in at 0.8)
```

The Code Hub ad uses catalog track `2b7f3438` ("modern energetic afro-pop beat", 120 BPM) at
`assets/bgm/afro-pop-120.mp3`, entered 1.505 s in. Audio files are not committed.
