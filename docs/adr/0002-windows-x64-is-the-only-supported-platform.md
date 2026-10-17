# 0002. Windows x64 is the only supported platform

**Status:** Accepted
**Significance:** Platform. What gets built, released, installed, updated and tested follows from it, and widening it again means restoring pipelines, adapters and tests across the repo.
**Date:** 2026-09-27

## Context

The app began with macOS and Linux preview builds beside Windows. The narrators use Windows, the checks that matter run on it, and the preview builds cost pipeline time and made every platform-sensitive change carry untestable promises.

**Considered options:** keep the previews as unsupported extras (they still had to build and be described, and implied support); drop only the releases but keep the code paths (dead paths nobody could run).

## Decision

Windows x64 is the only platform the app is **built, released, installed, updated and supported** on.

- Removed: the macOS and Linux release builds, their rows in `scripts/release/assets.mjs`, the macOS app bundle step, the macOS-only CoreAudio capture backend, and every "macOS and Linux are previews" statement. On any other platform the update check says the app does not update itself.
- Kept, because none of it is platform support: Linux CI runners for platform-neutral checks (docs, the Lua harness, Playwright, sidecar tests, lint), and the Go module building on Linux as a development host (the `//go:build !windows` files). A check that runs on Linux proves the code, not a Linux app.
- The platform names a port descriptor may list (`windows`, `darwin`, `linux`) are Go's GOOS values, not a statement of where the app ships.

## Consequences

- No platform-specific behaviour has to be designed or verified for macOS or Linux.
- A contributor cannot run the app on a Mac or Linux box; the Windows `Build (Windows)` job is the one that proves a release.
- To support another platform, write a new ADR that supersedes this one and restores the build, update, capture and installer paths for it.
