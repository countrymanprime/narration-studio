"""Measure the recording check's speed and quality on LibriVox's Alice in Wonderland, with one command.

    python scripts/dev/recording-check-benchmark.py --models tiny,small --spans 2,10 --workers 1,2,4,0 \
        --units whole,items:10,chunk:60 --out ../narration-benchmark

Each run is the real sidecar (`src/studio/sidecars/transcript-compare/core/compare.py --coverage`), started the way the host starts it,
over the first N minutes of the pinned LibriVox readings (`tests/fixtures/audio/librivox-alice/sources.json`, fetched and checksummed on
first use). It writes `results.jsonl` and `results.md` to --out, one row per run:

- speed: wall seconds, real-time factor (wall / audio), processes started, peak memory of the biggest process and of all together, and CPU use;
- quality: word error rate of the words the run heard against (a) the chapter's Project Gutenberg text, over the paragraphs the span holds,
  and (b) the committed whole-file `large-v3-turbo` reference (`alignment/*.words.json`), with the words lost or repeated within 3 s of a chunk
  boundary counted apart.

--units: `whole` is one item per span, no chunks; `items:N` cuts the span into N equal items (a chapter recorded as N takes); `chunk:S` is one item
cut into S-second chunks with the 6 s crossover. --workers 0 is the app's Automatic as the sidecar plans it. --recheck-model adds the
pipelined second look with a larger model (--unsure-below sets the score line).

Models are folders named after the model (`tiny`, `small`, `large-v3-turbo`) under --models-dir; one that is missing is downloaded with
faster-whisper once. Needs the sidecar's environment (faster-whisper, PyAV, numpy); psutil is optional (memory and CPU read "n/a" without it).
Works on Windows: nothing here is shell-specific.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CORPUS = REPO / "tests" / "fixtures" / "audio" / "librivox-alice"
SIDECAR = REPO / "src" / "studio" / "sidecars" / "transcript-compare" / "core" / "compare.py"
SHARED = REPO / "src" / "studio" / "libs" / "python"
SOURCES = ("kara_01", "kara_02", "kara_07", "kara_09", "kara_10", "kara_11")
BOUNDARY_SECONDS = 3.0
OVERLAP_SECONDS = 6

sys.path.insert(0, str(CORPUS))


@dataclass(frozen=True)
class Unit:
    """How a span is cut up: `items` takes of equal length, or one item cut into `chunk` seconds."""

    name: str
    items: int = 1
    chunk: int = 0


def parse_unit(text: str) -> Unit:
    kind, _, value = text.partition(":")
    if kind == "whole":
        return Unit(text)
    if kind == "items" and value.isdigit():
        return Unit(text, items=int(value))
    if kind == "chunk" and value.isdigit():
        return Unit(text, chunk=int(value))
    raise SystemExit(f"--units: {text!r} is not whole, items:N or chunk:S")


def tokens(text: str) -> list[str]:
    """Words as the score compares them: lower case, letters and digits only."""
    out = []
    for raw in text.lower().split():
        word = "".join(ch for ch in raw if ch.isalnum() or ch == "'")
        word = word.replace("'", "")
        if word:
            out.append(word)
    return out


def edits(reference: list[str], heard: list[str]) -> tuple[int, int, int, list[tuple[str, int]]]:
    """(substitutions, deletions, insertions, the operations as ("del"|"ins"|"sub", index in `heard`)) of the cheapest way from reference to heard."""
    rows, cols = len(reference) + 1, len(heard) + 1
    cost = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        cost[i][0] = i
    for j in range(cols):
        cost[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            same = 0 if reference[i - 1] == heard[j - 1] else 1
            cost[i][j] = min(cost[i - 1][j - 1] + same, cost[i - 1][j] + 1, cost[i][j - 1] + 1)
    subs = dels = inss = 0
    ops: list[tuple[str, int]] = []
    i, j = len(reference), len(heard)
    while i > 0 or j > 0:
        if i > 0 and j > 0 and cost[i][j] == cost[i - 1][j - 1] + (0 if reference[i - 1] == heard[j - 1] else 1):
            if reference[i - 1] != heard[j - 1]:
                subs += 1
                ops.append(("sub", j - 1))
            i, j = i - 1, j - 1
        elif i > 0 and cost[i][j] == cost[i - 1][j] + 1:
            dels += 1
            ops.append(("del", j))
            i -= 1
        else:
            inss += 1
            ops.append(("ins", j - 1))
            j -= 1
    return subs, dels, inss, ops


def audio_for(minutes: float, work: Path) -> tuple[Path, list[tuple[str, float]]]:
    """A WAV of the first `minutes` of the readings joined, and the (source id, seconds used) it is made of."""
    import audio  # the corpus builder's decoder
    import numpy as np
    from sources import fetch, load_sources, sources_dir

    directory = sources_dir()
    fetch(directory, set(SOURCES))
    sources = load_sources()
    wanted = minutes * 60
    pieces, used, total, rate = [], [], 0.0, 16000
    for source_id in SOURCES:
        samples, rate = audio.decode(directory / sources[source_id]["file"])
        take = min(len(samples) / rate, wanted - total)
        pieces.append(samples[: int(take * rate)])
        used.append((source_id, round(take, 3)))
        total += take
        if total >= wanted - 1e-6:
            break
    wav = work / f"span_{minutes:g}.wav"
    audio.write_wav(wav, np.concatenate(pieces), rate)
    return wav, used


def reference_for(used: list[tuple[str, float]]) -> tuple[list[tuple[str, float]], list[str], tuple[float, float]]:
    """The committed turbo words of the span ((word, start) in span seconds), the script words of the paragraphs it holds in full and the
    seconds those paragraphs span."""
    from alice_text import load_chapters
    from alice_text import tokens as script_tokens

    chapters = load_chapters()
    words: list[tuple[str, float]] = []
    script: list[str] = []
    window = [float("inf"), 0.0]
    offset = 0.0
    for source_id, seconds in used:
        reference = json.loads((CORPUS / "alignment" / f"{source_id}.words.json").read_text(encoding="utf-8"))
        markers = json.loads((CORPUS / "alignment" / f"{source_id}.markers.json").read_text(encoding="utf-8"))
        words += [(w[0], offset + w[1]) for w in reference["words"] if w[2] <= seconds]
        chapter = chapters[markers["chapter"]]
        by_id = {p.id: p for p in chapter.paragraphs}
        for paragraph in markers["paragraphs"]:
            if paragraph["end_s"] <= seconds and paragraph["id"] in by_id:
                script += script_tokens(by_id[paragraph["id"]].text)
                window = [min(window[0], offset + paragraph["start_s"]), max(window[1], offset + paragraph["end_s"])]
        offset += seconds
    return words, script, (window[0], window[1])


def model_dir(root: Path, name: str) -> Path:
    path = root / name
    if (path / "model.bin").exists():
        return path
    from faster_whisper.utils import download_model

    return Path(download_model(name, output_dir=str(path)))


class Watcher:
    """Samples a process tree: processes started, peak memory of the biggest and of all together, and the computer's CPU use."""

    def __init__(self, pid: int):
        try:
            import psutil
        except ImportError:
            self.psutil = None
            return
        self.psutil = psutil
        self.root = psutil.Process(pid)
        self.seen: set[int] = {pid}
        self.peak_one = 0
        self.peak_all = 0
        self.cpu: list[float] = []

    def sample(self) -> None:
        if self.psutil is None:
            return
        try:
            tree = [self.root, *self.root.children(recursive=True)]
            sizes = []
            for proc in tree:
                try:
                    sizes.append(proc.memory_info().rss)
                    self.seen.add(proc.pid)
                except self.psutil.Error:
                    continue
            if sizes:
                self.peak_one = max(self.peak_one, max(sizes))
                self.peak_all = max(self.peak_all, sum(sizes))
            self.cpu.append(self.psutil.cpu_percent(interval=0.3))
        except self.psutil.Error:
            pass

    def summary(self) -> dict:
        if self.psutil is None:
            return {"processes": "n/a", "peak_mb_one": "n/a", "peak_mb_all": "n/a", "cpu_percent": "n/a"}
        return {
            "processes": len(self.seen),
            "peak_mb_one": round(self.peak_one / 2**20),
            "peak_mb_all": round(self.peak_all / 2**20),
            "cpu_percent": round(sum(self.cpu) / max(1, len(self.cpu))),
        }


def run_one(args, wav: Path, minutes: float, unit: Unit, model: str, workers: int, recheck: str | None, work: Path) -> dict:
    import alice_text

    run = Path(tempfile.mkdtemp(prefix="run_", dir=work))
    (run / "words").mkdir()
    chapters = list(alice_text.load_chapters().values())
    (run / "manuscript.json").write_text(json.dumps(alice_text.manuscript_json(chapters, "doc-1")), encoding="utf-8")
    seconds = minutes * 60
    length = seconds / unit.items
    items = [
        {"index": n, "itemGuid": f"{{{n}}}", "sourceFile": str(wav), "startOffset": n * length, "length": length, "wordsFile": f"item-{n}.json", "muted": False}
        for n in range(unit.items)
    ]
    (run / "manifest.json").write_text(json.dumps({"schemaVersion": 1, "items": items}), encoding="utf-8")
    command = [
        sys.executable, "-u", str(SIDECAR), "--coverage", "--manifest", str(run / "manifest.json"), "--manuscript", str(run / "manuscript.json"),
        "--chapter-id", chapters[0].id, "--words-dir", str(run / "words"), "--out", str(run / "out.txt"), "--model", model,
        "--model-dir", str(model_dir(args.models_dir, model)), "--language", "en", "--progress", str(run / "progress.txt"), "--log", str(run / "log.txt"),
        "--parallel-workers", str(workers),
    ]  # fmt: skip
    if unit.chunk:
        command += ["--chunk-seconds", str(unit.chunk), "--chunk-overlap-seconds", str(OVERLAP_SECONDS)]
    if recheck:
        command += ["--recheck-model", recheck, "--recheck-model-dir", str(model_dir(args.models_dir, recheck)), "--unsure-below", str(args.unsure_below)]
    environment = dict(os.environ, PYTHONPATH=str(SHARED))
    started = time.time()
    process = subprocess.Popen(command, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    watcher = Watcher(process.pid)
    while process.poll() is None:
        watcher.sample()
        time.sleep(0.2)
    wall = time.time() - started
    row = {"model": model, "recheck": recheck or "", "span_min": minutes, "unit": unit.name, "workers": workers, "ok": process.returncode == 0,
           "wall_s": round(wall, 1), "rtf": round(wall / seconds, 3), **watcher.summary()}  # fmt: skip
    if process.returncode == 0:
        row.update(quality(run, unit, seconds, args._reference, args._script, args._window))
        row["rechecked_passages"] = sum(1 for line in (run / "out.txt").read_text(encoding="utf-8").splitlines() if line.startswith("COVERAGE_RECHECKED"))
    return row


def quality(run: Path, unit: Unit, seconds: float, reference: list[tuple[str, float]], script: list[str], window: tuple[float, float]) -> dict:
    heard: list[tuple[str, float]] = []
    for path in sorted((run / "words").glob("item-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for word in data["words"]:
            for token in tokens(word[0]):
                heard.append((token, word[1]))
    heard.sort(key=lambda w: w[1])
    heard_tokens = [w[0] for w in heard]
    ref_tokens = [t for w, _ in reference for t in tokens(w)]
    result = {"words": len(heard_tokens)}
    if script:
        subs, dels, inss, _ = edits(script, [t for t, start in heard if window[0] - 0.5 <= start <= window[1] + 0.5])
        result["wer_vs_text"] = round((subs + dels + inss) / len(script), 4)
    subs, dels, inss, ops = edits(ref_tokens, heard_tokens)
    result["wer_vs_reference"] = round((subs + dels + inss) / max(1, len(ref_tokens)), 4)
    result["lost_vs_reference"] = dels
    result["repeated_vs_reference"] = inss
    if unit.chunk:
        cuts = [n * (unit.chunk - OVERLAP_SECONDS) for n in range(1, int(seconds // max(1, unit.chunk - OVERLAP_SECONDS)) + 1)]

        def near(t: float) -> bool:
            return any(abs(t - cut) <= BOUNDARY_SECONDS for cut in cuts)

        def at_edge(kind: str, index: int) -> bool:
            if not heard:
                return False
            position = min(max(index, 0), len(heard) - 1) if kind == "del" else index
            return 0 <= position < len(heard) and near(heard[position][1])

        edge = sum(1 for kind, index in ops if at_edge(kind, index))
        result["errors_at_chunk_edges"] = edge
    return result


def table(rows: list[dict]) -> str:
    columns = ["model", "recheck", "span_min", "unit", "workers", "wall_s", "rtf", "processes", "peak_mb_one", "peak_mb_all", "cpu_percent",
               "wer_vs_text", "wer_vs_reference", "lost_vs_reference", "repeated_vs_reference", "errors_at_chunk_edges", "rechecked_passages"]  # fmt: skip
    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join(" - " for _ in columns) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(c, "")) for c in columns) + " |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--models", default="tiny,small", help="comma-separated model names")
    parser.add_argument("--spans", default="2,10", help="minutes of audio, comma-separated")
    parser.add_argument("--units", default="whole,items:10", help="whole, items:N, chunk:S, comma-separated")
    parser.add_argument("--workers", default="1,2,4,0", help="worker counts; 0 is Automatic")
    parser.add_argument("--recheck-model", default=None, help="a larger model for the pipelined second look")
    parser.add_argument("--unsure-below", type=float, default=0.5)
    parser.add_argument("--models-dir", type=Path, default=Path.home() / ".cache" / "narration-benchmark" / "models")
    parser.add_argument("--out", type=Path, default=Path("narration-benchmark"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    args.models_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    with open(args.out / "results.jsonl", "a", encoding="utf-8") as sink:
        for minutes in (float(m) for m in args.spans.split(",")):
            wav, used = audio_for(minutes, args.out)
            args._reference, args._script, args._window = reference_for(used)
            print(f"span {minutes:g} min = {used}, {os.cpu_count()} logical processors", flush=True)
            for model in args.models.split(","):
                for unit in (parse_unit(u) for u in args.units.split(",")):
                    for workers in (int(w) for w in args.workers.split(",")):
                        row = run_one(args, wav, minutes, unit, model, workers, args.recheck_model, args.out)
                        rows.append(row)
                        sink.write(json.dumps(row) + "\n")
                        sink.flush()
                        print(json.dumps(row), flush=True)
    (args.out / "results.md").write_text(table(rows), encoding="utf-8")
    print(f"wrote {args.out / 'results.md'}")


if __name__ == "__main__":
    main()
