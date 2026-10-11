# Built-in recorder: what the app declares for it

The app's own recorder ([ADR 0455](../../adr/0455-the-built-in-recorder-records-each-take-to-a-partial-file-in-the-projects-recordings-folder-and-links-it-to-its-take-name.md), `apps/desktop/internal/recording`) is an engine of the DAW port with the kind `Built-in`. Its adapter is `apps/desktop/internal/dawport/builtin`, as of 2026-10-11.

## When it is the launch's engine

- **A launch with no DAW whose project records with the built-in recorder.** The project's choice is the `Recording.engine` row, which only the Booth's `RecorderChooseEngine` writes and which counts only where the recorder's capture row runs (Windows, [ADR 0357](../../adr/0357-the-built-in-recorders-capture-engine-is-a-wasapi-shared-mode-row-of-the-capture-port-through-portaudio-in-the-sidecar.md)).
- **`--daw Built-in`** (or `builtin`, any case). A launch from REAPER or Audacity keeps its DAW whatever the project chose.
- The host reads the kind in one place, `dawLaunchKind` in `apps/desktop/bindings_daw.go`, through `dawport.LaunchKind`. A page never sends a label that selects it ([threat model](../../architecture/threat-model.md), row 6f).

## What it declares

The recorder is part of the app, so it is always there and answering (`reachable: true`); a refusal is the declaration's or the settings', never the connection's. The payload for a project that chose it is [`daw-capabilities-builtin.json`](../../../tests/fixtures/contracts/daw-capabilities-builtin.json).

| Capability | Level | What it does, or the sentence | Source |
| --- | --- | --- | --- |
| `record` | Experimental | Records a take on the chosen microphone into the Recordings folder. Needs no track | `builtin.go`; `recording.Service.Start` and `Stop` |
| `takes` | Experimental | Choosing a line's take marks it the keeper | `builtin.go`; `recording.Service.SetTakeKeeper` |
| `project_read` | Unsupported | "The built-in recorder keeps no saved project." | The Studio Next mock's `SAVED_PROJECT.builtin` is `null` |
| `punch` | Not yet available | "Not available with the built-in recorder yet." | The mock's built-in setup has a roll; the recorder has none |
| `stack_takes`, `cut_range`, `fx_range` | Not yet available | "Not available with the built-in recorder yet." Mode `app` once each has a role | The mock's `selectors/daw.ts` defaults the built-in recorder to mode `app` |
| Every other capability | Unsupported | "Not available with the built-in recorder." | The mock's `BUILTIN_REASON` |

`record` and `takes` stay Experimental until the owner's microphone pass on [#510](https://github.com/countrymanprime/narration-utils/issues/510). Nothing it declares is destructive.

## Checked

- The conformance suite (`dawporttest.Run`) passes over a closed recorder and over none (`builtin_test.go`).
- The host golden and the UI mock agree (`apps/ui/src/api/wireContracts.test.ts`), and the mock setup `builtin` matches the golden's levels and sentences (`apps/ui/src/fixtures/daw.test.ts`).
- Not checked with a device: the recorder's own run with a microphone is the owner's pass.
