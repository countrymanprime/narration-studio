# 0001. The host is Go on a Wails v3 shell

**Status:** Accepted
**Significance:** Platform and structure. Every binding, event, window, dialog and installer is built on this shell, so replacing it rewrites the host and regenerates every UI binding.
**Date:** 2026-09-24

## Context

The app is a desktop program that drives a DAW, runs local models and keeps the narrator's files on their machine. The host is Go; the interface is a web UI in a native window. The shell started on Wails v2. The header zoom controls need the window's runtime `SetZoom`, which v2 lacks (it has only a startup zoom factor), and v3 has it. v3 is still a beta.

**Considered options:** stay on Wails v2 (no runtime zoom); serve the UI from a loopback HTTP server and open a browser tab (a port, a second trust boundary and a browser fallback the app does not want).

## Decision

- `apps/desktop` is the Go host. It runs on **Wails v3**, pinned to one exact beta in all three places that carry it: `apps/desktop/go.mod`, `@wailsio/runtime` in `apps/ui/package.json` and the CLI in `scripts/toolchain.json`. A new beta is its own reviewed change to all three.
- The UI reaches the host only through **generated, typed Wails bindings and native events**. The app opens no loopback HTTP server, port or browser fallback.
- The `Host` is the one bound service; an exported method on it is a binding. Every other call into Wails goes through `apps/desktop/wailsapp.go`, so tests run with no application.
- Where v3 changed a default from v2, the v2 behaviour is kept and held by a test (Ctrl+wheel zoom, no default context menu, a cancelled dialog is an empty selection, a binding error reaches the page as its text).
- `scripts/release/wails-build.mjs` builds the program and the Windows setup program.

## Consequences

- The UI cannot be run, tested or shipped as a plain web app; the Playwright suites drive a mock-backend build instead.
- Each beta bump can change generated code or behaviour, so it is reviewed on its own and never rides along.
- The shell is the single largest dependency we do not control. Leaving Wails means a new ADR that supersedes this one.
