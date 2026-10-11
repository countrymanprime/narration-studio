# Audacity 3.x: what the app relies on

Engine facts the Audacity adapter depends on, as of 2026-10-10. The protocol below is the published `mod-script-pipe` of Audacity 3; the adapter was built from that spec and has not yet been through the owner's verification pass ([ADR 0355](../../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)). Nothing on this page was observed in a running Audacity 3: the protocol facts, the 1024-byte limit, the escaping rules and the behaviour table below come from the published manual and Audacity's source ([research, "Not verified"](../../research/audacity-4-scripting-spec.md#not-verified)).

## How the app reaches Audacity

- **Over the scripting pipe**, which the narrator must enable (Preferences, Modules). The client is `apps/desktop/internal/audacitybridge`; the adapter is `apps/desktop/internal/dawport/audacity`.
- **Two fixed Windows named pipes**, opened `ToSrvPipe` first then `FromSrvPipe`. Names and the `\r\n\0` line ending are fixed in code, never taken from a setting.
- **One command per read, at most 1024 bytes.** The client refuses a line over 1020 bytes and a text value over 900.
- **A reply is lines, a terminator, then an empty line.** The terminator is exactly `BatchCommand finished: OK` or `Failed!`; anything else drops the connection.
- **No project window answers with a bare empty line.** The client reports "no project" and keeps the connection.
- **No server-side timeout.** A modal dialog holds the answer, so the client times out at 5 s, closes the connection and reconnects on the next request.

## Behaviour the adapter works around

| Audacity behaviour | What the adapter does |
| --- | --- |
| Carriage returns and line feeds are deleted, and quote and backslash escaping is not safe | A text value with a double quote, a backslash or a control character is refused; label text is cleaned first; paths use forward slashes |
| `AddLabel` takes no parameters: it labels the selection on the selected label track, or makes a track | The adapter selects its own track and the time, adds, reads the labels again to find the new empty one, and names it with `SetLabel` |
| `GetInfo` times carry six significant digits | A label is found by the finding identity in its text, never by exact time |
| `TogglePlayRegion` misbehaves when scripted | Loop is `SelectTime` then `PlayAtSpeedLooped`; Stop is `Stop` |
| `Export2` picks the exporter by file extension, and `CL` runs an external program | Export accepts only `.wav`, `.flac`, `.mp3`, `.ogg`, `.aiff` and `.aif` |
| Anyone who can write to the pipe can make Audacity read and write files | Remote clients are rejected; see the Audacity rows of [the threat model](../../architecture/threat-model.md) |

The full table, with the commands and their reply shapes, is [the Audacity 4 spec research](../../research/audacity-4-scripting-spec.md#what-this-means-for-the-build).

## What the app has no Audacity equivalent for

Audacity has no items, takes or extension data. Take creation, pickups, line identity and render setup are REAPER-only, and the review page hides REAPER's take management for an Audacity launch instead of showing it disabled ([ADR 0660](../../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md)).

## Not yet available

`cut_range`, `fx_range`, `stack_takes` and `backups` are in the catalogue but not yet available with Audacity: the adapter has no role for them. Every other capability except navigate, markers and `macro_render` is not yet available too ([matrix](matrix.md)).

## Checking a capability in Audacity

[The Audacity verification pass](../../operations/audacity-verification-pass.md): Part A runs unattended against Audacity 3 with the module enabled and records the installed version first; Part B is by eye and ear. Its table gives the expected result of each step. On Audacity 4.0, step A1 fails with "not reachable" and the run stops.
