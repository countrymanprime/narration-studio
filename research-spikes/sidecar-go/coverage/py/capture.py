"""Run every committed coverage case at the shipped settings through the real sidecar coverage mode
(cal.run_in_process), capturing what reaches compute_coverage / align_tokens / diff_and_build_markers.

Writes, into OUT (argv[1]):
  inputs.jsonl  one record per compute_coverage call: case, params, chapter (heading, paragraphs,
                paragraph_ids), transcript words, the AlignedChapter, and the opcodes
  py.out        one line per record: the ChapterCoverage (asdict + derived) and align_tokens output
  opcodes.py.out one line per record: the opcodes diff_and_build_markers produced
"""
import dataclasses, json, sys, tempfile
from pathlib import Path

REPO = Path("/home/user/narration-studio")
TESTS = REPO / "sidecars/transcript-compare/tests"
sys.path.insert(0, str(TESTS))
import coverage_calibration as cal  # noqa: E402  (puts core on sys.path)
import coverage_harness as harness  # noqa: E402
import recording_coverage as rc  # noqa: E402
import compare as engine  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import dump, result_record  # noqa: E402

OUT = Path(sys.argv[1])
records = []
current = {}

orig_bcu = engine.build_chapter_units
orig_dbm = engine.diff_and_build_markers
orig_cc = rc.compute_coverage
orig_at = rc.align_tokens


def bcu(chapter):
    current["chapter"] = {"heading": chapter["title"], "paragraphs": list(chapter["paragraphs"])}
    return orig_bcu(chapter)


def dbm(tokens, unit_idx, raw_words, words, min_words):
    current["words"] = [[w, s, e] for (w, s, e) in words]
    out = orig_dbm(tokens, unit_idx, raw_words, words, min_words)
    current["opcodes"] = [list(op) for op in out[2]["opcodes"]]
    return out


def cc(aligned, params=None):
    params = params or rc.AlignmentParams()
    rec = {
        "case": current["case"],
        "params": dataclasses.asdict(params),
        "chapter": dict(current["chapter"], paragraph_ids=list(aligned.paragraph_ids)),
        "words": current["words"],
        "aligned": {k: [list(x) if isinstance(x, tuple) else x for x in v] for k, v in dataclasses.asdict(aligned).items()},
    }
    records.append(rec)
    return orig_cc(aligned, params)


engine.build_chapter_units = bcu
engine.diff_and_build_markers = dbm
rc.compute_coverage = cc

corpus = harness.load_corpus(harness.FIXTURE_DIR)
with tempfile.TemporaryDirectory() as tmp:
    for case in corpus.cases:
        current.clear()
        current["case"] = case.id
        cal.run_in_process(case, harness.FIXTURE_DIR / "manuscript.json", Path(tmp) / case.id, cal.SHIPPED)

rc.compute_coverage = orig_cc
OUT.mkdir(parents=True, exist_ok=True)
with open(OUT / "inputs.jsonl", "w", encoding="utf-8") as f:
    for r in records:
        f.write(dump(r) + "\n")
with open(OUT / "py.out", "w", encoding="utf-8") as f, open(OUT / "opcodes.py.out", "w", encoding="utf-8") as g:
    for r in records:
        f.write(dump(result_record(r)) + "\n")
        g.write(dump({"case": r["case"], "opcodes": r["aligned"]["opcodes"]}) + "\n")
with open(OUT / "aligned.py.out", "w", encoding="utf-8") as f:
    for r in records:
        f.write(dump(dict(r["aligned"], case=r["case"])) + "\n")
print(f"{len(records)} records from {len(corpus.cases)} cases", file=sys.stderr)
