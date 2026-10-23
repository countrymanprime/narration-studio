#!/usr/bin/env bash
# Rebuild everything and cmp Python vs Go: recorded test sessions, synthetic corpus, fuzz, exhaustive code points.
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; P=/home/user/narration-studio/.venv/bin/python; T=/home/user/narration-studio/sidecars/manuscript-teleprompter/tests
export PYTHONDONTWRITEBYTECODE=1
cd "$S/out" && PYTHONPATH="$S/py" RECORD_OUT="$S/data/test_sessions.jsonl" "$P" -m pytest -q -p no:cacheprovider -p recorder \
  "$T/test_script_tracker.py" "$T/test_script_tracker_properties.py" "$T/test_flags.py" "$T/test_replay.py" "$T/test_locate.py" | tail -1
cd "$S"
"$P" py/gen_tables.py go/unitables_gen.go
(cd go && go vet . && go build -o "$S/go-tracker" .)
"$P" py/gen_corpus.py data/corpus.jsonl 25
"$P" py/gen_fuzz.py data/fuzz.jsonl
"$P" py/gen_exhaustive.py data/exhaustive.jsonl
for set in test_sessions corpus; do
  "$P" py/run.py replay "data/$set.jsonl" "out/py_$set.jsonl" --check
  ./go-tracker replay "data/$set.jsonl" "out/go_$set.jsonl"
  cmp "out/py_$set.jsonl" "out/go_$set.jsonl" && echo "$set: identical ($(wc -l < "out/py_$set.jsonl") lines)"
done
for set in fuzz exhaustive; do
  "$P" py/run.py fuzz "data/$set.jsonl" "out/py_$set.jsonl"
  ./go-tracker fuzz "data/$set.jsonl" "out/go_$set.jsonl"
  cmp "out/py_$set.jsonl" "out/go_$set.jsonl" && echo "$set: identical ($(wc -l < "out/py_$set.jsonl") cases)"
done
