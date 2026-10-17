# 0870. An allow-listed activity trace records how the app behaves, off by default, and never records content

**Status:** Proposed
**Significance:** A quality attribute and an interface between parts: every layer (UI, host, sidecars, DAW bridge) gains one typed, redacting way to write a log record, and the rule for what a log may hold changes from a convention to a registry the code cannot step around. Reversing it means re-auditing every call site for leaks.
**Date:** 2026-10-17
**Supersedes:** [ADR 0251](0251-tool-runs-are-logged-as-json-lines-through-slog-with-a-run-id-and-content-is-never-logged.md), on acceptance: clauses 1 to 5 stand as written there, clause 6 is replaced by point 3 below. Until this is Accepted, 0251 holds and its Status is unchanged. It extends [ADR 0253](0253-bridge-commands-carry-the-hosts-run-id-as-trailing-fields-and-lua-logs-them-to-bridge-jsonl-at-debug-level.md) (point 9) and [ADR 0069](0069-payloads-are-validated-with-zod-behind-parsewire-and-a-wrong-shape-fails-loudly.md) (`host.log` retires, point 8). Tracking issue: [#1827](https://github.com/countrymanprime/narration-utils/issues/1827).

## Context

With REAPER running and its bridge live, the Production page said "REAPER is not running", and nothing on disk could say why. The run log (ADR 0251) records tool runs only. Reading the code showed what was missing:

- The host decides "the DAW is reachable" from a heartbeat at most 5 s old (`daw/reachability.go`), and drops several failures silently: the bridge client being nil, a `bridge.New` error, a `Dispatch` error, a rejected `PROJECT_STATUS` event.
- About 394 `Host` bindings run with no name, duration or outcome on disk. Live events, navigation, dialogs and frontend errors are not logged. `ErrorBoundary` has no `onError`.
- ADR 0251 clause 6 says content is never logged but allows raw paths, and its promised call-site guard and sentinel test do not exist. Sidecars log free-text f-strings: `extraction_rules.py` logs a raw quote, `asr_batch.py` logs the Story Bible hotwords. "Copy diagnostics" copies sidecar stderr verbatim and leaves out `host.log` and `bridge.jsonl`.

The owner's rulings on 2026-10-17: everything about how the app functions is logged except sensitive data (manuscript, transcripts, script content, names, emails, user paths and usernames, text typed into fields, audio); the log must be exportable for an engineer or an AI agent to diagnose from; there is no hosting, so nothing is uploaded and users share a file by hand; the trace is off by default and on in dev mode; opaque ids and counts are acceptable.

**Considered options:** extend `run.jsonl` (run history would be evicted by chatty records); a deny-list scrubber over free-form messages (a new leak path appears with each new message); per-component logging (cannot be guarded); a third-party crash or analytics service (nothing may leave the machine, ADR 0072); always-on disk logging (the owner chose off by default).

## Decision

1. **A new package, `apps/desktop/internal/trace`,** writes the activity trace to `%APPDATA%\narration-utils\logs\trace.jsonl` through the same slog JSON handler and record envelope as `runlog`: 10 MiB cap and two backups, a buffered writer flushed every second and on exit or panic. Every record carries `ts`, `seq`, `level`, `sess` (an id per launch), `area` and `event`, and `run` and `cid` when known. `run.jsonl` and its run ids are unchanged.
2. **A registry of event definitions decides what a record can hold.** Each field has a kind: `enum`, `int`, `bool`, `duration_ms`, `id`, `path`, `errclass` or `len`. There is no free-string kind. The emit API accepts only those types, `slog.Any`, `fmt` and `%v` are banned in the package by a lint rule, and an unknown event or field is dropped and counted. UI events cross in one batched binding and are validated against the same registry.
3. **Content is never recorded, at any level.** This replaces ADR 0251 clause 6.
   - A `path` becomes `{class, ext, h}`: class is inside the project, beside it, in the user profile, other local, network or removable, and `h` is eight hex characters of an HMAC-SHA256 over the lowercased normalised path with a per-install salt. A raw path, a home directory or a user name never appears.
   - Text, names and emails have no field; a text edit logs a control id, a length bucket and validity, on blur and not per keystroke. A setting change logs the tool and key, and the value only for bool, enum or number keys on an allow-list.
   - An `id` matches `^[a-z0-9_.:-]{1,64}$`. Opaque ids (a chapter id, a GUID) and counts are allowed; titles are not. A control is identified by a static id in code, never by its accessible name.
   - An error logs a class from a fixed enum and a stable code. The message, scrubbed of paths, quoted strings, emails and long digit runs and cut to 160 characters, is written at debug level only.
4. **The trace is off by default** and is on when the build runs from source (the version still reads `0.0.0-dev`, which a published release never does), or when the narrator turns it on in Settings (a Debug panel). `General.debug_logging` and `NARRATION_DEBUG=1` keep their meaning for decision records. An in-memory ring buffer of the last 2,000 events is always on, is never written to disk, and is included in an export when the disk trace is off.
5. **Instrumentation sits at central points, not in components:** a `withTracing(api)` wrapper over `NarrationApi`, `onHostEvent`, the router, `overlayService`, the error boundary and the existing `window` handlers on the UI side; `emitEvent`, the supervisor, `daw.Reachability`, the bridge `Dispatch`, lifecycle and a recover wrapper on the host side. Bindings log name, duration, outcome and error class; arguments are logged only where an allow-list row exists. High-rate events (recording levels, teleprompter words, transport, heartbeats) are aggregated per window and logged on change.
6. **DAW connection state is always an event:** every reachability flip with the last-seen age, the timeout and a reason enum; the client being configured or nil with its reason; dispatch errors and rejected events by tag; project match and its reason; capability availability and its reason code.
7. **Guards:** a Go test enumerates `Host` methods by reflection and gives each the default policy; the UI wrapper has a coverage test, and the silent-catch scan requires a swallowed error to be traced or exempt with a reason; a canary suite runs the app flows with sentinel names, paths, words and typed text and fails if any appears in the trace, `run.jsonl`, stderr files, `host.log`, `bridge.jsonl` or an export.
8. **`host.log` retires** into the trace once the export includes everything it held.
9. **The diagnostics export** (a zip with a manifest of what is and is not included, a preview before saving, a check of the bundle against the open project's names and the user's name, a safe summary an agent can read) is decided in a second ADR when its code lands. Sidecars gain an `event(name, **fields)` log call with an allow-list; plain-message sidecar lines are left out of an export until migrated.

## Consequences

- A failure like the Production banner leaves a timeline: what the UI showed, what the host believed about the DAW and why, with no content in it.
- A new event must be registered, so adding one costs a few lines and a golden entry. A new binding is traced with no code.
- A scrubbed error message is the one place a deny-list remains, so it is debug-only and covered by the canary suite.
- With the trace off, a failure that happened before it was switched on has only the ring buffer and `run.jsonl`; the ring buffer is the price of "off by default".
- The sidecar leaks named in Context are fixed with the `event()` call, not by this ADR alone.
- To record content, upload logs or collect usage metrics, write a new ADR that supersedes this one; any of those changes the threat model's "no telemetry" statement.
