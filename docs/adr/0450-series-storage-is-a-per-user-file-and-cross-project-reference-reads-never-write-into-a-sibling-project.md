# 0450. Series storage is a per-user file, and cross-project reference reads never write into a sibling project

**Status:** Accepted
**Date:** 2026-09-28

## Context

The character voice work needs a series - a narrator-named group of projects (books) - to exist somewhere, and needs one project's session to be able to read another member project's approved character references, so the Series tab can list a character's reference clips across every book they appear in.

Two things narrow this change from the original intent. First, `references.json` (ADR 0263) is project-scoped and a series' books are not necessarily under one parent folder, so nothing about a project's own folder can name its series. Second, the owner's ruling on #509 benches the acoustic engine after the real-corpus trial failed its own reject gate: `internal/continuity`'s baselines are never wired up, so a cross-project read of the calibrated baseline has no baseline to read yet. Only the reference data already shipped - region GUID, snapshot, character id, approved timestamp, note - is available to share.

## Decision

- **Series storage** is a new per-user file, `%APPDATA%/narration-utils/series.json`, resolved the same %APPDATA%-with-%USERPROFILE%-fallback way as `recent-projects.json` and `credit-templates.json`. A new package, `apps/desktop/internal/series`, holds it: `Series{ID, Name, MemberProjectPaths}`, a `Store` with `List`/`Save`/`Delete`/`ForProject`, written with the same write-to-temp-then-rename pattern and the same corrupt-file handling (`persist.NarratorData`: kept aside, the narrator told) as `internal/credits`. A project's own `references.json` is untouched by any of this - a series only names project paths, never copies or moves project data.
- **Cross-project reads are read-only by construction, not just by convention.** `character.ReadOnly(project)` is a new, plain function: it reads `references.json` with `os.ReadFile` and `json.Unmarshal` directly, never through `persist.Reporter.ReadJSON`. A sibling project's corrupt `references.json` is reported as an error and left exactly as it is - no quarantine rename, no temp file, nothing written - because quarantining is an action on data another project's own session owns, not this one's to take. `series.Siblings(entry, currentProject)` calls `character.ReadOnly` for every other member path and reports a project that could not be read (missing is not an error; corrupt is) as `Unreadable` per project, never failing the whole call - so a series member that has approved nothing yet, or whose folder briefly does not exist, never blocks reading the rest.
- **Only the reference data is shared:** `SiblingReference.References` is `[]character.Reference` - no acoustic feature, no calibrated baseline, no audio. Calibrated scalar features only, never audio, is the rule for whenever the acoustic engine is unbenched; there is simply nothing calibrated to share today.
- **Opening a project never touches `series.json`.** Nothing hooks into the project-open path; `Store.List`/`ForProject` only run when a caller (a binding) asks. A narrator who never uses series never causes a `series.json` read.

## Consequences

- A series with one member (the common case before a second book exists) is not a special case in the data model: `Siblings` on a single-member series simply returns an empty slice.
- `character.ReadOnly` duplicates a few lines of `Service.readLocked`'s decode logic rather than sharing it, on purpose: sharing would mean threading a "never quarantine" flag through the one code path both the narrator's own project and a read-only cross-project read use, which risks the flag being wrong in the wrong direction one day. Two short, independent functions are easier to audit for "does this ever write" than one function with a mode switch.
- The Series tab's binding is the first real consumer; this change adds none; a new binding will need its own wire contract and a `hostAPIVersion` bump when it lands.
- If the acoustic engine is ever unbenched, sharing a calibrated baseline across a series needs a new decision (what "calibrated" means to cache, and its own versioning) - this ADR only settles the storage location and the read-only boundary, not that future shape.
