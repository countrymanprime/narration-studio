# 0401. Companion mode resizes and pins the one existing window, and never opens a second one

**Status:** Accepted
**Date:** 2026-09-26

## Context

The benchmark's [audiobook studio benchmark](../research/audiobook-studio-benchmark.md) recommendation 2 asks for "the compact companion panel," a narrow, always-on-top panel that stays visible beside the DAW so a narrator working with REAPER as the primary window can punch, resolve a note or check a pickup without switching away from REAPER.

The desktop shell moved to Wails v3 ([ADR 0200](0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md)) with no new native menu, no system tray and no second window. `apps/desktop/wailsapp.go` reflects this today: `application.Get().Window.GetByName("main")` is the only window the host ever asks for, and the one existing call to `SetAlwaysOnTop` (`bringWindowForward`) is a one-shot nudge that turns itself off in the same function, not a persisted mode.

A second, independent always-on-top webview window (Wails v3's `application.NewWebviewWindow`) would satisfy the benchmark's description most literally, but it reopens the "no second window" choice made deliberately for the shell, doubles the surfaces that need their own lifecycle, focus and accessibility handling, and gives the host two windows to keep in sync with one project's state instead of one.

## Decision

Companion mode is implemented as two new bindings, `CompanionModeEnter()` and `CompanionModeExit()`, that resize and pin **the existing single window** (`apps/desktop/wailsapp.go`'s `mainWindow()`): `Enter` records the window's current size and position, sets it to a narrow width (380 px) and turns `SetAlwaysOnTop(true)` on and keeps it on; `Exit` restores the saved bounds and turns `AlwaysOnTop` back off. No second `application.Window` is created. The UI renders `CompactShell` in place of the normal layout while companion mode is active, exactly as it would render any other route or dialog state.

This keeps the shell's "no second window" choice intact; this ADR narrows it rather than superseding it, by naming the one exception it must still respect (a persisted `AlwaysOnTop`, which that decision did not anticipate but does not forbid, since `bringWindowForward` already used the same call for a shorter purpose).

## Consequences

- Companion mode inherits every accessibility and state-management guarantee the main window already has; there is no second window to keep an aria snapshot or a live-event subscription in sync with.
- The window's minimum practical width is bounded by whatever REAPER's own transport toolbar and menu need to stay usable beside it; this is a design constraint for `CompactShell`'s 380 px target, not a code constraint.
- A narrator cannot see the companion panel and the full app at the same time on one monitor; "Full app" (or a double-Escape) is the only way back, and this ADR's Consequences accept that trade over the added complexity of a second window.
- If a future decision needs a genuinely independent second window (for example, a tear-off panel on a second monitor that stays visible while the main window also shows the full app), that decision would need its own ADR superseding both this one and the "no second window" choice, with the added lifecycle and accessibility work spelled out.
