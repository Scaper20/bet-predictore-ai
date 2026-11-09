#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = skip this build, exit 1 = build. Every build costs Build CPU minutes
# (2,256 minutes, $6.39 on the October invoice), so skip the ones nobody uses:
#   - branches other than Main/Production and dev (their previews went unused);
#   - commits that change only docs, reports, the video kit or CI config, which
#     do not change the site.
# When in doubt (no parent commit to compare with), build.
set -u
branch="${VERCEL_GIT_COMMIT_REF:-}"
case "$branch" in
  Main/Production|dev) ;;
  *) echo "Skipping build: branch '$branch' is not Main/Production or dev"; exit 0 ;;
esac
if ! git rev-parse --verify --quiet HEAD^ >/dev/null; then
  echo "No parent commit to compare with; building"; exit 1
fi
if git diff --quiet HEAD^ HEAD -- . \
  ':(exclude)docs' ':(exclude)video' ':(exclude).github' \
  ':(exclude)*.md' ':(exclude)scripts/investor-projection.py'; then
  echo "Skipping build: only docs or non-site files changed"; exit 0
fi
echo "Site files changed; building"; exit 1
