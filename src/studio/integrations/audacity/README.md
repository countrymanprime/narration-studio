# Audacity integration

The Audacity integration lives in the desktop host, not here. The adapter is `src/studio/desktop/internal/dawport/audacity` and the pipe client is `src/studio/desktop/internal/audacitybridge` ([The DAW port](../../../../docs/architecture/daw-integration.md#the-daw-port)). What it can do is in the DAW reference: [Audacity 3](../../../../docs/reference/daw/audacity-3.md), [Audacity 4](../../../../docs/reference/daw/audacity-4.md) and the [capability matrix](../../../../docs/reference/daw/matrix.md). The owner's checks are the [Audacity verification pass](../../../../docs/operations/audacity-verification-pass.md).

`<app name>` stands for values in `config/brand.json` ([Product and technical names](../../../../docs/architecture/codebase-map.md#product-and-technical-names)).

This folder holds no code. Unlike REAPER, Audacity loads no script of ours: the host drives it over `mod-script-pipe`, which only Audacity 3.x has.

There is no Audacity-side launcher. Nothing Audacity loads can start a program ([feasibility note](../../../../docs/research/audacity-launcher-feasibility.md)), so the installer adds a Start Menu entry, `<app name> for Audacity`, that starts the app with `--daw Audacity` ([Audacity boundary](../../../../docs/architecture/daw-integration.md#audacity-boundary)).
