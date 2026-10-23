#!/usr/bin/env bash
# Runs each workload 5x per implementation under /usr/bin/time -v; prints medians.
# Re-run: cd to this directory, ./bench.sh   (needs gen.py outputs and ./divergence built)
set -euo pipefail
cd "$(dirname "$0")"
PY=/home/user/narration-studio/.venv/bin/python
CASES=/home/user/narration-studio/sidecars/transcript-compare/tests/fixtures/divergence/cases.json
declare -A W=(
  [startup]="cases $CASES 0"
  [cases_x50]="cases $CASES 50"
  [long_repeated_ms]="work bench_long.json 1"
  [long_alice]="work bench_alice.json 1"
)
med() { sort -g | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}'; }
printf "%-18s %-4s %10s %12s %12s %10s\n" workload impl wall_s inproc_s startup_s maxrss_MB
for w in startup cases_x50 long_repeated_ms long_alice; do
  read -r mode src rep <<<"${W[$w]}"
  for impl in py go; do
    walls=(); comps=(); sts=(); rss=()
    for i in 1 2 3 4 5; do
      if [ $impl = py ]; then cmd=($PY py_driver.py $mode $src /dev/null $rep); else cmd=(./divergence $mode $src /dev/null $rep); fi
      /usr/bin/time -v -o time.txt "${cmd[@]}" 2> err.txt
      walls+=("$(awk -F': ' '/Elapsed \(wall/ {split($2,t,":"); print t[1]*60+t[2]}' time.txt)")
      rss+=("$(awk -F': ' '/Maximum resident/ {printf "%.1f", $2/1024}' time.txt)")
      comps+=("$(sed -n 's/.*compute_s=\([0-9.]*\).*/\1/p' err.txt)")
      sts+=("$(sed -n 's/.*startup_s=\([0-9.]*\).*/\1/p' err.txt)")
    done
    printf "%-18s %-4s %10s %12s %12s %10s\n" $w $impl \
      "$(printf '%s\n' "${walls[@]}" | med)" "$(printf '%s\n' "${comps[@]}" | med)" \
      "$(printf '%s\n' "${sts[@]}" | med)" "$(printf '%s\n' "${rss[@]}" | med)"
  done
done
rm -f time.txt err.txt
