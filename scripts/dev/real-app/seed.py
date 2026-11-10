#!/usr/bin/env python3
"""Seeds a project folder the real desktop host and a real REAPER can both open (docs/operations/real-app-driver.md, "Real host plus real REAPER").

    seed.py <project-dir> [--layout flat|folders] [--tracks N] [--items N] [--chapter c-0002]

Writes the manuscript, the project link to <project-dir>/Book.rpp, the chapter link, and Book.rpp itself: the chapter's track (a folder
of voices with --layout folders: Chapter One > Narrator > Main, the takes on Main), --tracks extra empty tracks, and --items synthetic
tone takes (<project-dir>/Media/take-N.wav, 5 s each, end to end) on the chapter's track. Every track carries a TRACKID line: without
one REAPER gives the track its own GUID and the host's link answers TRACK_STALE. Prints the GUIDs as JSON.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MANUSCRIPT = ROOT / "tests/fixtures/guide-rules/after-the-applause.manuscript.json"
APP = json.loads((ROOT / "config/brand.json").read_text(encoding="utf-8"))["identity"]["projectFolder"]  # the app's folder inside a project (config/brand.json)


def guid(n: int) -> str:
    return f"{{A0000000-0000-4000-8000-{n:012d}}}"


def tone(path: Path, hz: float, seconds: float = 5.0, rate: int = 22050) -> None:
    frames = b"".join(struct.pack("<h", int(0.3 * math.sin(2 * math.pi * hz * i / rate) * 32767)) for i in range(int(seconds * rate)))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(frames)


def track(n: int, name: str, depth_delta: int, items: str = "", busmode: int = 0) -> str:
    return f'  <TRACK {guid(n)}\n    TRACKID {guid(n)}\n    NAME "{name}"\n    ISBUS {busmode} {depth_delta}\n{items}  >\n'


def item(n: int, path: Path, position: float) -> str:
    return (
        f'    <ITEM\n      POSITION {position}\n      LENGTH 5\n      IGUID {guid(5000 + n)}\n      NAME "take-{n}"\n      SOFFS 0\n'
        f'      PLAYRATE 1 1 0 -1 0 0.0025\n      GUID {guid(6000 + n)}\n      <SOURCE WAVE\n        FILE "{path}"\n      >\n    >\n'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("project", type=Path)
    parser.add_argument("--layout", choices=("flat", "folders"), default="flat")
    parser.add_argument("--tracks", type=int, default=0, help="extra empty tracks after the chapter's")
    parser.add_argument("--items", type=int, default=0, help="takes on the chapter's track")
    parser.add_argument("--chapter", default="c-0002")
    args = parser.parse_args()
    project = args.project.resolve()
    app = project / APP
    (app / "manuscript").mkdir(parents=True, exist_ok=True)
    (project / "Media").mkdir(exist_ok=True)

    manuscript = json.loads(MANUSCRIPT.read_text(encoding="utf-8"))
    (app / "manuscript" / "manuscript.json").write_text(json.dumps(manuscript), encoding="utf-8")
    title = next(c["title"] for c in manuscript["chapters"] if c["id"] == args.chapter)

    takes = []
    for n in range(args.items):
        path = project / "Media" / f"take-{n}.wav"
        tone(path, 220.0 + 20 * (n % 8))
        takes.append(item(n, path, 5.0 * n))
    rpp = project / "Book.rpp"
    rows = ""
    if args.layout == "folders":
        rows += track(1, title, 1, busmode=1) + track(2, "Narrator", 1, busmode=1) + track(3, "Main", -2, "".join(takes), busmode=2)
        first = 4
        (app / "voice-tracks.json").write_text(json.dumps({"schemaVersion": 1, "layout": "folders", "narratorCharacter": "", "tracks": {}}), encoding="utf-8")
    else:
        rows += track(1, title, 0, "".join(takes))
        first = 2
    for n in range(args.tracks):
        rows += track(first + n, f"Extra {n + 1}", 0)
    rpp.write_text(f'<REAPER_PROJECT 0.1 "7.0" 0\n  RECORD_PATH "Media" ""\n{rows}>\n', encoding="utf-8")

    (app / "project.json").write_text(
        json.dumps(
            {
                "marker": f"{APP}-project",
                "name": "",
                "createdAt": "2026-11-10T00:00:00Z",
                "dawProjectFile": {"absolute": str(rpp), "relative": "Book.rpp"},
                "chapterSync": {"enabled": False, "decidedAt": "2026-11-10T00:00:00Z"},
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    link = {"trackGuid": guid(1), "chapterId": args.chapter, "chapterTitle": title, "confirmedAt": "2026-11-10T00:00:00Z", "origin": "manual", "match": None}
    (app / "chapter-track-map.json").write_text(
        json.dumps({"schemaVersion": 2, "documentId": manuscript["documentId"], "mappings": [link]}, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "project": str(project),
                "rpp": str(rpp),
                "chapter": args.chapter,
                "chapterTrack": guid(1),
                "voiceTrack": guid(2) if args.layout == "folders" else guid(1),
            }
        )
    )


if __name__ == "__main__":
    main()
