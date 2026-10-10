# Python docstrings

Source: [Google Python style guide, 3.8](https://google.github.io/styleguide/pyguide.html), [doctest](https://docs.python.org/3/library/doctest.html).

- Use the Google style throughout: a one-line summary ending in a period, a blank line, then `Args:`, `Returns:` or `Yields:`, `Raises:`.
- Every module opens with a docstring saying what it owns. In `narration_common` and the sidecars, cite the doc or ADR that holds the contract.
- Document behaviour and side effects (files written, network used, exceptions raised), not the implementation.
- A public function in `libs/python/narration_common` has a docstring. Private helpers need one only when the name does not say what they do.
- Type hints carry the types; do not repeat them in `Args:`.
- Prefer a doctest to a code block in prose when the example is short and deterministic.
- Checks today: `ruff` (default rules), `pytest`, and `scripts/ci/doc-comments.mjs python <dir>`, which runs ruff D100-D104 and D106 (Google convention) on lines your change adds in `libs/python` and the sidecars, skipping tests, spikes and `conftest.py`. A new public module, class, function or method with no docstring fails; `__init__` and magic methods are not required. Existing names are not flagged. A name that needs none takes `# noqa: D1xx`.
