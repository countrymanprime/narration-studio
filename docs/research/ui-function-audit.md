# UI function audit (2026-10-29)

Status: **in progress** (inventory being built from the code, not from the guides).

**Question.** Which buttons and functions does every page have, and where does the same capability exist in more than one place without the copies agreeing?

**Trigger.** The Engine page's "Link chapters…" dialog says no chapter is linked while the Chapter links table on the same page says they are.

## Worked example: "linked" on the Engine page

- `ChapterLinksTable` (`components/engine/ChapterLinksTable.tsx`) shows chapter → track links read from `api.chapterTrackMapList()` (the confirmed manifest mapping), via `chapterTrackRows`.
- `LinkChaptersDialog` (`components/engine/LinkChaptersDialog.tsx`) keeps its own `mapping` state, which starts as `{}` and is never seeded from that mapping, so every row reads "Not linked". It stamps REAPER items (`api.lineIdentityStamp`), a different thing from the manifest link, under the same word.
- Two meanings of "linked" (manifest mapping vs item identity stamp), two stores, one label. A sibling worker fixes the dialog; this audit only uses it as the pattern to search for.

## Inventory

Per-area inventories are in [ui-function-audit/](ui-function-audit/): script and Story Bible, Booth, Editing and Proof, Production and delivery, Engine and Settings, shell.

## Ranked duplicates

_To be filled from the inventories._
