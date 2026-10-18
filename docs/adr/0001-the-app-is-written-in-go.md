# 0001. The app is written in Go

**Status:** Accepted
**Significance:** Platform and structure. The language of the host fixes the toolchain, the build and release pipeline, the desktop shell, every binding and every test; changing it means rewriting the app.
**Date:** The choice was made at the start of the project and is not dated here. The Wails v3 move recorded below was decided on 2026-09-24.
**Supersedes:**

## Context

The app is a desktop program that drives a DAW, runs local models and keeps the narrator's files on their machine. The host needed a language that is fast, builds and releases with a simple pipeline, and is reliable.

**Considered options:** Rust and C#. Each had a problem with speed, with its pipeline and toolchain, or with reliability, so Go won on the combination. (A Rust toolchain that is slow to download and build is the kind of cost that counted against it.)

## Decision

- The host, `apps/desktop`, is written in **Go**.
- The desktop shell is **Wails v3**, pinned to one exact beta in `apps/desktop/go.mod`, `@wailsio/runtime` in `apps/ui/package.json` and the CLI in `scripts/toolchain.json`. v3 was chosen over v2 because it can set the window zoom at run time. The UI reaches the host only through generated, typed bindings and native events; the app opens no loopback HTTP server and has no browser fallback. How the shell is called, built and pinned is in [the codebase map](../architecture/codebase-map.md) and the `wails-v3` skill.

## Consequences

- One language and one toolchain for the host, which keeps the release pipeline short.
- The model and audio libraries the app uses are Python, so that work runs outside the host (see [the sidecar boundary](../architecture/codebase-map.md#sidecar-boundary)).
- Wails v3 is a beta, and each bump can change generated code, so a bump is its own reviewed change to all three pins.
- Replacing Go means a new ADR that supersedes this one.
