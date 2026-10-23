"""Merge the per-test result files of a real-Audacity 3 run into results.json and summary.md.

    python3 -I src/studio/tests/audacity3/real/foundation/summarise.py <out-folder> [--md-only]

Reads <out>/results/*.json (one file per test, written by internal/audacityreal) and writes <out>/results.json (every test, every
row, the Audacity version and runner) and <out>/summary.md (one line per test, then the rows that failed or were skipped, then the
rows that recorded a measurement). The same markdown is appended to $GITHUB_STEP_SUMMARY when that is set.
"""

import glob
import json
import os
import sys


def main() -> int:
    out = sys.argv[1]
    results = []
    for path in sorted(glob.glob(os.path.join(out, "results", "*.json"))):
        with open(path, encoding="utf-8") as f:
            results.append(json.load(f))
    merged = {
        "audacity": results[0]["audacity"] if results else "",
        "runner": results[0]["runner"] if results else "",
        "tests": results,
        "counts": {s: sum(1 for r in results if r["status"] == s) for s in ("pass", "fail", "skip")},
    }
    with open(os.path.join(out, "results.json"), "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)
        f.write("\n")

    def cell(text: str) -> str:
        return " ".join(str(text).split()).replace("|", "\\|")

    lines = [
        f"### Real Audacity {merged['audacity']} on {merged['runner']}",
        "",
        f"{merged['counts']['pass']} passed, {merged['counts']['fail']} failed, {merged['counts']['skip']} skipped.",
        "",
        "| Test | Result | Time | Title |",
        "| --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(f"| {r['test']} | {r['status']} | {r['duration_s']:.0f} s | {cell(r['title'])} |")
    problems = [(r, row) for r in results for row in (r.get("rows") or []) if row["status"] in ("fail", "skip")]
    if problems:
        lines += ["", "#### Failed and skipped steps", "", "| Test | Step | Result | Evidence |", "| --- | --- | --- | --- |"]
        for r, row in problems:
            lines.append(f"| {r['test']} | {cell(row['step'])} | {row['status']} | {cell(row.get('evidence', ''))[:400]} |")
    infos = [(r, row) for r in results for row in (r.get("rows") or []) if row["status"] == "info"]
    if infos:
        lines += ["", "<details><summary>Measurements and observed facts</summary>", "", "| Test | Step | Evidence |", "| --- | --- | --- |"]
        for r, row in infos:
            lines.append(f"| {r['test']} | {cell(row['step'])} | {cell(row.get('evidence', ''))[:400]} |")
        lines += ["", "</details>"]
    text = "\n".join(lines) + "\n"
    with open(os.path.join(out, "summary.md"), "w", encoding="utf-8") as f:
        f.write(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary and "--md-only" not in sys.argv:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
