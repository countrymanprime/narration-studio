#!/usr/bin/env bash
# Benchmark Python vs Go on a session file: 5 runs each under /usr/bin/time -v, median reported.
# usage: bench.sh [SESSIONS.jsonl]   (default data/corpus.jsonl)
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
P=/home/user/narration-studio/.venv/bin/python
IN="${1:-$S/data/corpus.jsonl}"
export PYTHONDONTWRITEBYTECODE=1
mkdir -p "$S/out/bench"
for i in 1 2 3 4 5; do
  /usr/bin/time -v "$P" "$S/py/run.py" replay "$IN" "$S/out/bench/py_$i.jsonl" 2> "$S/out/bench/py_$i.time"
  /usr/bin/time -v "$S/go-tracker" replay "$IN" "$S/out/bench/go_$i.jsonl" 2> "$S/out/bench/go_$i.time"
  cmp "$S/out/bench/py_$i.jsonl" "$S/out/bench/go_$i.jsonl"
done
"$P" "$S/py/summarize.py" "$S/out/bench"
ls -l "$S/go-tracker" | awk '{print "go binary bytes:", $5}'
