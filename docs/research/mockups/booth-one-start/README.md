# Booth one start rule: mock

**Status:** draft, pending the owner's approval. Added 2026-11-21 for [#3858](https://github.com/countrymanprime/narration-studio/issues/3858), PR 2 of the plan on that issue, following the owner's answer there and the 2026-11-16 answer on [#3319](https://github.com/countrymanprime/narration-studio/issues/3319) (the start marker is the cursor word itself, with no chip and no extra footer or top-bar item).

One static file, `index.html`: no build, no network, system fonts. It takes the research mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark). The sample text is invented.

## Frames

| Frame | What it shows |
| --- | --- |
| 1 Partly recorded | The cursor on the word after the last one recorded, no Resume chip; Record continues from there |
| 2 Nothing recorded | The cursor on the first word |
| 3 A word chosen | The cursor on the clicked word; it is the start |
| 4 A pickup line | The cursor on the line to redo, the pickup bar unchanged |
| 5 A take running | The cursor follows the voice; no start shown |
| 6 Right-click menu | Without Mark the start here and, before a take, without Punch and roll |
| 7 Footer hints | Without "Mark start" |

The last block lists what goes: the Resume chip, the "Next roll starts from" line, the menu item and its hint, and R before a take.

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the research mock's rule says (What a page builds to).
