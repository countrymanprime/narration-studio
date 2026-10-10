---
name: sidecar-add
description: Adding a new Python sidecar under sidecars/ or a new mode to an existing one? The project, test, packaging, release-check, asset and threat-model steps that are easy to miss.
---

# sidecar-add

## Why this exists

A sidecar is a Python program the Go host launches as a bundled executable. Besides its source, a sidecar needs an Nx project, a coverage floor, packaging, an entry in the installable-release check, model assets and the arguments the host passes it. Each is a separate file, and a missing one fails in a release build or on a clean install.

## When to use this

A new directory under `sidecars/`, or a new mode, argument or output format on an existing sidecar (`manuscript-guide`, `manuscript-teleprompter`, `transcript-compare`).

## What to do

1. `change-impact-scan` on `libs/python/narration_common` for anything you plan to share. Put shared logic there, not in a sidecar's `core/`.
2. Layout to mirror: `sidecars/<name>/{core,tests}/` and `project.json` (copy `sidecars/transcript-compare/project.json`: tag `toolchain:python`, `implicitDependencies` of `narration-common` and `config`, `lint` and `test` targets, the test through `scripts/ci/coverage-gate.mjs`).
3. TDD (`tdd-workflow`). Start a new logic directory at an 80 floor in `scripts/ci/coverage-floors.json`; a lower floor needs a written reason.
4. Host wiring: add the project to `implicitDependencies` in `apps/desktop/project.json`, add the executable name to the list in `scripts/release/verify-installable.mjs` (and its test), and extend the packaging that builds the sidecar with PyInstaller.
5. Output: what the sidecar writes for the host (NDJSON lines, progress files, JSON) is a wire contract; follow `wire-contract-change`, including a golden file from `contract_files.check`.
6. Models and data files go through the asset registry (`config/*-assets.json`, `internal/assets`), never a download inside the sidecar: analysis is local and the host owns the first-use download flow (ADR 0032, depguard in `apps/desktop/.golangci.yml`).
7. Arguments the host passes are a trust boundary. Validate paths and values in the sidecar and re-read the sidecar row in `docs/architecture/threat-model.md` and `SECURITY.md`; a new licence needs the dependency review (`scripts/licenses`).
8. `full-verification-gate`, then `feature-cleanup`.

## What this skill is not

It does not pick ML models or decide whether the work belongs in Python or Go; that is an ADR-level decision (`adr-author`).
