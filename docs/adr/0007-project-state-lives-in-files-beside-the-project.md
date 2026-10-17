# 0007. Project state lives in files beside the project

**Status:** Accepted
**Significance:** A persistence strategy. There is no database; every feature stores its state as files, so changing the strategy means migrating every stored shape and every reader.
**Date:** 2026-09-19

## Context

The narrator's project is a folder with a DAW project in it. The app must work offline, survive being closed mid-edit, let a project move between machines and not trap data inside the app.

**Considered options:** a database in the app's data folder (project data separated from the project folder, not portable); storing state inside the DAW project (only one engine can; REAPER Lua owns only what REAPER knows).

## Decision

- Per-project state is JSON (and similar) **sidecar files under `<project>/narration-utils/`**; per-user state (recents, settings, credit templates, series) is files in `%APPDATA%/narration-utils/`. Every file is catalogued in `docs/reference/data-files.md` with its location, schema and retention.
- Settings resolve through three layers: the project override, the per-user global file, then `config/defaults.json`.
- Files are written to a temporary name and renamed. Decisions are append-only; derived data can be reset. A corrupt file is handled by class: disposable state heals and logs, narrator-authored data is kept aside as `<name>.corrupt-<timestamp>` and the narrator is told.
- Identity is by id or GUID, never position. Line identity in REAPER lives in namespaced item extension data (`P_EXT`), never in notes or names.
- Opening a project never writes into another project; cross-project reads are read-only.

## Consequences

- A project folder is self-contained and inspectable, and backup is a folder copy.
- No transactions across files: each writer owns its file and readers tolerate a missing or newer one.
- Moving to a database means a new ADR and a migration for every stored shape.
