#!/bin/sh
# Rebuilds the totals, the per-group table and the row table of docs/research/2026-11-icon-button-audit.md against the tree before
# the series began, so `converted` counts every PR of the series so far.
# usage (from src/studio/ui): sh scripts/icon-button-audit-doc.sh [base-commit]   (default 38d00e1, the tree #2836 was filed against)
set -e
base=${1:-38d00e1}
tmp=$(mktemp -d)
doc=../../../docs/research/2026-11-icon-button-audit.md
node scripts/icon-button-audit.mjs --json 2>/dev/null > "$tmp/post.json"
git worktree add -q "$tmp/pre" "$base"
cp scripts/icon-button-audit.mjs scripts/iconButtonAudit.mjs "$tmp/pre/src/studio/ui/scripts/"
ln -sfn "$PWD/node_modules" "$tmp/pre/src/studio/ui/node_modules"
(cd "$tmp/pre/src/studio/ui" && node scripts/icon-button-audit.mjs --md --after="$tmp/post.json" 2>/dev/null) > "$tmp/table.md"
git worktree remove --force "$tmp/pre"
python3 - "$tmp/table.md" "$doc" <<'PY'
import collections, re, sys
new = open(sys.argv[1]).read()
totals, rest = new.split('\n', 1)
g = collections.defaultdict(collections.Counter)
for line in rest.split('\n'):
    if line.startswith('| `'):
        c = [x.strip() for x in line.split(' | ')]
        g[c[0].strip('| `').split('/')[0]][c[4]] += 1
order = sorted(g.items(), key=lambda kv: -(kv[1]['converted'] * 100 + kv[1]['convert (queued)'] + kv[1]['decide (queued)']))
rows = '\n'.join(f"| {k} | {v['converted']} | {v['convert (queued)']} | {v['decide (queued)']} | {v['keep']} |" for k, v in order)
d = open(sys.argv[2]).read()
d = re.sub(r"## Totals\n\n.*?\n\nPer page group", lambda m: "## Totals\n\n" + totals + "\n\nPer page group", d, flags=re.S)
d = re.sub(r"(\| - \| - \| - \| - \| - \|\n).*?\n\n## Plan", lambda m: m.group(1) + rows + "\n\n## Plan", d, flags=re.S)
d = d[:d.index("## The table")] + "## The table\n\n" + rest
open(sys.argv[2], 'w').write(d)
PY
rm -rf "$tmp"
