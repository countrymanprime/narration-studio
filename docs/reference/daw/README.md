# DAW reference

What each digital audio workstation (DAW) can do for the app, and what each capability returns. Reference pages only: they mirror the code and cite the evidence; the dated research behind them stays in [research](../../research/).

| Page | Answers |
| --- | --- |
| [Matrix](matrix.md) | Which engine declares which capability at which level. Generated from the adapters |
| [Capabilities](capabilities.md) | What each capability is for, what a conforming engine returns, how each engine maps to it, and where it was checked |
| [REAPER](reaper.md) | How the app reaches REAPER, the behaviour a fake cannot prove, version rules |
| [Audacity 3.x](audacity-3.md) | The scripting pipe the adapter speaks and the workarounds it carries |
| [Audacity 4.x](audacity-4.md) | Why nothing is reachable there, and what would change that |
| [Built-in recorder](builtin-recorder.md) | The app's own recorder as an engine: what it declares and why |

## Using it

- **Planning a feature that touches a DAW:** find the capability in [capabilities](capabilities.md). If none fits, a new capability is a row in the port's catalog, a role interface and a conformance case ([ADR 0300](../../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md)); write its section here first.
- **Adding an engine or a version:** add a column to the test that generates [the matrix](matrix.md), a page like [REAPER](reaper.md), and a section line per capability.
- **Changing a declared level:** run `UPDATE_DAW_DOCS=1 go test ./internal/dawport/dawportdoc` from `apps/desktop`, commit the new matrix, and update the capability's "Checked" line with the run that justified it.

## Rules for these pages

- A statement about an engine names its source: a spike, a verification-pass row, a harness test, a published page, or the code. "Not checked" is written where no run backs it.
- Dates and versions go beside any fact that can age ([docs-style](../../../.claude/skills/docs-style/SKILL.md)).
- The matrix is never edited by hand; a test fails when it differs from the declarations.
