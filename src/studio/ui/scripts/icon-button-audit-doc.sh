#!/bin/sh
# Rebuilds the table of docs/research/2026-11-icon-button-audit.md against the tree before the change.
# usage: sh scripts/icon-button-audit-doc.sh <base-commit>   (run from src/studio/ui; needs a clean worktree path)
set -e
base=${1:?base commit}
tmp=$(mktemp -d)
node scripts/icon-button-audit.mjs --json 2>/dev/null > "$tmp/post.json"
git worktree add -q "$tmp/pre" "$base"
cp scripts/icon-button-audit.mjs scripts/iconButtonAudit.mjs "$tmp/pre/src/studio/ui/scripts/"
ln -sfn "$PWD/node_modules" "$tmp/pre/src/studio/ui/node_modules"
(cd "$tmp/pre/src/studio/ui" && node scripts/icon-button-audit.mjs --md --after="$tmp/post.json" 2>/dev/null)
git worktree remove --force "$tmp/pre"
