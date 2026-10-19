"""Download pinned LibriVox recordings with the fixture's own checksum-verified fetch.

    python3 -I fetch_fixture.py <fixture dir> <destination dir> <source id>...

<fixture dir> is tests/fixtures/audio/librivox-alice. Each recording is kept only when its SHA-256 matches sources.json, as
`sources.fetch` does for the coverage corpus (tests/fixtures/audio/librivox-alice/README.md). Prints the path of each file.
"""

from __future__ import annotations

import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    fixture, destination, ids = Path(argv[1]).resolve(), Path(argv[2]), set(argv[3:])
    sys.path.insert(0, str(fixture))
    import sources  # the fixture's module; it needs only the standard library

    wanted = sources.load_sources(fixture)
    missing = ids - wanted.keys()
    if missing:
        print(f"unknown source id(s): {sorted(missing)}", file=sys.stderr)
        return 2
    sources.fetch(destination, ids)
    for source_id in sorted(ids):
        print(destination / wanted[source_id]["file"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
