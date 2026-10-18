#!/usr/bin/env bash
# Downloads and checks (size-complete set, SHA-256 against each .sha256) the Windows setup program and narration-utils.exe (unpacked from the zip) of two published releases for the Windows release-gate workflows.
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
  # Download every asset, then check the set against the .sha256 files the release workflow wrote (scripts/release/assets.mjs, the
  # check promote runs) before anything is unpacked or run. A mismatch, a missing file or an extra file fails the job.
  gh release download "$tag" --dir "$dir/$sub"
  version=${tag#v}; version=${version%-rc}
  node "$(dirname "$0")/assets.mjs" verify "$dir/$sub" "$version"
  # Relative paths: GNU tar (Git for Windows) reads "D:\..." as host D, and cannot read zips; PowerShell can.
  (cd "$dir/$sub" && powershell -NoProfile -Command "Expand-Archive -Force -Path (Get-ChildItem -Filter '*-windows-x64.zip').FullName -DestinationPath .")
  test -f "$dir/$sub/narration-utils.exe"
  ls -l "$dir/$sub"
done
echo "NEW_TAG=$new_tag"
echo "PREVIOUS_TAG=$previous_tag"
if [ -n "${GITHUB_ENV:-}" ]; then { echo "NEW_TAG=$new_tag"; echo "PREVIOUS_TAG=$previous_tag"; } >> "$GITHUB_ENV"; fi
