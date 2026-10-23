"""Python reference driver: runs take_divergence.align_take/to_json over the divergence fixture
(every case x timings exact/jitter x offsets) or over a jobs file, writing one sorted-keys JSON line
per case/job. Prints in-process timings to stderr.

usage: py_driver.py cases CASES_JSON OUT [REPEAT]
       py_driver.py work  WORK_JSON  OUT [REPEAT]
"""
import time
T0 = time.perf_counter()
import json
import sys
from pathlib import Path

TC = Path("/home/user/narration-studio/sidecars/transcript-compare")
sys.path.insert(0, str(TC / "tests"))
sys.path.insert(0, str(TC / "core"))
import divergence_harness as h  # noqa: E402
import take_divergence as td  # noqa: E402

engine = h.load_compare()
T1 = time.perf_counter()

OFFSETS = (0.0, 1234.567)


def dump(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def run_cases(path, repeat):
    paragraphs, cases = h.load_cases(Path(path))
    lines = []
    for _ in range(repeat):
        lines = []
        for case in cases:
            plan = h.plan_case(engine, paragraphs, case)
            takes = []
            for timing in ("exact", "jitter"):
                times = h.TIMINGS[timing](plan)
                transcript = h.transcript_of(plan, times)
                for off in OFFSETS:
                    a = td.align_take(engine, plan.span, transcript)
                    takes.append({"timing": timing, "offset": off, **td.to_json(a, off)})
            lines.append(dump({"id": case.id, "span": td.span_json(plan.span), "takes": takes}))
    return lines


def run_work(path, repeat):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    lines = []
    for _ in range(repeat):
        lines = []
        for job in data["jobs"]:
            span = td.build_span(engine, data["paragraphs"], job["first"], job["last"])
            takes = []
            for take in job["takes"]:
                transcript = [(w[0], float(w[1]), float(w[2])) for w in take["words"]]
                a = td.align_take(engine, span, transcript)
                takes.append({"offset": take["offset"], **td.to_json(a, take["offset"])})
            lines.append(dump({"id": job["id"], "span": td.span_json(span), "takes": takes}))
    return lines


mode, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
repeat = int(sys.argv[4]) if len(sys.argv) > 4 else 1
lines = (run_cases if mode == "cases" else run_work)(src, repeat)
T2 = time.perf_counter()
Path(out).write_text("".join(l + "\n" for l in lines), encoding="utf-8")
T3 = time.perf_counter()
print(f"startup_s={T1 - T0:.4f} compute_s={T2 - T1:.4f} write_s={T3 - T2:.4f}", file=sys.stderr)
