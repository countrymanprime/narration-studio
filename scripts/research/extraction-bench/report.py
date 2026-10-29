"""Turns the runs ``run_benchmark.py`` wrote into the benchmark's tables: time and memory, and what chunking changes in the output.

Whole-book output is the reference. There is no gold set, so every quality figure is *agreement with the whole-book run*, not
accuracy: a chunked run can agree with a wrong whole-book answer, and disagree with it where it is right.

GLiNER output is merged by the rule the whole-book run already uses (the span with the highest score per name, the first on a tie).
BookNLP output is merged by the prototype ``merge_booknlp`` below: characters of different chunks are one character when they share
a name or alias key (the adapter's ``_key``), aliases are unioned, the first chunk's name and evidence are kept, and a speaker line is
renamed to the merged character it belongs to. That is the rule the product would need, and what it cannot join shows up as split
characters.

Usage: ``python report.py --runs DIR --books DIR [--out FILE]`` writes Markdown (and prints it).
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

SIDECAR = Path(__file__).resolve().parents[3] / "src" / "studio" / "sidecars" / "manuscript-guide" / "core"
COMMON = Path(__file__).resolve().parents[3] / "src" / "studio" / "libs" / "python"
for folder in (SIDECAR, COMMON):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))

import extraction_booknlp as booknlp
import manuscript_guide as guide

MAJOR_LINES = 5  # a character with at least this many attributed quotes in the whole-book run is "major"


def quantiles(values: list[float]) -> dict[str, float]:
    """min, quartiles, median, max and mean of ``values`` (zeros when empty), to 2 places."""
    if not values:
        return dict.fromkeys(("n", "min", "p25", "median", "p75", "max", "mean"), 0)
    ordered = sorted(values)
    cuts = statistics.quantiles(ordered, n=4, method="inclusive") if len(ordered) > 1 else [ordered[0]] * 3
    return {
        "n": len(ordered),
        "min": round(ordered[0], 2),
        "p25": round(cuts[0], 2),
        "median": round(cuts[1], 2),
        "p75": round(cuts[2], 2),
        "max": round(ordered[-1], 2),
        "mean": round(statistics.fmean(ordered), 2),
    }


# ---- GLiNER ---------------------------------------------------------------------------------------------------------------------


def merge_gliner(suggestions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per-chunk GLiNER entries merged by name: the highest score wins, the first chunk on a tie (as the whole-book run does)."""
    best: dict[str, dict[str, Any]] = {}
    for item in suggestions:
        name = item["payload"]["name"]
        key = guide.normalize_name(name) or name.lower()
        held = best.get(key)
        score = item["confidence"]
        if held is not None and (score is None or (held["confidence"] is not None and held["confidence"] >= score)):
            continue
        best[key] = item
    return best


def compare_gliner(whole: dict[str, Any], chunked: dict[str, Any]) -> dict[str, Any]:
    reference, other = merge_gliner(whole["suggestions"]), merge_gliner(chunked["suggestions"])
    shared = reference.keys() & other.keys()
    same_type = sum(reference[k]["payload"]["type"] == other[k]["payload"]["type"] for k in shared)
    drift = [abs((reference[k]["confidence"] or 0) - (other[k]["confidence"] or 0)) for k in shared]
    return {
        "wholeNames": len(reference),
        "chunkedNames": len(other),
        "precision": round(len(shared) / len(other), 4) if other else 1.0,
        "recall": round(len(shared) / len(reference), 4) if reference else 1.0,
        "sameType": round(same_type / len(shared), 4) if shared else 1.0,
        "maxScoreDrift": round(max(drift, default=0.0), 4),
        "wholeScores": quantiles([v["confidence"] for v in reference.values() if v["confidence"] is not None]),
        "chunkedScores": quantiles([v["confidence"] for v in other.values() if v["confidence"] is not None]),
        "byType": {t: sum(v["payload"]["type"] == t for v in reference.values()) for t in sorted({v["payload"]["type"] for v in reference.values()})},
    }


# ---- BookNLP --------------------------------------------------------------------------------------------------------------------


def characters_of(suggestions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The characters one run found: its entries, each with the keys of its name and aliases, and the genders given for it."""
    out: list[dict[str, Any]] = []
    for item in suggestions:
        payload = item["payload"]
        if payload["kind"] == "entry":
            names = [payload["name"], *payload.get("aliases", [])]
            out.append(
                {
                    "name": payload["name"],
                    "aliases": list(payload.get("aliases", [])),
                    "keys": {booknlp._key(n) for n in names} - {""},
                    "chunk": item.get("chunk", 0),
                    "genders": [],
                }
            )
    for item in suggestions:
        payload = item["payload"]
        if payload["kind"] == "alias":  # a "possible duplicate" the adapter found inside one analysis
            for found in out:
                if found["name"] == payload["entry"] and found["chunk"] == item.get("chunk", 0):
                    found["keys"] |= {booknlp._key(payload["alias"])} - {""}
                    found["aliases"].append(payload["alias"])
    for item in suggestions:
        payload = item["payload"]
        if payload["kind"] == "property" and payload["key"] == booknlp.GENDER_KEY:
            for found in out:
                if found["name"] == payload["entry"] and found["chunk"] == item.get("chunk", 0):
                    found["genders"].append((payload["value"], item["confidence"] or 0.0))
    return out


def merge_booknlp(suggestions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Characters of every chunk joined when they share a name or alias key (union-find), in first-seen order."""
    people = characters_of(suggestions)
    parent = list(range(len(people)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner: dict[str, int] = {}
    for index, person in enumerate(people):
        for key in person["keys"]:
            if key in owner:
                parent[find(index)] = find(owner[key])
            else:
                owner[key] = index
    groups: dict[int, dict[str, Any]] = {}
    for index, person in enumerate(people):
        root = find(index)
        if root not in groups:
            groups[root] = {"name": person["name"], "aliases": [], "keys": set(), "genders": [], "chunks": set()}
        merged = groups[root]
        merged["keys"] |= person["keys"]
        merged["aliases"] += [a for a in [person["name"], *person["aliases"]] if a not in merged["aliases"] and a != merged["name"]]
        merged["genders"] += person["genders"]
        merged["chunks"].add(person["chunk"])
    return list(groups.values())


def character_index(people: list[dict[str, Any]]) -> dict[str, int]:
    """Key to the index of the character that has it (the first, when two characters share a key)."""
    index: dict[str, int] = {}
    for position, person in enumerate(people):
        for key in person["keys"]:
            index.setdefault(key, position)
    return index


def speaker_lines(suggestions: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    """The speaker suggestions by (paragraph id, quoted text)."""
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for item in suggestions:
        payload = item["payload"]
        if payload["kind"] == "speaker":
            out.setdefault((item["quotes"][0]["paragraphId"], payload["quote"]), item)
    return out


def majority_gender(person: dict[str, Any]) -> str | None:
    """The gender with the most summed confidence among the genders given for a merged character."""
    weight: dict[str, float] = defaultdict(float)
    for value, confidence in person["genders"]:
        weight[value] += confidence
    return max(weight, key=lambda k: weight[k]) if weight else None


def compare_booknlp(whole: dict[str, Any], chunked: dict[str, Any]) -> dict[str, Any]:
    reference = merge_booknlp(whole["suggestions"])
    other = merge_booknlp(chunked["suggestions"])
    ref_index, other_index = character_index(reference), character_index(other)
    ref_lines, other_lines = speaker_lines(whole["suggestions"]), speaker_lines(chunked["suggestions"])

    def matches(person: dict[str, Any], index: dict[str, int]) -> set[int]:
        return {index[k] for k in person["keys"] if k in index}

    lines_by_ref: dict[int, int] = defaultdict(int)
    for item in ref_lines.values():
        at = ref_index.get(booknlp._key(item["payload"]["speaker"]))
        if at is not None:
            lines_by_ref[at] += 1
    major = {i for i, n in lines_by_ref.items() if n >= MAJOR_LINES}

    found = [matches(p, other_index) for p in reference]
    recall_all = sum(bool(m) for m in found) / len(reference) if reference else 1.0
    recall_major = sum(bool(found[i]) for i in major) / len(major) if major else 1.0
    wanted = [matches(p, ref_index) for p in other]
    precision = sum(bool(m) for m in wanted) / len(other) if other else 1.0
    split = sum(len(m) > 1 for m in found)  # one whole-book character, several chunked characters
    split_major = sum(len(found[i]) > 1 for i in major)
    conflated = sum(len(m) > 1 for m in wanted)  # one chunked character, several whole-book characters

    both = [k for k in ref_lines if k in other_lines]
    agree = 0
    unmapped = 0
    for key in both:
        a = ref_index.get(booknlp._key(ref_lines[key]["payload"]["speaker"]))
        b = other_index.get(booknlp._key(other_lines[key]["payload"]["speaker"]))
        if a is None or b is None:
            unmapped += 1
            continue
        # the chunked speaker is the same character when its character shares a key with the whole-book speaker's character
        agree += bool(reference[a]["keys"] & other[b]["keys"])

    same_gender = judged = 0
    for i, person in enumerate(reference):
        mine, theirs = majority_gender(person), None
        others = found[i]
        if mine and others:
            genders = [majority_gender(other[j]) for j in others]
            theirs = next((g for g in genders if g), None)
        if mine and theirs:
            judged += 1
            same_gender += mine == theirs

    def tagged_share(lines: dict[Any, dict[str, Any]]) -> float:
        high = sum(item["confidence"] is not None and item["confidence"] >= 0.9 for item in lines.values())
        return round(high / len(lines), 3) if lines else 0.0

    return {
        "wholeCharacters": len(reference),
        "chunkedCharacters": len(other),
        "majorCharacters": len(major),
        "recall": round(recall_all, 4),
        "recallMajor": round(recall_major, 4),
        "precision": round(precision, 4),
        "splitCharacters": split,
        "splitMajor": split_major,
        "conflatedCharacters": conflated,
        "wholeQuotes": len(ref_lines),
        "chunkedQuotes": len(other_lines),
        "quotesInBoth": len(both),
        "speakerAgreement": round(agree / (len(both) - unmapped), 4) if len(both) > unmapped else None,
        "speakerUnmapped": unmapped,
        "genderAgreement": round(same_gender / judged, 4) if judged else None,
        "genderJudged": judged,
        "wholeTaggedShare": tagged_share(ref_lines),
        "chunkedTaggedShare": tagged_share(other_lines),
        "wholeGenderConfidence": quantiles([c for p in reference for _, c in p["genders"]]),
        "chunkedGenderConfidence": quantiles([c for p in other for _, c in p["genders"]]),
    }


# ---- the tables -----------------------------------------------------------------------------------------------------------------


def label(run: dict[str, Any]) -> str:
    if run["mode"] == "whole":
        return "whole book"
    bound = f", chapters cut at {run['maxWords']} words" if run["maxWords"] else ", per chapter"
    return f"{run['workers']} worker{'s' if run['workers'] != 1 else ''}{bound}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", required=True, type=Path)
    parser.add_argument("--books", required=True, type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    books = {b["id"]: b for b in json.loads((args.books / "books.json").read_text(encoding="utf-8"))}
    runs: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for path in sorted(args.runs.glob("*.json")):
        if path.name.endswith(".skipped.json") or ".pipeline." in path.name:
            continue
        run = json.loads(path.read_text(encoding="utf-8"))
        row = path.name.split(".")[1]
        run["row"] = row
        runs[(path.name.split(".")[0], row)].append(run)
    lines: list[str] = []
    out = lines.append
    out("### Time and memory")
    out("")
    out("| Book (words) | Engine | Configuration | Chunks | Wall s | Load s | Read s | Speed-up vs whole | Peak GB | Failed |")
    out("| - | - | - | - | - | - | - | - | - | - |")
    for (book, row), group in sorted(runs.items(), key=lambda kv: (books[kv[0][0]]["words"], kv[0][1])):
        whole = next((r for r in group if r["mode"] == "whole"), None)
        for run in sorted(group, key=lambda r: (r["mode"] != "whole", r["maxWords"] or 0, r["workers"])):
            speed = f"{whole['wallSeconds'] / run['wallSeconds']:.2f}x" if whole and run is not whole else ""
            out(
                f"| {books[book]['title'].split(' by ')[0]} ({books[book]['words']:,}) | {row} | {label(run)} | {run['chunks']} | {run['wallSeconds']:.1f} | "
                f"{run['loadSeconds']:.1f} | {run['wallSeconds'] - run['loadSeconds']:.1f} | {speed} | {run['peakGB']} | {len(run['failedChunks'])} |"
            )
    out("")
    out("### GLiNER: chunked against whole book")
    out("")
    out("| Book | Configuration | Names whole | Names chunked | Precision | Recall | Same type | Max score drift | Score median whole / chunked |")
    out("| - | - | - | - | - | - | - | - | - |")
    for (book, row), group in sorted(runs.items(), key=lambda kv: (books[kv[0][0]]["words"], kv[0][1])):
        whole = next((r for r in group if r["mode"] == "whole"), None)
        if row != "gliner" or not whole:
            continue
        for run in sorted((r for r in group if r["mode"] != "whole"), key=lambda r: (r["maxWords"] or 0, r["workers"])):
            c = compare_gliner(whole, run)
            out(
                f"| {books[book]['title'].split(' by ')[0]} | {label(run)} | {c['wholeNames']} | {c['chunkedNames']} | {c['precision']:.3f} | {c['recall']:.3f} | "
                f"{c['sameType']:.3f} | {c['maxScoreDrift']} | {c['wholeScores']['median']} / {c['chunkedScores']['median']} |"
            )
    out("")
    out("### BookNLP: chunked against whole book")
    out("")
    out(
        "| Book | Weights | Configuration | Characters whole / chunked | Recall (major) | Precision | Split (major) | Conflated | Quotes whole / chunked | "
        "Speaker agreement | Gender agreement |"
    )
    out("| - | - | - | - | - | - | - | - | - | - | - |")
    for (book, row), group in sorted(runs.items(), key=lambda kv: (books[kv[0][0]]["words"], kv[0][1])):
        whole = next((r for r in group if r["mode"] == "whole"), None)
        if not row.startswith("booknlp") or not whole:
            continue
        for run in sorted((r for r in group if r["mode"] != "whole" and (r["maxWords"] or r["workers"] == 1)), key=lambda r: r["maxWords"] or 0):
            c = compare_booknlp(whole, run)
            out(
                f"| {books[book]['title'].split(' by ')[0]} | {row.split('-')[1]} | {label(run)} | {c['wholeCharacters']} / {c['chunkedCharacters']} | "
                f"{c['recall']:.3f} ({c['recallMajor']:.3f}) | {c['precision']:.3f} | {c['splitCharacters']} ({c['splitMajor']}) | {c['conflatedCharacters']} | "
                f"{c['wholeQuotes']} / {c['chunkedQuotes']} | {c['speakerAgreement']} ({c['quotesInBoth']} shared, {c['speakerUnmapped']} unmapped) | {c['genderAgreement']} ({c['genderJudged']}) |"
            )
    pipes = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(args.runs.glob("*.pipeline.*.json"))]
    if pipes:
        out("")
        out("### GLiNER alongside BookNLP, against one after the other")
        out("")
        out("| Book (words) | Weights | One after the other s | Together s | Speed-up | Peak GB (GLiNER / BookNLP) |")
        out("| - | - | - | - | - | - |")
        for p in sorted(pipes, key=lambda p: books[p["book"]]["words"]):
            b = books[p["book"]]
            peaks = p["peakGBEach"]
            out(
                f"| {b['title'].split(' by ')[0]} ({b['words']:,}) | {p['weights']} | {p['sequentialSeconds']} | {p['wallSeconds']} | {p['speedup']}x | {peaks.get('gliner')} / {peaks.get('booknlp')} |"
            )
    text = "\n".join(lines) + "\n"
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
