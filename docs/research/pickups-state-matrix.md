# Pickups page: state matrix

Written before the fixes, per [the definition of done](../../.claude/rules/definition-of-done.md), and updated as cells were tested. Each cell is **T** (tested, naming where), **P** (probed by hand in dev:mock, by the PR's own run or the independent narrator), **NT** (not tested, with the reason) or **n/a** (cannot happen, with the reason).

Test files: `PickupsPage.test.tsx` (page), `PickupsTable.test.tsx` (table), `AddPickup.test.tsx`, `SessionPanel.test.tsx`, `pickupRows.test.ts`, `tests/visual/pickups-edges.spec.ts` (overlays, real app), `tests/visual/app.spec.ts` rows `pickups / *`.

| Area | Empty | One | Many / huge | Loading | Refused | Failed | Stale | Long / RTL / emoji | Rapid double-fire | Reload / leave mid-action |
| - | - | - | - | - | - | - | - | - | - | - |
| Opening the list | T `empty` state | T pickupCounts | T 300 lines; P 43 lines in the app. 1500 lines took 20 s in jsdom: **NT** in a real browser, rows are not virtualised | T "loading: says it is reading" | n/a, a read is not refused | T "failed: says why"; real app `unreadable` state | T "stale: a later read that fails keeps the list" | T RTL, emoji, 500 characters, `<script>` text | T "out of order" answers | P leave and return keeps the list (the mock keeps it); **NT** reload: the mock host is in memory |
| Include box / Space | n/a | T | T | n/a | T refusal toast | T refusal toast (`said`) | NT: the host answers the whole list, no per-line staleness | n/a | T "rapid-double-fire" | P |
| Mark recorded / open again | n/a | T | T | n/a | T refusal toast | T | T "Not in the DAW yet" while the host holds it back | n/a | T | P |
| Remove and Undo | T `empty` state | T | T | n/a | T refusal toast | T | NT: a line gone from the host is refused with the host's words | n/a | T second Remove ignored | P |
| Add by hand | T empty line | T | n/a | T pending button | T host refusal keeps text | T | n/a | T RTL, emoji, 501 chars, whitespace; absurd times `-1`, `5:99`, `1e3`, `∞`, `99999999:00` | T double press adds one; T repeat line is refused in words | NT: the popover is not persisted |
| Chapter stepper / scope | T "No pickups queued" | T | T | n/a | n/a | n/a | T scope on a chapter that left falls back to all (derived in `PickupsPage.tsx`); **NT** as a rendered test | T mixed manuscript headings | n/a | P |
| Alt+Up / Alt+Down | n/a | n/a | T | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Check recordings | n/a | n/a | n/a | n/a | T off with the DAW's sentence | n/a | n/a | n/a | P one run for two quick clicks | P Escape returns focus; dialog Cancel and Check on screen at 1440x900, 1100x560, 760x620 (`pickups-edges.spec.ts`) |
| Open N in Booth / row hand-off | T 0 lines: button off with a reason | T | T 2000 ids survive the address in order | n/a | n/a | n/a | NT: the Booth owns what it does with an id the list no longer has (gap reported, Booth is another owner's) | T | T | P Back and Forward return |
| Add N as markers | T off with reason | T | T | n/a | T refusal toast | T | n/a | n/a | T one run for ten presses | P |
| Copy the pickup script | T says nothing to copy, button state | T | T order by chapter then time | n/a | n/a | T clipboard failure sentence | n/a | T typed text copied exactly | n/a | n/a |
| Row context menu | n/a | T | T | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Rail badge | T | T | T | n/a | n/a | n/a | T follows the page's list | n/a | n/a | n/a |

## The DAW and the Booth hand-off

| Case | Result |
| - | - |
| The DAW never answers | Marker and check buttons are off with the host's sentence (T `SessionPanel`, `PickupsTable`); the list still reads |
| Answers late | A late answer older than a shown one is dropped (T "out of order") |
| Answers out of order | Same |
| Loses an event | The list is read again on focus and every 10 s while unreadable (T "stale"); **NT** a lost live event: the page does not use live events |
| Repeats an event | The rail re-reads; the page re-reads on focus; idempotent (T by construction, no test of a repeated event) |
| Wrong project open | **NT**: the mock cannot open a second project; the host reconciles the list with the DAW's markers on every read (Go tests of `pickuplist`) |
| Wrong version | **NT**: no version is exchanged for the list |
| Restarts mid-session | **NT**: not drivable in the mock; the next read after the restart shows the markers' truth |
| Booth hand-off with a pickup id the Booth no longer finds | **NT**, reported as a gap: the Booth is not touched here |

## Overlays (real app, `pickups-edges.spec.ts`, three window sizes)

Row menu at the row's four corners, first and last row; Add popover; stepper menu; Check recordings dialog (and its footer buttons); a tooltip on the last row icon; a toast; the row menu over an open Add popover; the row menu beside the focused, expanded nav rail. Each is topmost by `elementFromPoint` at its corners and centre and fully on screen; a self-check proves the guard fails when a layer covers it, and the dialog check fails without the sticky footer. The shared overlay guard (#1756) had not merged, so this is done by hand.
