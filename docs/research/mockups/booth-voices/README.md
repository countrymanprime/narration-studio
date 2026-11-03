# Booth voices: draft mock

**Status:** approved by the owner on 2026-11-03 ([#2251 comment](https://github.com/countrymanprime/narration-studio/issues/2251#issuecomment-6594214485)). The build follows the PRD's phases. Refs #2251. The plan it serves is the [Booth Voice Tracks PRD](../../../prds/booth-voice-tracks.prd.md); the REAPER evidence and the owner's answers are in [the design note](../../2026-10-30-booth-sub-track-recording.md).

The Studio Next mock stays the spec for the Booth and the Engine panel and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft adds controls the Studio Next mock lacks, to the Booth as built (`components/booth/frame/BoothFooter.tsx`, `components/booth/side/VoicesNearby.tsx`) and to the Engine panel as built (`components/engine/EnginePanel.tsx`, `components/mapping/TrackSelect.tsx`).

`index.html` is one static file: no build, no network, system fonts, tokens copied from `studio-next/src/styles/app.css` as the folder-tracks mock did. It follows the system theme and has System, Light and Dark buttons (`?theme=dark` also works). `node docs/research/mockups/booth-voices/shots.mjs` redraws `shots/` (set `CHROMIUM` to the installed headless shell; `ALL=1` draws every section at 1440, 1024 and 390 px). Fake data: chapter 8 of the sample book, a folder "Ch 8" with Narrator, Alice, Queen, Cheshire Cat and Gardeners.

## Sections

| Section | What it shows |
| --- | --- |
| Booth: the voice control | The armed voice on the record bar (key, SpeakerTag, REAPER's arm state), the new key hints, the rail's voice keys and add buttons; recording after a live switch; a flat chapter; two children armed in REAPER |
| Voice list | `NumpadDecimal` or a click: the folder's children in REAPER order with their keys and characters, then the chapter's characters with no track; a search with no match |
| Who is in it? | The dialog on an empty number key, and the dialog for a character with no track (make a track, assign one, or the Narrator) |
| No track for a character | The notice while recording, its two actions after the stop, the toast for an empty key during a take |
| Extras tracks | One child holding several characters |
| Engine: linking | The project's layout (Flat or Voice folders), a folder as a chapter's link target, the Voices card with key, track, characters and how each matched, and the character picker for a child |
| Narrow windows | The Booth bar, the list and the Voices card at 360 px |

## Primitives for a real build

| Element | Primitive |
| --- | --- |
| Voice control | `Button` holding `KeyHint` and `SpeakerTag`, opening a `Popover`; fixed width, so the notice is a fixed slot (rule 7) |
| Voice list, character picker | `Popover` with `SearchField` and `Listbox`, capped (rule 6); the Booth's `SpeakerChip` popover is the nearest existing one and should be extended, not copied |
| Add track, use existing track, change characters | `IconButton` with `TooltipTarget` (rule 1) |
| Who is in it?, who records | `Dialog` with `Checkbox` rows, `TextField`, `RadioGroup` and `Select` |
| Empty key while recording | `Toast` |
| Layout | `ToggleGroup` with a `HelpButton` (rule 8) |
| Voices card | `Panel` with `Table` (headers centred, rule 5) |
| Key strip | `KeyHints` |
| Arm and record marks | `StatusBadge` or a new dot in `KindMark`; to settle in the build |

## Decisions

Answered on 2026-11-03, each as drawn or recommended here; they are decisions A to G in [section 8 of the design note](../../2026-10-30-booth-sub-track-recording.md#8-owner-decisions).

## Lifecycle

Delete this folder in the pull request that builds the last of it, or when the owner rejects it.
