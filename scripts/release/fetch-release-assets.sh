#!/usr/bin/env bash
# Downloads the Windows setup program and narration-utils.exe (unpacked from the zip) of two published releases for the Windows release-gate workflows.
#
#   fetch-release-assets.sh <dir> [new-tag] [previous-tag]
#
# With no tag the newest release is "new" and the one before it "previous" (candidates count: the repository publishes release
# candidates first). Needs GH_TOKEN and GH_REPO. Writes <dir>/new/ and <dir>/previous/ and prints NEW_TAG=, PREVIOUS_TAG= lines
# (appended to $GITHUB_ENV when set).
set -euo pipefail
dir=${1:?directory}
new_tag=${2:-}
previous_tag=${3:-}
mkdir -p "$dir/new" "$dir/previous"
if [ -z "$new_tag" ] || [ -z "$previous_tag" ]; then
  mapfile -t tags < <(gh release list --limit 20 --json tagName --jq '.[].tagName')
  [ -n "$new_tag" ] || new_tag=${tags[0]}
  if [ -z "$previous_tag" ]; then
    for i in "${!tags[@]}"; do
      if [ "${tags[$i]}" = "$new_tag" ]; then previous_tag=${tags[$((i + 1))]:-}; fi
    done
  fi
fi
[ -n "$new_tag" ] && [ -n "$previous_tag" ] || { echo "::error::could not resolve two releases (new='$new_tag' previous='$previous_tag')"; exit 1; }
for pair in "new:$new_tag" "previous:$previous_tag"; do
  sub=${pair%%:*}; tag=${pair#*:}
  # The program is not a release asset of its own; it is the one file in the zip.
  gh release download "$tag" --dir "$dir/$sub" --pattern '*-windows-x64-setup.exe' --pattern '*-windows-x64.zip'
  tar -xf "$dir/$sub"/*-windows-x64.zip -C "$dir/$sub" narration-utils.exe
  ls -l "$dir/$sub"
done
echo "NEW_TAG=$new_tag"
echo "PREVIOUS_TAG=$previous_tag"
if [ -n "${GITHUB_ENV:-}" ]; then { echo "NEW_TAG=$new_tag"; echo "PREVIOUS_TAG=$previous_tag"; } >> "$GITHUB_ENV"; fi
