"""Every text file a sidecar opens names its encoding: on Windows the default is cp1252, which cannot read what the app writes."""

import ast
import unittest
from pathlib import Path

SIDECARS = Path(__file__).resolve().parents[2]
TEXT_METHODS = {"read_text", "write_text"}


def _is_binary(call: ast.Call) -> bool:
    modes = [arg for arg in call.args[1:2]] + [kw.value for kw in call.keywords if kw.arg == "mode"]
    return any(isinstance(mode, ast.Constant) and isinstance(mode.value, str) and "b" in mode.value for mode in modes)


def _unencoded(path: Path) -> list[str]:
    found = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if not isinstance(node, ast.Call) or any(kw.arg == "encoding" for kw in node.keywords):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        is_open = name == "open" and not (isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id in {"av", "wave"})
        if (name in TEXT_METHODS or is_open) and not _is_binary(node):
            found.append(f"{path.relative_to(SIDECARS)}:{node.lineno}")
    return found


class SidecarTextEncodingTests(unittest.TestCase):
    def test_no_sidecar_opens_a_text_file_in_the_locale_encoding(self):
        sources = [p for p in SIDECARS.glob("*/core/**/*.py")]
        self.assertTrue(sources)
        self.assertEqual([], [hit for source in sources for hit in _unencoded(source)])


if __name__ == "__main__":
    unittest.main()
