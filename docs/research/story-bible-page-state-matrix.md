# Story Bible page: state matrix

Written before the code, per [the definition of done](../../.claude/rules/definition-of-done.md) rule 3, and filled in as the work landed. Spec: the Studio Next mock's Story Bible page (`docs/research/mockups/studio-next/src/pages/Bible.tsx` and `bible/`), by ADR 0760. Every cell is **tested** (names the test file and case), **walked** (seen in the real app with dev:mock, no automated test), or **not tested** with a reason. The tests are under `apps/ui/src/components/storybible/` unless a path says otherwise.

All of it ran against the mock host. Nothing was checked against a real host, a real manuscript or a real DAW.

## Controls

| Control | Cell | Status |
| --- | --- | --- |
| Entry list | empty | tested: `Guide.states.test.tsx` "no entries says so" |
| | one entry | tested: `Guide.states.test.tsx` "one entry is drawn with its singular counts" |
| | many (3,000 entries) | tested: `Guide.states.test.tsx` "a huge book" |
| | huge, 20,000 relationships | not tested: 1,000 relationships and 500 names are tested (`GuideDetail.states.test.tsx`); jsdom cannot show whether 20,000 stays responsive |
| | loading | not tested: the page draws nothing until the first read answers; no loading state exists to assert |
| | failed first load | tested: `Guide.states.test.tsx` "the first load failing" (sentence and Retry) |
| | failed reload | tested: `Guide.states.test.tsx` "a reload failing keeps the rows" |
| | stale (entry gone on the next read) | tested: `Guide.states.test.tsx` "an entry the host no longer has" |
| | long, RTL, emoji, markup names | tested: `Guide.states.test.tsx` "long, right-to-left, emoji and duplicate names" |
| | duplicate names | tested: same test (two rows named Twin); the detail refuses a taken name on Save |
| | arrow keys, one tab stop | tested: `Guide.keys.test.tsx` (already on main) |
| | row right-click menu | tested: `Guide.contextMenu.test.tsx` (8 cases) |
| Search | no match, regex characters, emoji, 10,000 characters | tested: `Guide.states.test.tsx` "a search of regular-expression characters" |
| Sort | each key | tested: `GuideDetail.actions.test.tsx` (on main) |
| Kind chips | types fail to read | tested: `Guide.states.test.tsx` "the types failing says so" |
| | a type removed while selected, 40 types | not tested: no test removes a type mid-session; 40 chips not drawn |
| Needs review / verification chips | count and filter | tested: `GuideDetail.actions.test.tsx` (on main) |
| Scan | start, refused, failed | tested: `suggested/scan` tests (on main); not re-tested here: late and no-answer cases |
| Import | see the Import table | tested |
| Build / refresh | double-fire | tested: `Guide.states.test.tsx` "pressing Build twice" |
| | leave mid-build | tested: `Guide.states.test.tsx` "leaving the page while an action is still running" |
| | model missing, failed, running on arrival | tested: `GuideDetail.actions.test.tsx` and the visual states `language-model-*`, `rebuild-running` (on main) |
| Voice data | as built | not touched: it has no equivalent in the mock (left as built); covered by `VoiceDataPanel.test.tsx` (on main) |
| New entry | name empty, taken, 9,000 characters, markup | tested: `Guide.states.test.tsx` "a new entry" |
| | create refused by the host | tested: same, sentence and the draft stays |
| | Add pressed twice | tested: same |
| | default name numbering | tested: same (first free number) |
| | leave with an unsaved draft | tested: `GuideDetail.actions.test.tsx` (on main) |
| Entry editor | Save with empty or taken name | tested: `GuideDetail.states.test.tsx` "Save" |
| | Save refused by the host | tested: same, stays in Edit and keeps the typing |
| | Save pressed three times | tested: same, one write |
| | Save slow, another entry opened meanwhile | tested: same, the page is not pulled back |
| | read-only shows no add controls | tested: `GuideDetail.readOnly.test.tsx` and `GuideDetail.names.test.tsx` |
| Names | add with Enter, duplicate, collision merge offer | tested: `GuideDetail.names.test.tsx`, `GuideDetail.merge.test.tsx` (on main) |
| | 500 names | tested: `GuideDetail.states.test.tsx` |
| | removing the last name | tested: `GuideDetail.names.test.tsx` |
| Pronunciation per name | source refuses or does not answer | tested: `source/source.test.tsx` (on main) |
| Relationships | circular, self, to a gone entry | tested: `GuideDetail.states.test.tsx` "the lists at their edges" |
| | 1,000 on one entry | tested: same |
| | Add with nothing chosen | tested: `GuideDetail.readOnly.test.tsx` (says what it waits for) |
| | picker finds nothing | tested: `GuideDetail.states.test.tsx` |
| Delete | confirm, cancel, twice, host refuses, already gone | tested: `GuideDetail.states.test.tsx` "Delete"; from the row menu: `Guide.contextMenu.test.tsx` |
| Mark reviewed | blocked by suggestions, Undo | tested: `GuideDetail.test.tsx` (on main); from the row menu: `Guide.contextMenu.test.tsx` |
| Find in the manuscript | name with query characters | tested: `Guide.contextMenu.test.tsx`; `GuideDetail.find.test.tsx` (on main) |
| Appears in | zero, one, 400 chapters | not tested here: `AppearsIn.test.tsx` (on main) covers names and the jump; 400 not drawn |
| Speaker colour | Character only, fails | tested: `SpeakerColourField.test.tsx` (on main) |
| Series tab | as built | not touched (SN0-Q5) |
| Narrow window | list keeps its height, entry brought into view | walked at 800x700 (dark); `Guide.tsx` scrolls the entry into view; no automated test |

## Import (a file from someone else: trust boundary)

All in `suggested/import/import.states.test.tsx` (52 cases) unless it says otherwise.

| Cell | Status |
| --- | --- |
| picker cancelled, empty file, whitespace only | tested |
| zero rows, one row, 10,000 rows (drawn capped; host refusal sentence) | tested |
| 50 MB file, file at the limit, pasted text over the limit | tested: the page refuses before reading, falls back to the documented 2 MiB when the host limit is not yet known |
| malformed JSON, malformed CSV, binary renamed .csv, NUL byte | tested; the host's own parsing of quoted CSV is the Go importer's (`internal/extraction/importer`, fuzzed) |
| wrong or unknown format hint, missing column | tested |
| formula cells (`=`, `+`, `-`, `@`) | tested: stay text, nothing evaluated or opened |
| control characters, RTL, emoji, 10,000-character names, bidi-override file names | tested |
| host never answers, answers late after close (success and failure), answers out of order | tested |
| commit refused, journal throws, double click, close mid-commit | tested |
| reload or remount mid-import | tested as a remount; a real reload persists nothing, so nothing is lost |
| Undo after import, after later edits, host refuses, twice | tested |
| focus, Escape, Tab trap | tested |
| a real 50 MB file through the OS picker, glyph shaping | not tested: jsdom has no picker or shaping |
| trust boundary row | `docs/architecture/threat-model.md` row 6zb re-read: the page still sends text only, never a path; the new size guard narrows what the page reads. No row change owed |

## Overlays (each topmost at its own points and fully on screen)

Written by hand, because the shared guard on `fix/booth-resiliency` had not merged to `main`: `apps/ui/tests/overlays/` (`pnpm --dir apps/ui overlays:page`). It checks the centre, four corner insets and four edge midpoints with `elementFromPoint`, and that the box is inside the viewport, at 1440x900, 1024x768 and 800x600, in the light theme only. 462 cases: 384 pass, 3 fail, 75 not applicable.

| Overlay | Status |
| --- | --- |
| header tooltips, entry kind menu, pronunciation source menu | pass at every window edge and corner, beside the rail |
| Import dialog, Delete confirm, language-model prompt, rebuild work dialog, preview-voice prompt, Voice data panel, review slide-over | pass, also while another overlay is open |
| row context menu | pass where a menu opens (4 of 9 pointer spots; the rest open nothing) |
| Sort and speaker-colour selects | not tested: native `<select>`; the browser draws the popup outside the page, so `elementFromPoint` cannot see it. The spec fails if either becomes a custom popup |
| toast raised while a dialog or slide-over is open | **FAIL, not fixed here**: see the PR body, "Found, not fixed" |
| dark theme, a real host | not tested |

## Host failures

Every failed host call on the page now shows a sentence the narrator can read. The two reads that were silent (`guideTypes`, `manuscriptChapters`) now say so with Check again; their feedback rows are `inline` and `ok`.
