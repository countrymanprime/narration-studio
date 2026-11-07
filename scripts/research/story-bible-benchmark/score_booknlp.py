"""Scores the BookNLP source's character entries against the Story Bible benchmark's labels.

Usage: python -I score_booknlp.py <labels.json> <suggest-output.jsonl>

The output is the sidecar's ``suggest --source booknlp`` lines for one benchmark book (run on the manuscript JSON made from
``<book>.txt.gz``). An entry counts as correct when its name, or failing that one of its aliases, is a labelled character's name or
alias, matched as benchmark_test.go matches them (``key``). It prints two JSON lines: entries, correct, precision, required, found, recall
and the wrong names, for every entry and for the entries named by a proper name. BookNLP gives no confidence for an entry, so none of its entries is ever applied without the narrator.
"""

from __future__ import annotations

import json
import re
import sys


def key(name: str) -> str:
    name = name.lower().replace("’", "'")
    name = name.removeprefix("the ")
    name = name.removesuffix("'s").removesuffix("'")
    return " ".join(re.findall(r"[^\W_]+", name))


def main() -> None:
    with open(sys.argv[1], encoding="utf-8") as handle:
        labels = json.load(handle)
    index: dict[str, str] = {}
    for label in labels["characters"]:
        for name in [label["name"], *label["aliases"]]:
            index[key(name)] = label["name"]
    with open(sys.argv[2], encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle]
    entries = [row["payload"] for row in rows if row.get("payload", {}).get("kind") == "entry"]
    print(json.dumps({"all": score(entries, index, labels)}, ensure_ascii=False))
    # The entries BookNLP names by a proper name: its name starts with a capital and is not a noun phrase ("The other guests").
    proper = [entry for entry in entries if entry["name"][:1].isupper() and not entry["name"].lower().startswith(("the ", "a ", "an "))]
    print(json.dumps({"proper": score(proper, index, labels)}, ensure_ascii=False))


def score(entries: list[dict], index: dict[str, str], labels: dict) -> dict:
    correct, wrong, found = 0, [], set()
    for entry in entries:
        match = next((index[key(n)] for n in [entry["name"], *entry.get("aliases", [])] if key(n) in index), None)
        if match is None:
            wrong.append(entry["name"])
        else:
            correct += 1
            found.add(match)
    required = [label["name"] for label in labels["characters"] if label["required"]]
    hits = [name for name in required if name in found]
    return {
        "entries": len(entries),
        "correct": correct,
        "precision": round(correct / len(entries), 3) if entries else 1,
        "required": len(required),
        "found": len(hits),
        "recall": round(len(hits) / len(required), 3) if required else 1,
        "wrong": wrong,
    }


if __name__ == "__main__":
    main()
