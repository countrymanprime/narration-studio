#!/usr/bin/env bash
# Re-run the whole spike: capture, Go build, identity checks, fuzz, benchmark (median of 5).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PY=/home/user/narration-studio/.venv/bin/python
OUT="$HERE/out"; GO="$HERE/go/coverage"
(cd "$HERE/go" && go vet . && go build -trimpath -o coverage . && go build -trimpath -ldflags="-s -w" -o coverage.stripped .)
"$PY" "$HERE/py/capture.py" "$OUT"
"$PY" "$HERE/py/gen_bench_inputs.py" "$OUT"
cd "$OUT"
check() { if cmp -s "$1" "$2"; then echo "IDENTICAL $1 $2 ($(wc -l <"$1") lines)"; else echo "DIFFER $1 $2"; fi; }
"$GO" -mode core -in inputs.jsonl -out go.out
"$GO" -mode full -in inputs.jsonl -out gofull.out -opcodes opcodes.go.out -aligned aligned.go.out
check py.out go.out; check opcodes.py.out opcodes.go.out; check aligned.py.out aligned.go.out; check py.out gofull.out
for d in synth x50; do
  "$PY" "$HERE/py/bench.py" core $d.jsonl $d.py.out 2>/dev/null
  "$GO" -mode core -in $d.jsonl -out $d.go.out 2>/dev/null; check $d.py.out $d.go.out
  "$GO" -mode full -in $d.jsonl -out $d.gofull.out 2>/dev/null; check $d.py.out $d.gofull.out
done
"$PY" "$HERE/py/selfcheck.py" "$GO"

echo; echo "lang mode dataset | wall_s maxrss_kb compute_ms (median of 5)"
bench() { # lang mode dataset cmd...
  local lang=$1 mode=$2 data=$3; shift 3
  local walls=() rss=() comp=()
  for k in 1 2 3 4 5; do
    /usr/bin/time -v -o time.txt "$@" 2>err.txt >/dev/null
    walls+=("$(awk -F': ' '/Elapsed \(wall clock\)/{n=split($2,a,":"); s=0; for(i=1;i<=n;i++) s=s*60+a[i]; print s}' time.txt)")
    rss+=("$(awk -F': ' '/Maximum resident/{print $2}' time.txt)")
    comp+=("$(grep -o 'compute [0-9.]*' err.txt | awk '{print $2}')")
  done
  med() { printf '%s\n' "$@" | sort -g | sed -n 3p; }
  echo "$lang $mode $data | $(med "${walls[@]}") $(med "${rss[@]}") $(med "${comp[@]}")"
}
for data in inputs x50 synth; do
  for mode in core full; do
    bench py $mode $data "$PY" "$HERE/py/bench.py" $mode $data.jsonl /dev/null
    bench go $mode $data "$GO" -mode $mode -in $data.jsonl -out /dev/null
  done
done
ls -l "$HERE/go/coverage" "$HERE/go/coverage.stripped" | awk '{print $5, $9}'
