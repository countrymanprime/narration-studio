---
name: wails-v3
description: Touching the Wails v3 desktop shell (apps/desktop)? How this repo calls Wails, where bindings, events, windows and dialogs live, what the generated bindings and the beta pin require, and the Windows behaviours that differ from v2. Load before adding a Host method, a live event, a dialog, a window option or a Wails version bump.
---

# wails-v3

## Why this exists

Wails v3 is a beta, and this repo pins it ([ADR 0200](../../../docs/adr/0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md)). Its API moves between betas and several defaults differ from v2. An agent that writes v3 code from memory, or from the v2 docs, produces calls that do not exist, bypass the one file that wraps Wails, or break under `go test` where there is no running application.

## When to use this

Any change under `apps/desktop` that calls into `github.com/wailsapp/wails/v3`, adds or changes an exported `Host` method, emits a live event, opens a dialog, changes the window, or touches the generated bindings in `apps/ui/wailsjs`. For a change to the shape of a payload, also load `wire-contract-change`. For a new `Host` method that reads a project service, also read [host binding concurrency](../../../docs/architecture/host-binding-concurrency.md).

## What to do

1. **Verify the API against the pinned version, not memory.** Read the module source for the version in `apps/desktop/go.mod` (`go -C apps/desktop list -m -f '{{.Dir}}' github.com/wailsapp/wails/v3`, then `pkg/application`). Wails v2 names (`wails.Run`, `runtime.*` taking a `context.Context`) do not exist here.
2. **Every call into Wails goes through `apps/desktop/wailsapp.go`** (ADR 0200 item 3): `emitEvent`, `mainWindow`, `bringWindowForward`, `pickFile`, `pickFiles`, `pickFolder`, `openInBrowser`, `quitApplication`. Add a new helper there rather than calling `application.Get()` elsewhere. With no application (every test) a helper is a no-op or returns `errHostNotReady`, so a test never needs a window. `application.New` and the window options live only in `main.go`.
3. **Narrow what you need to an interface** when a binding drives a window: `zoomWindow` in `bindings_window.go` and `companionWindow` in `bindings_companion.go` are the pattern. A real `application.Window` satisfies it and a test passes a fake.
4. **A binding is an exported method on `Host`**, the one bound service (`application.NewService(host)` in `main.go`). v3 binds every exported method except `ServiceStartup` and `ServiceShutdown`, so an exported helper is a binding by accident. Keep helpers unexported.
   - A binding returns `(string, error)` through `encodeBinding(value, err)` (`bindings.go`), a JSON string the UI decodes with a Zod schema. Do not return a struct.
   - Read project services only through `h.services()` ([host binding concurrency](../../../docs/architecture/host-binding-concurrency.md)); `hostguard_test.go` fails a direct field read.
5. **After any change to a `Host` method's name, signature or doc comment, regenerate the bindings:** `pnpm --dir apps/desktop run bindings` (`wails3 generate bindings -ts -noevents -noindex`, into `apps/ui/wailsjs`). The generated files carry the Go doc comments, so a comment edit changes them. Do not edit them by hand.
6. **Events:** the host emits one value per event with `emitEvent(name, data)`. The UI receives a `WailsEvent` and checks `data` against the event's schema in `apps/ui/src/api/wailsClient.ts`. A new event follows `wire-contract-change` (schema, golden payload, contract row, mock). Emit from a goroutine the call does not hold `h.mu` in (ADR 0022 and the concurrency doc).
7. **Keep Wails out of the UI components.** `@wailsio/runtime` and `apps/ui/wailsjs` are importable only under `apps/ui/src/api` (dependency-cruiser rules `wails-runtime-only-in-api` and `wails-bindings-only-in-api`, `architectureRules.test.ts`).
8. **Dialogs:** a cancelled Windows file dialog returns the error text `cancelled by user`, which `cancelIsEmpty` turns into an empty selection. Use `pickFile`, `pickFiles` and `pickFolder` so a cancel is never shown as an error.
9. **A failed binding rejects with a `RuntimeError`, not its text.** `hostErrorText` in `wailsClient.ts` unwraps it; a new client path must go through it.
10. **Window options are deliberate.** `mainWindowOptions` in `main.go` sets `ZoomControlEnabled: true` and `DefaultContextMenuDisabled: true` to keep v2's behaviour, and `wailsapp_test.go` holds them. Do not drop either while tidying options.
11. **Zoom on Windows:** `SetZoom` floors at 1.0 and v3 sends no zoom-changed event, so the page reads the level back from the window ([ADR 0201](../../../docs/adr/0201-app-zoom-under-wails-v3-on-windows-runs-from-100-to-200-percent-and-reads-the-level-back-from-the-window.md), Proposed).
12. **A Wails bump is its own reviewed change of three pins** (ADR 0200 item 1): `apps/desktop/go.mod`, `@wailsio/runtime` in `apps/ui/package.json` (exact version), and the CLI in `scripts/toolchain.json` plus `.github/actions/setup-toolchain`. Regenerate the bindings, then run the full gate. A new beta needs a note in the ADR or a superseding one.
13. **Build and run:** `pnpm --dir apps/desktop run build` runs `scripts/release/wails-build.mjs` (no Taskfile). There is no hot reload; use `pnpm --dir apps/ui dev:mock` for UI work and `pnpm --dir apps/desktop dev` to run the app. Windows is the only supported platform ([ADR 0412](../../../docs/adr/0412-windows-is-the-only-supported-platform-for-now.md)).
14. `full-verification-gate`, then `feature-cleanup`.

## Known drift to resolve

As of 2026-10-11, `apps/desktop/go.mod` requires `v3.0.0-beta.26` (Dependabot, #919) while ADR 0200, `@wailsio/runtime` and the `wails3` CLI in `.github/actions/setup-toolchain` are all at `beta.25`. Check `git log -- apps/desktop/go.mod` and the three pins before relying on either number, and settle it with a pin change or an ADR note.

## What this skill is not

It is not a copy of the Wails docs. Read the pinned module source for signatures. It does not choose a Wails version; ADR 0200 and the owner do.
