# Folder tracks: draft mock

**Status:** draft, 2026-10-27, pending the owner's review. Not approved, so nothing builds to it yet. Refs #2251. Request: "prototype how to display folder tracks nested like in REAPER."

The Studio Next mock stays the spec for the Engine page's neighbours and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft changes the Tracks card and the track picker of the Engine panel as built (`src/studio/ui/src/components/engine/EnginePanel.tsx`, `components/mapping/TrackSelect.tsx`).

`index.html` is one static file: no build, no network, system fonts, tokens copied from `studio-next/src/styles/app.css`. It follows the system theme and has System, Light and Dark buttons (`?theme=dark`, `?data=long`, `?data=deep` and `?delta=on` also work). The trees take arrow keys. `node docs/research/mockups/folder-tracks/shots.mjs` redraws `shots/` (set `CHROMIUM` to the installed headless shell).

## Sections

| Section                         | What it shows                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Today                           | The flat Tracks card as built                                                                                         |
| A · Indented tree (recommended) | The table with a tree in the Track column: guides, caret, folder icon, child count, a Chapter roll-up on folders      |
| B · One folder at a time        | A file browser: breadcrumb, back, a folder row opens the folder                                                       |
| C · Grouped flat list           | Sticky group headers with the folder path, no collapsing                                                              |
| Linking a chapter               | The Chapter links picker as the same tree: best match, search with paths, "linked to", folders with no audio disabled |
| Narrow windows                  | All three and the picker at 360 px                                                                                    |
| States                          | All closed, 64 tracks, deep nesting, search with matches, no match, empty folder                                      |

Keyboard and ARIA, as drawn: the card is a `treegrid` (B and C: `grid`), each row has `aria-level`, `aria-posinset`, `aria-setsize` and, on a folder, `aria-expanded`; the picker is a `tree` of `treeitem`s with `aria-selected` and `aria-disabled`. Up and Down move, Right opens a folder or enters it, Left closes or goes to the parent, Home and End jump, `*` opens a level, Enter toggles (card) or picks (picker). One tab stop per tree. Caret buttons are out of the tab order, as in the WAI-ARIA tree pattern. Frontend-primitives: expand/close-all and Up are icon buttons with tooltips; the header is the card's one title; the long list is capped and scrolls inside itself; no instruction prose in the app parts.

## What the app knows today

- `internal/tracks.Track` (`src/studio/desktop/internal/tracks/tracks.go`) and the `TracksList` wire contract (`tests/fixtures/contracts/tracks-project.json`, `ui/src/api/schemas/tracks.ts`) carry `guid, index, name, color, muted, soloed, items`. **No depth, no parent, no folder flag.** The UI list is flat, in file order.
- The list is read from the saved `.rpp` by `parseTrack` (`parse.go`), never from the bridge. No bridge command lists tracks (`chapter_track_state` reads one chapter's track). So nothing has to change in the Lua.
- The `.rpp` has the data: each `<TRACK>` holds `ISBUS <state> <delta>`, where the delta is REAPER's `I_FOLDERDEPTH` (1 opens a folder, 0 stays, -N closes N levels). The checked-in fixtures hold only `ISBUS 0 0`, so the folder case is **not yet seen in a real file**: the first step below records one. Depth is the running sum of the deltas.

## What a real build needs (not implemented here)

A wire contract change, so walk [wire-contract-change](../../../../.claude/skills/wire-contract-change/SKILL.md) in its own slice:

1. Record a real `.rpp` with nested folders (a closed folder, a folder inside a folder, a folder closing two levels at once) in `internal/tracks/testdata/reaper/` and say in [reaper.md](../../../reference/daw/reaper.md) what REAPER wrote (`reaper-api-facts`).
2. `parseTrack`: read `ISBUS`, keep a running depth, add `Depth int` (`json:"depth"`) and `IsFolder bool` (`json:"isFolder"`) to `Track`. Clamp depth at 0 for a malformed file. A parent GUID is derivable in the UI from order and depth and is not needed on the wire.
3. Failing test first: a parser test on the new fixture, then the golden `tests/fixtures/contracts/tracks-project.json` (`UPDATE_CONTRACTS=1`, reviewed).
4. UI: `Track` in `ui/src/api/contracts/tracks.ts`, `trackSchema` in `schemas/tracks.ts` (`depth: z.number().int().nonnegative()`, `isFolder: z.boolean()`), a row in `wireContracts.test.ts`, and the mock's tracks (`mockApi.ts`, `workspaceMock.ts`, `chapterTrackMatchMock.ts`) gain the two fields.
5. `hostAPIVersion`: additive, no bump. Visual state: a nested project in the catalogue (`visual-catalog-sync`).
6. Audacity has no folders: both fields are `0` and `false`, and the tree draws as the flat list ([DAW capabilities](../../../reference/daw/capabilities.md)).
7. Docs: `docs/utilities/tracks.md`, the Engine guide and its screenshots (`doc-screenshot-sync`). No new persisted file (the open and closed state is not saved), so no `data-files.md` row. No new trust boundary: the `.rpp` is already read.

## Decisions for the owner

1. **Layout.** A (recommended), B or C.
2. **Can a folder be a link target?** Recommended: yes when it has audio of its own, disabled with a tooltip when it has none.
3. **Where do the folders start?** Recommended: all open up to 30 tracks, above that closed except the path to each linked track; not saved. Alternatives: always closed, or follow REAPER's own collapse flag.
4. **The wire change** above, approved as its own slice before the build.

## Lifecycle

Delete this folder in the pull request that builds the tree, or when the owner rejects it.
