# Schedule page: state matrix

Written before the code, per [the definition of done](../../.claude/rules/definition-of-done.md) rule 3, for the Schedule page wired to the host through the `production`, `deliveryProfiles` and `measurements` ports (D67, mock-first). The mock's Schedule (`docs/research/mockups/studio-next/src/pages/Schedule.tsx`) is the spec for what the page shows; this file says what each control does in the states the mock never draws.

A cell is `T:<test>` (a test drives it), `V:<reason>` (a reader can see why no test is needed), or `NT:<reason>` (not tested, with the reason). The "Status" column is filled in as the tests land; a cell still `plan` is unverified.

## What the page reads and writes

| Port call | Read or write | Used for |
| --- | --- | --- |
| `production.productionPlan` | read | due date, payment, contracted amount, milestones |
| `production.productionOverview` | read | chapters (words, stage, recorded seconds) the estimates are worked out from |
| `deliveryProfiles.deliveryProfiles` | read | which measures the milestone dialog offers |
| `measurements.takeLog` | read | the chart's recorded line |
| `production.saveProductionMilestones` | write | add, edit, done toggle, remove, undo |
| `production.setProductionDeadline` | write | due date, contracted amount, undo of both |
| `production.setProductionPayment` | write | how the book pays |

The host never pushes an event for these; the page re-reads on its own (focus, timer, midnight, Check again).

## Page read (load and re-read)

| State | Expected | Status |
| --- | --- | --- |
| loading | "Loading the schedule…" status | T:SchedulePage.test.tsx existing |
| empty (no chapters / no manuscript) | the manuscript prompt, no table, no estimates | T:existing "asks for a manuscript first" |
| one chapter / many / huge (5,000 chapters) | the estimates add up; the page renders without a freeze | T:SchedulePage.scale.test.tsx |
| refused / failed first read | alert with the reason and Try again | T:existing |
| failed re-read after a good read | the last reading stays, a notice says it could not refresh, why, and how long ago it was read; Check again | T:SchedulePage.reread.test.tsx |
| stale (nothing re-read for a long time) | same notice reads "last read N min ago" | T:reread |
| re-read succeeds after a failure | the notice goes away | T:reread |
| re-read while a save is in flight | the save's answer wins; a re-read that started earlier does not overwrite it | T:reread "an older read never overwrites a newer save" |
| re-read while the milestone dialog is open | the dialog keeps what was typed; saving a list that changed underneath is refused with a sentence, nothing is overwritten | T:reread "a dialog opened on an older list is refused" |
| focus returns / 60 s timer | one re-read, not one per focus event (throttled) | T:reread |
| clock moves past midnight while open | "today" and every day count move on the next tick | T:reread "moves to the next day" |
| app closed and reopened across the deadline | a fresh mount reads the real date: overdue instead of days left | T:reread "reopened after the deadline" |
| plan with a hand-edited bad date (host wrote `2026-13-45`) | the row shows the raw text, never "Invalid Date" or NaN; page does not crash | T:SchedulePage.dates.test.tsx |
| reload mid-action / leave mid-action | writes are one host call each; nothing is held in the page that is lost by leaving (the dialog draft is lost on leave: NT, the mock's too) | NT:a draft in an open dialog is not kept across a reload, same as the mock |
| wrong project open / restart mid-session | the page reads the project the host has open at each re-read; a project switch remounts the page | NT:project switching is the shell's, covered by App tests |

## Due date and the verdict (Final delivery row, header, pill)

| State | Expected | Status |
| --- | --- | --- |
| none set | "No due date set"; pill "No due date set"; field empty | T:existing |
| clear it (empty field, Enter) | the host clears it; header and pill read "No due date set"; Undo restores | T:dates |
| in the future | "Due Oct 24 · 8 days left" | T:existing |
| one day left | "1 day left", not "1 days left" | T:dates |
| due today | "Due today", the pill never says "needs Infinity" | T:dates |
| in the past (1 day, many days) | "2 days overdue"; the pill says Behind with how late and when it would finish, never "needs Infinity h/day" | T:dates |
| far future (9999-12-31) / far past (0150-01-01) | a number with thousands separators, no overflow in the header or the chart | T:dates |
| impossible date (`2026-02-30`) | refused with "not a real date", nothing sent to the host | T:dates |
| wrong shape (`10/14/2026`, `tomorrow`, emoji, RTL text) | refused with "write it YYYY-MM-DD", nothing sent | T:dates |
| negative / zero year (`-001-01-01`, `0000-01-01`) | refused, nothing sent | T:dates |
| leap day (`2028-02-29`) and a day over a DST change | counts whole calendar days (22/23/25-hour days do not shift it) | T:dates, T:existing progress |
| host refuses | the host's sentence in a toast; the field goes back to the stored date | T:dates |
| rapid double-fire (Enter then blur) | one host write | T:dates |
| a re-read changes the date while the field is being edited | the typed text is kept until commit | T:reread |

## Contract (Paid, Amount, Value)

| State | Expected | Status |
| --- | --- | --- |
| each payment type | amount field only under per finished hour; value only with a rate | T:existing |
| empty amount | clears it | T:existing |
| 0 / one / huge (`1e21`, `99999999999`) | stored as typed; the value reads with separators; no "Infinity" or exponent text | T:SchedulePage.contract.test.tsx |
| negative, NaN, text, `Infinity`, `0x10`, `1,5` | refused with a sentence (not silently ignored); field goes back to the stored amount; nothing sent | T:contract |
| RTL digits (`٢٤٠٠`) / emoji | refused with the same sentence | T:contract |
| host refuses (payment or amount) | host's sentence in a toast, the control shows the stored value again | T:contract |
| rapid double-fire (change type twice fast) | each is its own journal entry, in order; the last one shown is the last one the host answered | T:contract |
| failed write then re-read | the control shows what the host holds | T:contract |

## Milestones

| State | Expected | Status |
| --- | --- | --- |
| none | only the Final delivery row | T:existing |
| one / many | sorted by date, ties by stored order | T:existing |
| 100 (the host's limit) then Add | the host's refusal ("at most 100 milestones") shown in the dialog; list unchanged | T:SchedulePage.scale.test.tsx |
| 2,000 read from a hand-edited manifest | the table renders in time and stays usable | T:scale |
| long name (200 chars, no spaces) | wraps or clips inside its cell; the table does not scroll sideways | T:SchedulePage.text.test.tsx, visual row `long-text` |
| RTL and emoji name / note | shown as written, `dir="auto"` so an RTL name reads right to left | T:text |
| name with only spaces | refused in the dialog | T:existing |
| done toggle double-fire | two writes in order, final state is the second | T:SchedulePage.races.test.tsx |
| remove then Undo | the entry is back in place | T:existing |
| remove of a row another re-read already changed | refused with a sentence, nothing removed | T:races |
| edit saved against a list that changed since the dialog opened | refused with a sentence | T:reread |
| host refuses a save (bad measure, too long) | host's sentence, in the dialog and a toast | T:existing |
| host never answers | the Save button stays busy; Cancel and Escape still close the dialog and leave the table as it was | T:races |
| host answers late, out of order | an older answer never replaces a newer one | T:races |
| undo after a re-read changed the list | undo applies the journal's own check and says so if it cannot | NT:the journal refuses an out-of-order undo; covered by `studio/journal` tests |

## Overlays on this page

The milestone dialog, the status and note tooltips, the Paid select's list and the toasts are each opened and checked with `elementFromPoint` (see `apps/ui/tests/visual/helpers/overlayGuard.ts`, or the guard from PR #1756 once it is on `main`):

| Overlay | Positions | Status |
| --- | --- | --- |
| Add / Edit milestone dialog | each window edge and corner, narrow width, over a scrolled page, while a toast is up, with the Paid select list open | T:scheduleOverlays.spec.ts |
| Status cell and note tooltips | the first and the last row, the viewport's right edge, over scrolled content | T:scheduleOverlays.spec.ts |
| Paid select list | right edge, bottom edge, narrow | T:scheduleOverlays.spec.ts |
| Undo toast | over the table at narrow width | T:scheduleOverlays.spec.ts |

## Paths

The page resolves no file path: the plan lives in the project manifest the host reads, and the page never shows or sends a path. The path fixture set does not apply: V:no path crosses this page's ports (checked: `ProductionApi`'s plan calls take dates, amounts and milestone fields only).

## Talking to the host

| Case | Expected | Status |
| --- | --- | --- |
| the host never answers a read | "Loading the schedule…" stays, with Try again after a wait? | NT:the existing loading line has no timeout; a read that never answers is the host's to time out. Listed unverified. |
| answers late | the page waits; a late first read still renders | T:reread |
| out of order | see "older read never overwrites" | T:reread |
| repeated event / lost event | the page uses no event; a lost one cannot hide a change because it re-reads on focus and timer | V:no live event feeds the page |
| wrong version | the Zod schema in `api/schemas` rejects a changed shape and the page shows the read error | T:existing schema tests |
