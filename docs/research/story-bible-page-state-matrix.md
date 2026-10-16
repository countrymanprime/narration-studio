# Story Bible page: state matrix

Written before the code, per [the definition of done](../../.claude/rules/definition-of-done.md) rule 3. Spec: the Studio Next mock's Story Bible page (`docs/research/mockups/studio-next/src/pages/Bible.tsx` and `bible/`), by ADR 0760. Every cell is **tested** (names the test), **walked** (seen in the real app with dev:mock, no automated test), or **not tested** with a reason. This file is updated as the cells fill in; a cell that still says `open` when the PR is called ready is a bug in the PR.

Legend: `open` = not yet done. Nothing is marked tested until a named test passes.

## Controls

| Control | Host call | Cell | Status |
| --- | --- | --- | --- |
| Entry list | `guideEntities` | empty (no entries) | open |
| | | one entry | open |
| | | many (200) | open |
| | | huge (5,000 entries, 20,000 relationships): list stays responsive, no per-row work in render | open |
| | | loading (first load) | open |
| | | failed first load: inline sentence and Retry | open |
| | | failed reload: toast sentence, rows stay | open |
| | | stale (an entry deleted elsewhere while open) | open |
| | | long, RTL and emoji names; names with only whitespace | open |
| | | duplicate names, names that differ in case or Unicode form | open |
| | | arrow keys, Home, End, one tab stop | open |
| Search | none (local) | empty, no match, matches an alias, emoji, RTL, regex characters, 10,000 characters | open |
| Sort | ui state | each key; unknown stored key falls back to name | open |
| Kind chips | `guideTypes` | no types, a type removed in Settings while selected, 40 types wrapping | open |
| Needs review / verification chips | `extractionSuggestions` | zero, one, many; chip kept while count is zero and the filter is on | open |
| Scan | `extractionScan*` | no answer, late, refused, failed, double-fire, leave mid-scan | open |
| Import entries | `extractionImport*` | see Import below | open |
| Build / refresh | `guideBuild` | model missing, build running on arrival, double-fire, failed, leave mid-build | open |
| Voice data | `guideVoice*` | not in the mock's page: left as built, listed in the PR | open |
| New entry | local draft, `guideCreate` | name taken, empty, 10,000 characters, double-fire, leave with an unsaved draft | open |
| Entry editor | `guideUpdate*` | read-only, Edit, Save, Cancel, Save fails, Save while a rescan runs, double-fire | open |
| Names | `guideAlias*` | add with Enter, duplicate, collides with another entry (merge offer), remove last name refused, 500 names | open |
| Pronunciation per name | `guidePronunciation*` | no source answers, source answers late, source refuses | open |
| Relationships | `guideRelationship*` | circular (A to A, A to B to A), duplicate, to a deleted entry, incoming marked, 20,000 on one entry | open |
| Delete | `guideDelete` | confirm, cancel, fails, entry already gone, relationships removed | open |
| Mark reviewed | `guideMarkReviewed` | blocked by pending suggestions, Undo, double-fire | open |
| Find in the manuscript | navigation | name with query characters | open |
| Appears in | local | zero, one, 400 chapters, chapter missing | open |
| Speaker colour | `guideSetColour` | Character only, back to Automatic, fails | open |
| Series tab | as built | left as built (SN0-Q5) | open |

## Import (a file from someone else: trust boundary)

| Cell | Status |
| --- | --- |
| no file chosen, cancel the picker | open |
| empty file; whitespace only | open |
| 0 rows, 1 row, 10,000 rows, 50 MB | open |
| malformed CSV (unterminated quote), malformed JSON, a binary file renamed .csv | open |
| wrong version / unknown format hint; unknown columns; missing required column | open |
| formula-leading cells (`=`, `+`, `-`, `@`) | open |
| entry names with control characters, RTL, emoji, 10,000 characters | open |
| a file from someone else naming ids that exist locally | open |
| host never answers; answers late after the dialog closed; fails partway | open |
| double-click Add; reload mid-import; leave mid-import | open |
| Undo after import, Undo after later edits, Undo after the entries were deleted | open |

## Overlays (each topmost at its own points and fully on screen)

Menus, popovers, tooltips and dialogs of this page: entry-row context menu, Sort select, Kind select, relationship entry picker, speaker colour select, pronunciation source menu, name-collision merge offer, delete confirm, Import dialog, language-model prompt, work dialogs, Voice data panel, toasts.

| Position | Status |
| --- | --- |
| each window corner and edge, at 1440x900 and narrow | open |
| beside the sidebar and the nav | open |
| over scrolled content | open |
| while another overlay is open | open |

The shared overlay guard on `fix/booth-resiliency` had not merged to `main` when this work started, so the overlay assertions for this page are written by hand in this PR.

## Host failures

Every failed host call on the page shows a sentence the narrator can read. The table of calls and their sentence is in the PR body.
