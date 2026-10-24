#!/usr/bin/env python3
"""Start a new KiqStat film from the video kit's starter.

    python3 video/new.py my-film                      # square 1080x1080 in video/projects/my-film
    python3 video/new.py my-film --format portrait    # 1080x1920 (Reels, TikTok, Status)
    python3 video/new.py my-film --format landscape --dir /path/to/folder

It writes <dir>/build.py (the starter, ready to edit) and runs it once, so the folder is a working
HyperFrames project straight away: brand assets, SFX palette, DESIGN.md, compositions/, index.html.
"""
import argparse
import os
import re
import subprocess
import sys

VIDEO = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(VIDEO, "kit")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", help="project name, e.g. weekend-codes-teaser")
    ap.add_argument("--format", choices=["square", "portrait", "landscape"], default="square")
    ap.add_argument("--dir", help="where to create it (default: video/projects/<name>)")
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", a.name):
        sys.exit("name: lowercase letters, digits and dashes only")
    root = os.path.abspath(a.dir or os.path.join(VIDEO, "projects", a.name))
    build = os.path.join(root, "build.py")
    if os.path.exists(build):
        sys.exit(f"{build} already exists; edit it and run it instead")
    os.makedirs(root, exist_ok=True)
    src = open(os.path.join(KIT, "starter.py")).read()
    src = src.replace("__KIT__", KIT).replace("__FORMAT__", a.format).replace("__NAME__", a.name)
    open(build, "w").write(src)
    subprocess.run([sys.executable, build], check=True)
    print(f"""
Created {root}
Next:
  1. Edit COPY and the scenes in build.py (style rules: video/DESIGN.md), then: python3 build.py
  2. cd {root} && npx hyperframes check
  3. npx hyperframes snapshot --range 2.4,3.4 --frames 12   (look at every seam)
  4. npx hyperframes render -q delivery --fps 60 -o renders/{a.name}.mp4""")


if __name__ == "__main__":
    main()
