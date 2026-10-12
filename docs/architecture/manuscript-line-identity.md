# Manuscript line identity in the REAPER project

**Status: Lua commands implemented, tested in the harness and verified in a scripted REAPER 7.80 run.** `stamp_item_lines` and `read_line_ids` are driven from the app (`apps/desktop/internal/lineidentity`, the "Link chapters" dialog in the audio engine panel, `apps/ui/src/components/engine/LinkChaptersDialog.tsx`), and `create_regions` from `apps/ui/src/components/engine/CreateChapterRegionsDialog.tsx`. The REAPER run and the two steps still pending with the owner (a real paste of a stamped item, and Transcript Compare through the app) are in [the REAPER verification pass](../operations/reaper-verification-pass.md#line-identity-in-reaper). The shared chapter-to-track matcher is `apps/desktop/internal/chaptermatch` (ADR 0110), used by `apps/desktop/chapterlinks.go`.

## Why

The features that follow from the [REAPER automation research](../research/reaper-automation-surface.md) (anchoring live teleprompter flags to takes, pickup lists, per-chapter render and export) all need a durable link between a manuscript line and the REAPER item that records it. Storing that link in the `.rpp` itself, keyed by item GUID, means it survives moves, splits, and copies, and needs no sidecar to stay in sync.

## What exists

Two commands in [`integrations/reaper/narration_line_identity.lua`](../../integrations/reaper/narration_line_identity.lua) and the region command beside them (registered with the bridge, see [the REAPER bridge](reaper-bridge.md)), sent over the same file protocol as Transcript Compare (`1|<command>|<args>` in `commands/NNNNNNNN.cmd`). Payloads travel as files because the command line carries at most eight fields.

| Command | Fields after the command name | Payload file | Events |
| --- | --- | --- | --- |
| `stamp_item_lines` | `run_id`, `payload_path`, `overwrite` (`1` to replace a different existing ID) | `item_guid\|line_id\|line_text` per line | `LINES_STAMPED\|run\|stamped\|unchanged\|stale\|conflicts`, plus `LINES_STALE` and `LINES_CONFLICT` per GUID (first 50) |
| `read_line_ids` | `run_id`, `output_path` | Written by REAPER: `item_guid\|line_id\|position\|length\|line_text` per stamped item | `LINES_READ\|run\|path\|count` |
| `create_regions` (in [`narration_regions.lua`](../../integrations/reaper/narration_regions.lua); it replaced `create_chapter_regions`, see [the REAPER bridge](reaper-bridge.md#regions-for-chapters-and-credits-narration_regionslua)) | `run_id`, `payload_path`, optional `RRGGBB` colour, `update` (`1` moves the one region with a row's title) | `start\|end\|title` per line, seconds | `REGIONS_CREATED\|run\|added\|existing\|invalid\|updated\|ambiguous\|failed` |

Behaviour that is deliberate:

- Identity is stored as two namespaced item extension keys, `P_EXT:narration_utils_line_id` and `P_EXT:narration_utils_line_text`. Item notes and take names are never touched; they belong to the narrator.
- Items are found by GUID only. A GUID that no longer resolves is reported as stale and no neighbouring item is used instead.
- An item that already carries a different line ID is a conflict and is left alone unless the narrator explicitly overwrites.
- Each write command is one undo step, and nothing is written (and no undo point created) when there is nothing to change. Re-running with the same payload is a no-op.
- `read_line_ids` reads through the REAPER API, so the host does not depend on how the `.rpp` file happens to serialise extension data. That format is known (spike S0: an `<EXTI` block per item, see [the result](../research/reaper-spike-s0-item-extension-data.md)) and a static read is possible later.

## Later phases

1. **Go client.** Done for `stamp_item_lines` and `read_line_ids` (`apps/desktop/internal/lineidentity`, tests mirroring `transcript/service_test.go`) and its UI trigger, the audio engine panel's "Link chapters" dialog. Line IDs are chapter-level: the manuscript entity ID (a chapter ID, or a paragraph ID once that granularity is built) plus the manuscript's source SHA-256, not the item-to-manuscript-span alignment. `REGIONS_CREATED` is answered to `bridge.Actions.CreateRegions`.
2. **Chapter regions from the manuscript.** The Lua command is `create_regions` (experimental until the [verification pass](../operations/reaper-verification-pass.md); `bridge.Actions.CreateRegions` is its Go client); the host plans its rows (`apps/desktop/chapterregions.go`, [ADR 0245](../adr/0245-chapter-and-credits-regions-are-planned-by-the-host-from-confirmed-links-and-the-saved-project.md)): one region per chapter with one confirmed track link, spanning that track's items in the saved `.rpp`, plus the opening and closing credits. The bindings are `ChapterRegionsPreview` and `ChapterRegionsCreate`.
3. **Static read (optional).** Spike S0 checked how item `P_EXT` appears in a REAPER-saved `.rpp` ([the result](../research/reaper-spike-s0-item-extension-data.md)): an `<EXTI` block of `key value` lines per item, stable across save, reload, split and duplicate, so `tracks` could read line IDs without a running REAPER (a chunk reader that handles the four value forms, and `IGUID` for the item GUID). The fixtures are under `apps/desktop/internal/tracks/testdata/reaper/`. Until then use `read_line_ids`.
4. **Lua test harness.** Done ([ADR 0066](../adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)): the commands above have harness tests, and new ones come with theirs.
5. **Retakes on fixed lanes.** Done for choosing a lane ([ADR 0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md)). On a lane track every retake of a line carries the same line id, so a line id no longer names one item there: `pick_retake_lane` and `apps/desktop/internal/retakelanes` name a retake by line id plus item GUID, and "the retake that plays" is the item whose lane plays. Anything else that goes from a line id to one item has to make the same choice before it runs on a lane track.
6. **Consumers.** Timeline-anchored live flags and the punch-and-roll navigator (research items 1 and 2) can build on the live ASR sidecar and its Go event relay.
