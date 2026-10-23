#!/usr/bin/env python3
"""Merge the per-test JSON files of one run into results.json and summary.md (the job summary): summarize.py <out dir>"""

import glob
import json
import os
import sys


def main(out):
    results = []
    for path in sorted(glob.glob(os.path.join(out, "results", "*.json")) + glob.glob(os.path.join(out, "launch-*.json"))):
        try:
            with open(path) as f:
                results.append(json.load(f))
        except (OSError, ValueError) as exc:
            results.append(
                {
                    "id": os.path.basename(path),
                    "title": "unreadable result",
                    "status": "FAIL",
                    "steps": [{"step": "read", "status": "FAIL", "detail": str(exc)}],
                }
            )
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump({"tests": results}, f, indent=1)
    lines = ["### Real Audacity 3: edits, recording and Windows (A3-T14 to T23, T30, T32, T33)", ""]
    if results:
        first = results[0]
        lines += [f"Audacity {first.get('audacity', '?')} on {first.get('runner', '?')} ({first.get('platform', '?')}).", ""]
    lines += ["| Test | Result | Pass | Fail | Info | Seconds |", "| --- | --- | --- | --- | --- | --- |"]
    for r in results:
        c = {k: sum(1 for s in r.get("steps", []) if s["status"] == k) for k in ("PASS", "FAIL", "INFO", "SKIP")}
        lines.append(f"| {r['id']} {r.get('title', '')} | **{r['status']}** | {c['PASS']} | {c['FAIL']} | {c['INFO']} | {r.get('seconds', '')} |")
    lines.append("")
    for r in results:
        lines += [f"<details><summary>{r['id']}: {r.get('title', '')} ({r['status']})</summary>", "", "| Status | Step | Detail |", "| --- | --- | --- |"]
        for s in r.get("steps", []):
            detail = str(s.get("detail", "")).replace("|", "\\|").replace("\n", " ")[:600]
            lines.append(f"| {s['status']} | {s['step'].replace('|', chr(92) + '|')} | {detail} |")
        lines += ["", "</details>", ""]
    text = "\n".join(lines)
    with open(os.path.join(out, "summary.md"), "w") as f:
        f.write(text)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a") as f:
            f.write(text + "\n")
    print(text[:3000])
    return 1 if any(r["status"] == "FAIL" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "out"))
