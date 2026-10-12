"""Run the extraction calibration (SN-X8): every source the protocol names, on the scored books, against their gold sets.

    python scripts/research/extraction-calibration/run_calibration.py fetch            # download the texts (ignored local data)
    python scripts/research/extraction-calibration/run_calibration.py run [--gliner-install D] [--booknlp-small-install D]
        [--booknlp-large-install D] [--import-file F] [--rules-only]
    python scripts/research/extraction-calibration/run_calibration.py run --fake        # offline demo on invented books; not a measurement
    python scripts/research/extraction-calibration/run_calibration.py gold-check        # gold counts against the protocol's minimums

A source that is not installed, a book that is not fetched and a book with no gold are each `not run` with a sentence; no
figure is ever filled in. Output goes to ``data/out/`` (ignored). See README.md and
docs/research/studio-next-extraction-calibration-protocol.md.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from calibration import books, demo, gold, report, scoring, sources
from calibration.gold import MINIMUMS

KINDS = tuple(MINIMUMS)  # the kinds the protocol scores

REPO = HERE.parents[2]
DATA = HERE / "data"
SCORED = ("scored",)


def commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def load_books() -> list[dict[str, Any]]:
    return json.loads((DATA / "books.json").read_text(encoding="utf-8"))["books"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("fetch", "run", "gold-check"))
    parser.add_argument("--data-dir", default=str(DATA))
    parser.add_argument("--books", default="", help="comma-separated book ids (default: the scored books)")
    parser.add_argument("--gliner-install", default="")
    parser.add_argument("--booknlp-small-install", default="")
    parser.add_argument("--booknlp-large-install", default="")
    parser.add_argument("--spacy-model", default="")
    parser.add_argument("--import-file", default="")
    parser.add_argument("--rules-only", action="store_true", help="run the rules baseline and mark the other sources `not run`")
    parser.add_argument("--fake", action="store_true", help="offline demo: invented books and a fake source; writes a report that says it is not a measurement")
    parser.add_argument("--threshold", type=float, default=scoring.VERIFY_BELOW)
    args = parser.parse_args(argv)
    data_dir = Path(args.data_dir)
    out = data_dir / "out"
    out.mkdir(parents=True, exist_ok=True)

    if args.fake:
        return run_fake(data_dir, out, args.threshold)
    catalog = {b["id"]: b for b in load_books()}
    ids = [i for i in args.books.split(",") if i] or [i for i, b in catalog.items() if b["role"] in SCORED]
    if args.command == "fetch":
        for book_id in ids + ([] if args.books else ["alice"]):
            book = catalog[book_id]
            try:
                text = books.fetch(book, data_dir, REPO)
                manuscript, words = books.build_manuscript(data_dir / book_id, book, text.read_text(encoding="utf-8", errors="replace"))
                print(f"{book_id}: {words} words in {manuscript}")
            except (OSError, ValueError) as error:
                print(f"{book_id}: not fetched: {error}", file=sys.stderr)
        return 0
    if args.command == "gold-check":
        for book_id in ids:
            path = data_dir / book_id / "gold.jsonl"
            short = gold.shortfalls(gold.load_gold(path)) if path.is_file() else None
            print(
                f"{book_id}: "
                + (
                    "no gold file"
                    if short is None
                    else "meets the minimums"
                    if not short
                    else ", ".join(f"{k} {have}/{need}" for k, (have, need) in short.items())
                )
            )
        return 0
    return run_real(args, catalog, ids, data_dir, out)


def run_real(args: argparse.Namespace, catalog: dict[str, Any], ids: list[str], data_dir: Path, out: Path) -> int:
    results = []
    sha = commit()
    names = ["rules", "GLiNER small-v2.1", "BookNLP small", "BookNLP large", "imported file"]
    for name in names:
        merged = sources.SourceRun(name, sources.NOT_RUN, "")
        for book_id in ids:
            manuscript = data_dir / book_id / "manuscript.json"
            if not manuscript.is_file():
                continue
            if name == "rules":
                run = sources.run_rules(REPO, manuscript, sha)
            elif args.rules_only:
                run = sources.not_run(name, "only the rules baseline was requested (--rules-only).")
            elif name.startswith("GLiNER"):
                run = sources.run_installed(name, REPO, manuscript, "gliner", args.gliner_install, "wheel-gliner", "gliner")
            elif name == "BookNLP small":
                run = sources.run_installed(name, REPO, manuscript, "booknlp", args.booknlp_small_install, "wheel-booknlp", "booknlp", args.spacy_model)
            elif name == "BookNLP large":
                run = sources.run_installed(name, REPO, manuscript, "booknlp", args.booknlp_large_install, "wheel-booknlp", "booknlp", args.spacy_model)
            else:
                run = sources.read_import(args.import_file)
            if run.status == sources.NOT_RUN:
                merged = run if merged.status == sources.NOT_RUN else merged
                continue
            merged.status, merged.versions, merged.command = "ran", run.versions, run.command
            merged.items_by_book = merged.items_by_book | {book_id: run.items}
        results.append(evaluate_by_book(merged, ids, data_dir, args.threshold, name))
    write(out, results, fake=False, threshold=args.threshold)
    return 0


def evaluate_by_book(merged: sources.SourceRun, ids: list[str], data_dir: Path, threshold: float, name: str) -> dict[str, Any]:
    if merged.status == sources.NOT_RUN and not merged.reason:
        merged.reason = f"no book was fetched, so {name} had nothing to run on."
    by_book = merged.items_by_book
    result: dict[str, Any] = {"run": merged.summary(), "books": {}}
    if merged.status == sources.NOT_RUN:
        return result
    runs = {b: sources.SourceRun(name, "ran", items=by_book.get(b, [])) for b in ids}
    judged_all: list[scoring.Judged] = []
    per_kind: dict[str, dict[str, list[scoring.Judged]]] = {kind: {} for kind in KINDS}
    for book_id in ids:
        folder = data_dir / book_id
        if book_id not in by_book:
            result["books"][book_id] = {"skipped": "the text was not fetched (run `fetch`)."}
        elif not (folder / "gold.jsonl").is_file():
            result["books"][book_id] = {"skipped": "there is no gold set for this book yet (the runner writes it by reading the chapters; see the README)."}
        else:
            gold_by_kind = gold.load_gold(folder / "gold.jsonl")
            adjudicated = gold.load_adjudicated(folder / "adjudicated.jsonl")
            judged = scoring.judge(
                runs[book_id].items, {fp for fps in gold_by_kind.values() for fp in fps}, adjudicated, books.paragraph_texts(folder / "manuscript.json")
            )
            result["books"][book_id] = {"kinds": scoring.score_kinds(judged, gold_by_kind, adjudicated, KINDS), "shortfalls": gold.shortfalls(gold_by_kind)}
            judged_all += judged
            for kind in KINDS:
                per_kind[kind][book_id] = [j for j in judged if j.kind == kind]
    if any(j.correct is not None for j in judged_all):
        result["pooled"] = {
            "bins": scoring.confidence_bins(judged_all),
            "confident_but_wrong": scoring.confident_but_wrong(judged_all, threshold),
            "threshold": threshold,
        }
    result["per_kind"] = per_kind
    return result


def run_fake(data_dir: Path, out: Path, threshold: float) -> int:
    ids = demo.write_demo(data_dir)
    fake = sources.SourceRun("fake", "fake", versions={"fake": "demo"}, command="fake")
    by_book = {}
    for book_id in ids:
        rows = gold.read_lines(data_dir / book_id / "gold.jsonl")
        by_book[book_id] = demo.fake_run(data_dir / book_id / "manuscript.json", rows).items
    fake.items_by_book = by_book
    results = [evaluate_by_book(fake, ids, data_dir, threshold, "fake")]
    write(out, results, fake=True, threshold=threshold)
    return 0


def write(out: Path, results: list[dict[str, Any]], fake: bool, threshold: float) -> None:
    """results.json and report.md under ``out``."""
    pooled_books: dict[str, list[scoring.Judged]] = {}
    lines = ["# Extraction calibration report", ""]
    if fake:
        lines += ["> **Fake demonstration.** Invented books and a fake source, run only to show the harness works offline. Nothing below is a measurement.", ""]
    lines += ["## Sources", ""]
    for result in results:
        lines += report.source_section(result)
        for kind_books in result.get("per_kind", {}).values():
            for book, judged in kind_books.items():
                pooled_books.setdefault(book, []).extend(judged)
    per_kind_rules = next((r["per_kind"] for r in results if r["run"]["name"] == "rules" and "per_kind" in r), {})
    rec = scoring.recommend_overall(per_kind_rules, threshold) if per_kind_rules and not fake else scoring.recommend(pooled_books if fake else {}, threshold)
    lines += report.recommendation_section(rec, fake)
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "results.json").write_text(json.dumps([{"run": r["run"]} for r in results], indent=2, default=str), encoding="utf-8")
    print(f"wrote {out / 'report.md'}")


if __name__ == "__main__":
    raise SystemExit(main())
