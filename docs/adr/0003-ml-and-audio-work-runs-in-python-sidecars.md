# 0003. ML and audio work runs in Python sidecars

**Status:** Accepted
**Significance:** Structure and construction. Where speech recognition, extraction and audio analysis live fixes the languages, the packaging, the release freeze and the process model; moving it means rewriting the analyzers and the release pipeline.
**Date:** 2026-09-19

## Context

The models the app depends on (speech recognition, entity extraction, pronunciation, voice synthesis, audio analysis) live in the Python ecosystem. The host is Go and must stay small, start fast and keep the narrator's machine safe.

**Considered options:** embed Python in the Go process (one crash or hang takes the app with it, and Go cannot unload it); rewrite the analyzers in Go (the model libraries do not exist there); a long-running local server (a port and a lifetime to manage).

## Decision

- Model and audio work runs in **three Python sidecars**, `sidecars/manuscript-guide`, `sidecars/manuscript-teleprompter` and `sidecars/transcript-compare`, over the shared `libs/python/narration_common`. Each is its own process, started on demand by the host, never a service the app keeps running.
- The host talks to a sidecar through its command line and a file or stream contract (JSON, or NDJSON for live output; a stop file ends a live run). The sidecar writes to the project only through the host.
- Release freezes each sidecar with PyInstaller `--onedir` into the embedded resources. Models and voices are **not** frozen: they are first-use downloads from hashed catalogs (see ADR 0006).
- Engines and providers sit behind small ports with a registry and a capability descriptor in both languages (`apps/desktop/internal/*port`, `narration_common.ports`); callers ask what is supported and never name an adapter.

## Consequences

- A sidecar crash or hang costs one run, not the app.
- Every Python dependency is a release-size and licence cost, and a freeze that misses a data file or DLL builds and starts but fails on the narrator's machine, so changes to what a sidecar imports follow the `sidecar-freeze` skill.
- Adding a model or engine is a registry row and a catalog entry, not a new architecture.
