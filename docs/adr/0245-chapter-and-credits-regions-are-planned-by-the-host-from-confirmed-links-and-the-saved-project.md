# 0245. Chapter and credits regions are planned by the host from confirmed links and the saved project

**Status:** Proposed
**Date:** 2026-09-25

## Context

[ADR 0235](0235-one-create-regions-command-serves-chapter-and-credits-regions-and-replaces-create-chapter-regions.md) gave the two features that need REAPER regions (chapter regions and credits regions) one command, `create_regions`, and a Go client, but nothing in the host decided which rows to send. Chapter regions are wanted with bounds from the `tracks` extents, previewed and approved; the credits are wanted to get regions of their own, listed first and last. The chapter-to-track link control now stores one narrator-confirmed track per chapter, and the saved `.rpp` gives each track's span. Credits had no stored track link when this was written.

## Decision

- **The host plans; the UI only chooses.** `ChapterRegionsPreview(openingTrackGUID, closingTrackGUID)` reads the saved `.rpp` and the confirmed links once and returns the rows and every skip with its reason. `ChapterRegionsCreate(opening, closing, update)` recomputes the same plan and sends it in one `create_regions` request. Bounds and titles never come from the UI.
- **Only confirmed links make chapter regions.** A chapter with exactly one confirmed link to a track that has items gets a region spanning the track's first item start to its last item end. An unconfirmed match, no link, several links, a link to a track the project lacks, and an empty track are each skipped with a reason.
- **Credits rows are named like the chapter table's rows** ("Opening credits", "Closing credits") and come first and last. Their track is passed per call; an empty GUID leaves the row out. When credits links are stored ([ADR 0495](0495-a-credits-rows-check-and-track-link-reuse-recordingcheck-and-mappingconfirm-through-a-synthetic-chapter-and-a-credits-aware-title-lookup.md)), the caller passes those.
- **The preview judges each row against the saved regions** with `create_regions`' own rule (a matching region within 0.01 s first, then one region with the title, then several): `new`, `exists`, `moves` or `ambiguous`. REAPER decides for real, because the live project can differ from its last save.
- The bridge's region commands get one host client, `bridge.Actions`, on the same client as the other consumers; it reads the Experimental REAPER actions switch on every request ([ADR 0230](0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md)).

## Consequences

- A second run adds nothing: every row is `exists` and `create_regions` skips it.
- Regions follow the narrator's confirmed links, so a wrong automatic match never becomes a region without a confirmation.
- `hostAPIVersion` 49 to 50. The dialog that calls these bindings is follow-up UI work; until it lands, no narrator can reach them.
