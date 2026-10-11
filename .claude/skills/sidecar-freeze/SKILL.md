---
name: sidecar-freeze
description: Changing what a Python sidecar imports, loads or ships, or the PyInstaller arguments in scripts/release/prepare-resources.py? How the three sidecars are frozen, what a freeze silently loses (data files, package metadata, ctypes-loaded DLLs), and the four places that must change together so a release does not start with a broken sidecar. Load before adding a Python dependency, a data file or a native library to a sidecar, or before touching the freeze.
---

# sidecar-freeze

## Why this exists

The release carries each Python sidecar as a PyInstaller `--onedir` freeze. A freeze that is missing a data file, a package's metadata or a DLL loaded with `ctypes` still builds, still starts and still answers `--help`; the feature fails later on the narrator's machine. Piper's `espeak-ng-data`, `cmudict` and Moonshine's DLLs were each lost that way. `sidecar-add` covers a new sidecar; this skill covers what goes into a freeze and how to prove it got there.

## When to use this

- A sidecar or `libs/python/narration_common` gains an import of a third-party package, a data file, a model path or a native library.
- A dependency pin changes in `pyproject.toml` (the freeze reads the locked environment).
- Any edit to `scripts/release/prepare-resources.py`, `scripts/release/verify-installable.mjs` or the sidecar smoke checks in `apps/desktop/smoke.go`.
- A Windows-only or other platform-conditional dependency (`moonshine-voice`, `sounddevice`).

## How the freeze works

1. `scripts/release/prepare-resources.py` lists three `Sidecar` entries (`manuscript-guide`, `transcript-compare`, `manuscript-teleprompter`): an entry file, `--paths` (the shared `libs/python` and the sidecar's `core/`), and per-sidecar `collect_data`, `copy_metadata`, `collect_binaries` and `exclude_modules`.
2. Each runs `python -m PyInstaller --onedir` in `.release-build/<name>/`, all three at once, each with its own `PYINSTALLER_CONFIG_DIR` (`--clean` wipes a shared cache another freeze is reading). Output is streamed and tagged by sidecar; every failure is reported, not just the first.
3. The result is copied to `apps/desktop/cmd/narration-utils/resources/runtime/<name>/`, which `go:embed` ships in `main.go`. Models and voices are not frozen: they are first-use downloads from the hashed catalogs in `config/*-assets.json`.
4. CI caches the finished freeze (`.github/actions/build-native`, [the freeze cache](../../../docs/operations/ci-and-releases.md#the-sidecar-freeze-cache)). The key hashes `sidecars/`, `libs/python/`, `pyproject.toml`, `uv.lock` and `prepare-resources.py`, so any of them changing refreezes. The smoke test, `verify-installable.mjs` and the notices run on every build, hit or miss. Run a cold freeze with `Prerelease` and `cold-freeze` ticked.

## What to do

1. **Decide what the new thing needs from the freeze.** PyInstaller follows plain `import` statements. It does not follow:
   - **Data files** a package reads from its own folder (`piper/espeak-ng-data`, `cmudict/data`, `faster_whisper`'s Silero VAD model): add the package to the sidecar's `collect_data`.
   - **Package metadata** a package reads with `importlib.metadata` (`cmudict` reads its own version): add it to `copy_metadata`.
   - **Native libraries loaded with `ctypes`** (`moonshine.dll`, `onnxruntime.dll`): add the package to `collect_binaries`. A package with a PyInstaller hook in `pyinstaller-hooks-contrib` (`sounddevice`) needs nothing here, but still needs a check (step 3).
   - **Your own data files:** keep them as Python, as `narration_common/spoken_forms.py` does, so an import carries them. A data file beside a script is lost.
2. **Exclude what the freeze must not carry.** `exclude_modules` removes an optional speed-up the sidecar never runs (`google_crc32c`). The freeze already takes more than the runtime needs (`hypothesis`, `pytest`, `setuptools`, `fastapi`; [#245](https://github.com/countrymanprime/narration-utils/issues/245)); do not add to that without a reason, because every shipped package is a licence line in `THIRD-PARTY-NOTICES`.
3. **Prove it is in the tree and that it loads, in two places.** A change to the freeze is incomplete with only one:
   - `scripts/release/verify-installable.mjs` checks the file exists under `runtime/<name>/_internal/` before the native build (a platform-only dependency inside `process.platform === 'win32'`). Add a check with an error that names the file and `prepare-resources.py`.
   - `apps/desktop/smoke.go` (`narration-utils --smoke`) runs the frozen executable and proves it loads and answers. Prefer extending the sidecar's own `self-check` or `--capabilities --verify` report (`guide:cmudict`, `guide:espeak`, `teleprompter:capabilities`) over a new flag; ADR 0403 says the report states what registered and what `--verify` loaded.
4. **Add a test to `scripts/release/tests/test_prepare_resources.py`** that pins the new argument (the guide's `test_the_guide_freeze_carries_piper_data_and_the_cmu_dictionary` is the pattern), and a case to `verify-installable.test.mjs` for the new check.
5. **Platform-conditional dependencies** (an `sys_platform` marker in `pyproject.toml`): condition the `Sidecar` argument the same way (`collect_binaries=("moonshine_voice",) if sys.platform == "win32" else ()`), and the verify and smoke checks. Windows is the only supported platform ([ADR 0412](../../../docs/adr/0412-windows-is-the-only-supported-platform-for-now.md)), so the freeze that matters is the Windows one.
6. **A new package or version is a licence and trust change.** Run the dependency review (`scripts/licenses`); `notices.py` fails the build when a frozen module has no owning distribution or a licence it cannot name, and `reviewed.json`, `manual.json` and `model-review.json` are where a person records the decision. Re-read the sidecar and release-pipeline rows of `docs/architecture/threat-model.md`.
7. **Check it locally where you can.** `uv run python scripts/release/prepare-resources.py --sidecar <name>` freezes one sidecar (never `--reuse` unless you know the folder is current), then `node scripts/release/verify-installable.mjs`. The smoke test and the one-word Piper synthesis (`--piper-model`) run on Windows; CI does not speak a word (the voice is 114 MB), so run that check by hand whenever the freeze arguments change, and write "pending, owner" for anything you could not run.
8. `full-verification-gate`, then `feature-cleanup`. A freeze change is not verified by `pnpm check` alone: the Windows `Build (Windows)` job is the check, so say in the PR what you ran locally and what only CI ran.

## What this skill is not

It does not add a sidecar (`sidecar-add`), choose a model (the asset registry and `adr-author` do), or change what the sidecar writes to the host (`wire-contract-change`). It does not repeat the PyInstaller manual: read the pinned version's docs for an argument you have not used here.
