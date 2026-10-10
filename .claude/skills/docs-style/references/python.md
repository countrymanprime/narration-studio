# Python docstrings

Source: [Google Python style guide, 3.8](https://google.github.io/styleguide/pyguide.html), [doctest](https://docs.python.org/3/library/doctest.html).

- Use the Google style throughout: a one-line summary ending in a period, a blank line, then `Args:`, `Returns:` or `Yields:`, `Raises:`.
- Every module opens with a docstring saying what it owns. In `narration_common` and the sidecars, cite the doc or ADR that holds the contract.
- Document behaviour and side effects (files written, network used, exceptions raised), not the implementation.
- A public function in `libs/python/narration_common` has a docstring. Private helpers need one only when the name does not say what they do.
- Type hints carry the types; do not repeat them in `Args:`.
- Prefer a doctest to a code block in prose when the example is short and deterministic.
- Checks today: `ruff` (default rules, no `D` rules), `pytest`. No docstring check runs yet.
