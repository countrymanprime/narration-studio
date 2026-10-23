"""narration_common.brand is written by scripts/brand/sync.mjs; this fails when it was edited by hand or config/brand.json
changed without `pnpm run brand:sync`."""

import json
from pathlib import Path

from narration_common import brand

BRAND_FILE = Path(__file__).resolve().parents[5] / "config" / "brand.json"


def test_generated_module_matches_the_brand_file() -> None:
    file = json.loads(BRAND_FILE.read_text(encoding="utf-8"))
    assert brand.NAME == file["name"]
    assert brand.PROJECT_FOLDER == file["identity"]["projectFolder"]
    assert brand.DATA_FOLDER == file["identity"]["dataFolder"]
