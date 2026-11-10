# Python standards

Scope: `src/studio/libs/python/narration_common`, `src/studio/sidecars/*`, `scripts`.

## Enforced by tools

- `ruff` (version pinned in `pyproject.toml`; line length 160, target Python 3.11) for lint and format.
- `pyright` in basic mode with a ratchet: `scripts/ci/pyright-ratchet.mjs` allows no more errors per directory than `scripts/ci/pyright-ratchet.json`, and a lower count must be written down. A new file adds none.
- `pytest` (`pyproject.toml` `testpaths`), and the contract and coverage floors in CI.
- Doc comments: see `docs-style/references/python.md`.

## Judgement rules

1. **Types.** Annotate every public function and its return. Use `Protocol` for a port and `dataclass` (frozen where it can be) or `TypedDict` for a record, not a bare dict passed between modules. No bare `Any` without a reason.
2. **Errors.** Catch the specific exception you can handle; never a bare `except:` or a silent `except Exception: pass`. Raise a named error for a caller that branches on it, and chain with `raise X from err`. A sidecar reports failure through its output contract (`wire-contract-change`), not by printing a traceback.
3. **Modules.** One responsibility per module in `narration_common`. A sidecar's `core/` holds logic and imports no UI or host code; shared code used by two sidecars moves to `narration_common` after the impact scan (`change-impact-scan`).
4. **Functions.** Pure where you can: pass inputs in, return a value, keep I/O at the edges. No mutable default arguments. Use `pathlib.Path`, context managers for files and processes, and generators over building a large list.
5. **Untrusted input.** Parse and validate model output, files from someone else and sidecar arguments at entry. Never `eval`, `pickle.load` or `shell=True` on them.
6. **Naming.** `snake_case`, `PascalCase` classes, a leading underscore for module-private names. No one-letter names outside a short comprehension.
7. **Tests.** `pytest` functions named for the behaviour, with `tmp_path` for files and `parametrize` for tables of inputs. Use small in-memory fakes at the port, not `unittest.mock` patches of internals. A test imports the code the way production does.
