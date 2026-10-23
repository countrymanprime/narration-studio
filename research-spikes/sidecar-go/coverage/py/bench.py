"""Python side of the benchmark, symmetric with go/coverage.

  bench.py core INPUTS OUT [REPEAT]  compute_coverage + align_tokens from each record's AlignedChapter
  bench.py full INPUTS OUT [REPEAT]  build_chapter_units + diff_and_build_markers + aligned_chapter_from_markers
                                     from chapter text + transcript words, then the same
Compute time (excluding JSON read/write) goes to stderr."""
import contextlib, io, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import aligned_from, dump, result_record, rc  # noqa: E402
import compare as engine  # noqa: E402  (common put core on sys.path)

mode, inputs, out = sys.argv[1], sys.argv[2], sys.argv[3]
repeat = int(sys.argv[4]) if len(sys.argv) > 4 else 1
records = [json.loads(line) for line in open(inputs, encoding="utf-8")]


def full_aligned(rec):
    ch = rec["chapter"]
    units, tokens, unit_idx, raw = engine.build_chapter_units({"title": ch["heading"], "paragraphs": ch["paragraphs"]})
    _m, _c, alignment = engine.diff_and_build_markers(tokens, unit_idx, raw, [tuple(w) for w in rec["words"]], 1)
    return rc.aligned_chapter_from_markers(alignment, units, ch["paragraph_ids"])


results = []
started = time.perf_counter()
with contextlib.redirect_stderr(io.StringIO()):
    for rep in range(repeat):
        cur = [result_record(r, full_aligned(r) if mode == "full" else aligned_from(r)) for r in records]
        if rep == 0:
            results = cur
elapsed = time.perf_counter() - started
print(f"py {mode}: {len(records)} records x {repeat} repeat, compute {elapsed * 1000:.3f} ms", file=sys.stderr)
with open(out, "w", encoding="utf-8") as f:
    for r in results:
        f.write(dump(r) + "\n")
