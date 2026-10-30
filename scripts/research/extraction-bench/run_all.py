"""One command for the whole benchmark: books, model files, the run matrix, the pipelining runs and the tables.

    python run_all.py --work DIR [--engines gliner booknlp-small booknlp-big] [--big-up-to-words 65000]

It needs ``pip install torch gliner booknlp==1.0.8 "setuptools<81" psutil pyarrow`` and a spaCy English model
(``python -m spacy download en_core_web_sm``). Everything it downloads and writes goes under ``--work``; it resumes where a
previous run stopped. Leave the machine alone while it runs: the runs share the cores, so other work would be timed with them.
The tables are printed and written to ``DIR/report.md``; send that file back.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def step(*command: str) -> None:
    """Runs one of the sibling scripts, stopping the benchmark if it fails."""
    subprocess.run([sys.executable, str(HERE / command[0]), *command[1:]], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True, type=Path)
    parser.add_argument("--engines", nargs="*", default=["gliner", "booknlp-small", "booknlp-big"])
    parser.add_argument("--big-up-to-words", default="65000")
    args = parser.parse_args()
    books, installs, runs = args.work / "books", args.work / "installs", args.work / "runs"
    step("prepare_books.py", "--out", str(books))
    step("setup_installs.py", "--out", str(installs))
    step(
        "run_benchmark.py",
        "--books",
        str(books),
        "--installs",
        str(installs),
        "--runs",
        str(runs),
        "--engines",
        *args.engines,
        "--big-up-to-words",
        args.big_up_to_words,
    )
    for weights in ("small", "big"):
        if f"booknlp-{weights}" in args.engines and "gliner" in args.engines:
            step(
                "run_pipeline.py",
                "--books",
                str(books),
                "--installs",
                str(installs),
                "--runs",
                str(runs),
                "--weights",
                weights,
                "--only-books",
                "56410",
                "34467",
                "53345",
            )
    step("report.py", "--runs", str(runs), "--books", str(books), "--out", str(args.work / "report.md"))


if __name__ == "__main__":
    main()
