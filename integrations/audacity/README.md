# Audacity integration

The Audacity integration lives in the desktop host, not here. The adapter is `apps/desktop/internal/dawport/audacity` and the pipe client is `apps/desktop/internal/audacitybridge` ([ADR 0355](../../docs/adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)). What it can do is in the DAW reference: [Audacity 3](../../docs/reference/daw/audacity-3.md), [Audacity 4](../../docs/reference/daw/audacity-4.md) and the [capability matrix](../../docs/reference/daw/matrix.md). The owner's checks are the [Audacity verification pass](../../docs/operations/audacity-verification-pass.md).

This folder holds no code. Unlike REAPER, Audacity loads no script of ours: the host drives it over `mod-script-pipe`, which only Audacity 3.x has.

There is no Audacity-side launcher. Nothing Audacity loads can start a program ([feasibility note](../../docs/research/audacity-launcher-feasibility.md)), so the installer adds a Start Menu entry, "Narration Studio for Audacity", that starts the app with `--daw Audacity` ([ADR 0145](../../docs/adr/0145-the-audacity-launcher-is-an-installer-start-menu-entry-and-a-picker-switch-keeps-an-audacity-launch.md)).
