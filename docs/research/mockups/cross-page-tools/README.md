# Cross-page tools: draft mock

**Status:** draft, not signed off by the owner. Refs #2251. It serves the placement issues filed from the [cross-page function audit](../../2026-11-cross-page-function-audit.md) (PR #2834): #2820, #2821, #2822, #2823, #2824, #2825, #2826, #2827, #2829, #2830, #2831, #2833. #2819 (a registry), #2828 (an existing dialog) and #2832 (jump-menu entries) draw nothing new and have no mock.

The Studio Next mock stays the spec and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft adds controls it lacks, to the pages as built. A dashed copper outline marks what is new on a page.

`index.html` is one static file: no build, no network, system fonts, tokens copied from `studio-next/src/styles/app.css` as the booth-voices mock does. It follows the system theme and has System, Light and Dark buttons (`?theme=dark` also works); the app frame narrows on its own width, so 390 px shows the narrow form. `node docs/research/mockups/cross-page-tools/shots.mjs` redraws `shots/` (one PNG per issue at 1440 and 390 px, light and dark, each under 250 KB) and `manifest.json` (per issue: title, what changes, image files and what to look at). Set `CHROMIUM` to the installed headless shell.

## Sections

| Section | Issues | What it shows |
| --- | --- | --- |
| DAW tools menu | #2820, #2821, #2829, #2831 | Structure menu on Editing, Proof and Master's empty state; repair entries in Clean up and the Proof inspector; Embed chapter tags on Delivery; lane rows in the Editing takes list; every off state with the DAW's reason |
| Proof: Compare | #2822 | Compare, differences, Preview and Native takes under the check card; run states |
| DAW connection | #2823 | One chip on Proof, Pickups and Master; the dialog's Link project file; its states |
| Delivery | #2824, #2825 | Both package builds on Output; Check files in the preflight; states |
| Show in DAW | #2826 | The one button on Pickups rows; shared states |
| Match levels | #2827 | Clean up tab button and its preview |
| Add marker | #2830 | Flag card, Proof context menu, Pickups, shared states |
| Check recordings | #2833 | One button on Proof; the Booth offer after Stop |

## Primitives for a real build

| Element | Primitive |
| --- | --- |
| DAW tools, Repair in REAPER, Show in DAW, Add marker | `IconButton` with `TooltipTarget` (rule 1); the menus are `Menu` rendered by `DawToolsMenu` from the registry |
| Off entries | `CapabilityGate`: the entry stays, with the DAW's reason |
| Dialogs | The existing `Dialog` based ones, unchanged |
| Compare panel | The existing `CompareRun`, `PreviewPanel`, `NativeTakesPanel` in a `Panel` with a `ToggleGroup` |
| Lane rows | `Table` or list rows in the takes panel, `StatusBadge` for "Plays", `HelpButton` for the lane sentence (rule 8) |

## Questions for the owner

- #2829: the tags dialog needs the last chapter render. With no DAW, is that always "not configured" (as drawn), or should it accept a file list?
- #2833: keep the Booth offer after Stop, or drop it?
- #2821: the build waits on the five in-REAPER checks; the mock shows the intended entries only.
- The reason strings are drawn from the capability reasons the app already has where they exist; the exact words are for the build.

## Lifecycle

Delete this folder in the pull request that builds the last of it, or when the owner rejects it.
