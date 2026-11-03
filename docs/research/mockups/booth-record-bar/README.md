# Booth record bar: draft mock

**Status:** draft, pending the owner's review. Refs [#2841](https://github.com/countrymanprime/narration-studio/issues/2841). The Studio Next mock stays the spec for the Booth and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)); this draft changes the record bar as built (`components/booth/frame/BoothFooter.tsx`, `record/RecordControl.tsx`, `frame/LevelsMenu.tsx`, `voices/VoiceControl.tsx`).

`index.html` is one static file: no build, no network, system fonts, the Studio Next tokens as the booth-voices mock copies them. It follows the system theme and has System, Light and Dark buttons (`?theme=dark` also works). `node docs/research/mockups/booth-record-bar/shots.mjs` redraws `shots/` (set `CHROMIUM` to the installed headless shell). `manifest.json` lists the images for the review page.

## What the owner asked for

1. One button where Record and Cold read are two today.
2. The voice control to the left of Record, showing the number only (`2`, no keycap), with the character name and the REAPER arm dot.
3. The audio settings icon (Levels) folded into a dropdown on the side of Record: a split button.

## The two options

| | A: a switch on the button | B: a mode in the side menu |
| - | - | - |
| Shape | `[● Record │ Cold read │ ▾]`: Record, a Cold read switch (icon only below 860 px), the side button | `[● Record │ ▾]` |
| Cold read | Press the switch: it takes the recording colour as an outline; **Record still records** | Pick **Cold read** under *Main button* in the side menu: the button reads **Cold read**, pressing it starts the cold read and then reads **Stop**; pick **Record** to switch back |
| Space | Always records or stops | Records, or starts a cold read while the mode is Cold read |
| Tab stops | 3 | 2 |
| Discoverable | Yes: the switch is on the bar | Less: one menu step, then the label says it |
| Narrow (390 px) | Voice on its own row, then the split button and the timer | Same, 34 px narrower |

States drawn for both: idle, recording, cold read armed, listening, no microphone, Record unavailable; at 1440, 1024, 768 and 390 px, light and dark. The side menu is drawn open for both.

## Recommendation: A

A keeps today's behaviour exactly: Cold read is the switch it is now, Record is always Record, and Space never changes meaning. B adds a mode that persists: a narrator who left it on cold read would press Space expecting a take and get none, a lost take with no error. The cost of A is a three-part button; B's cost is a hidden mode. A is also the smaller build (the switch is today's Cold read toggle inside the split button; its `aria-pressed`, `aria-disabled` reason and the `booth.cold-read` command are unchanged). If the owner picks B, the build adds the mode to the side menu and drops the switch.

## Behaviour both options share

- The side button opens the Levels popover as today (microphone, input and monitor levels, pre-roll, the listening choices); it stays usable during a take and while Record is unavailable.
- Record unavailable: the main part keeps `aria-disabled` and its reason; the side button still works, so the narrator can fix the microphone.
- No microphone: a warning dot on the side button and the existing warning sentence; the Cold read switch is unavailable.
- During a take the Cold read switch (A) or mode (B) is unavailable, as Cold read is today.
- Keyboard: nothing changes (the **Keyboard** table in the page lists every key).

## Primitives for a real build

| Element | Primitive |
| - | - |
| Split button | A new shared `SplitButton` (a `Button` and an `IconButton`-style trigger joined, the side opening a `Popover`) with a story and atlas entry; no existing primitive does this |
| Voice control | The existing `Popover` + `SearchList`, with `Kbd` removed from its face |
| Cold read switch (A) | A pressed `Button` segment inside the split |
| Mode (B) | `RadioGroup` at the top of the popover |

## Lifecycle

Delete this folder in the pull request that builds the last of it, or when the owner rejects it.
