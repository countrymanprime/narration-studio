# Booth acceptance walkthrough

The steps a narrator takes to record a chapter in the Booth (`/booth`, `apps/ui/src/components/booth/page/BoothNextPage.tsx`), what each must do, and what proves it. The Booth is accepted when every row passes. The spec is the Studio Next mock's Booth (`docs/research/mockups/studio-next/src/pages/Booth.tsx` and `src/pages/booth/`) and [the Booth PRD](../prds/studio-next-booth.prd.md).

**How verified:**

- **Playwright**: a `booth` row of `apps/ui/tests/visual/catalog/booth.ts` whose driver in `apps/ui/tests/visual/drivers/booth.ts` asserts the behaviour.
- **vitest**: a unit test.
- **Owner on Windows**: something only the desktop build on Windows with a microphone and a DAW can prove. Each is pending with the owner until it is reported on [#992](https://github.com/countrymanprime/narration-utils/issues/992).

The record path (the built-in recorder, the record gating in the DAW, the microphone check and the reason Record cannot start) belongs to the `fix/booth-record` stream. Its rows are here so the walkthrough is complete.

**Status column:** the result of driving each step in the mock build (`pnpm --dir apps/ui dev:mock`, Chromium at 1440×900 unless the step names a width) on `main` at `13ca3b55`, 2026-10-13.

## Steps

| # | Step | Expected | How verified | Status on `main` 13ca3b55 |
| - | - | - | - | - |
| 1 | Open the Booth from a chapter (the Script chapter card's Record in Booth) | The Booth opens on that chapter (`/booth?chapter=<id>`) | Playwright | Pass |
| 2 | Read the text | The chapter's paragraphs, in order, with every word whole | Playwright, vitest (`boothUnits.test.ts`) | **Fail**: ¶ 3 reads "nothi ng" (#1708) |
| 3 | Unattributed paragraphs | No empty speaker chip; an unconfirmed speaker shows the mock's "?" chip | Playwright | **Fail**: the last paragraph has a blank chip named "Speaker ." |
| 4 | Space (Record) | A take starts; Stop replaces Record; the REC pill shows | Playwright | Pass |
| 5 | Follow the voice during a take | The reading position moves with the voice | Playwright (mock replay), owner on Windows | **Fail**: no listening microphone is chosen, so the session never starts and nothing says why |
| 6 | The listening microphone | With a DAW, the microphone the DAW records from is used and named in Levels ("… · Chosen in REAPER"); otherwise the narrator picks it in Levels | Playwright, owner on Windows | **Fail**: Levels names no microphone and offers no picker; Settings' help sends the narrator back to the Booth |
| 7 | Speech model missing | Starting a take asks to download the model and nothing downloads until asked | Playwright | **Fail**: nothing is asked; the take runs and the text never follows |
| 8 | No microphone listed | The Booth says the text cannot follow and why | Playwright | **Fail**: nothing is said |
| 9 | Space again (Stop) | The take ends; This session counts it | Playwright | Pass |
| 10 | Arrow keys | ↑ ↓ move a phrase, ← → a word | Playwright | Pass |
| 11 | Click a word | The reading position moves to it | Playwright | Pass |
| 12 | Wheel and Page Down | The view moves; the reading position stays | Playwright | Pass |
| 13 | Text settings (font, size) | They apply at once and are the same after a reload | Playwright | Pass |
| 14 | Levels menu | Input meter, the microphone, input and monitor level | Playwright | **Fail**: no microphone name; the mock's two level sliders are missing |
| 15 | Side panel | Reference, Pickups, Suspected, Last punch, Voices in this scene, Coming up, This session, in the mock's order; the toggle hides and shows it | Playwright | **Fail**: Voices and Coming up come before Last punch |
| 16 | Suspected flags | Shown while reading; Dismiss removes one | Playwright | Pass |
| 17 | A Story Bible name or a marked word | Its reference in the side panel | Playwright | Pass |
| 18 | Record refused by the capability | Record disabled; the capability's sentence beside it | Playwright | Pass |
| 19 | Record with no DAW project linked | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason |
| 20 | Record with the DAW not running | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason |
| 21 | Built-in recorder | Record available; the setup chip names the built-in recorder | Playwright (record path), owner on Windows | **Fail**: Record disabled, the chip says REAPER (`?mockEngine=builtin`) |
| 22 | Escape during a take | "Stop recording?"; Keep recording stays and the take goes on | Playwright | Pass (the button says Cancel; the mock says Keep recording) |
| 23 | Leave by the jump menu during a take | "Stop recording?"; Stop and leave stops the take and goes | Playwright | Pass |
| 24 | R during a take on a DAW whose roll replaces audio | "Roll again from ¶ n?" first | Playwright | Pass |
| 25 | R during a take on a DAW that keeps the take | Rolls without asking; Last punch logs it | Playwright | Pass (with the punch capability on) |
| 26 | Resume at ¶ n | The reading position moves to where the recording ends | Playwright | Pass |
| 27 | B | Bookmarks the word; a ribbon in the margin; the toast offers Undo | Playwright | Pass |
| 28 | Step between bookmarks | Alt+[ and Alt+] move between them | Playwright | Pass (the mock binds [ and ] without Alt) |
| 29 | Key hints | The footer lists the Booth keys from the catalogue | Playwright | Pass |
| 30 | F11 | Full screen on and off | Playwright, owner on Windows | Pass in Chromium |
| 31 | Right-click | Start from here, Bookmark here, phrase, roll, text size, Exit Booth | Playwright | Pass |
| 32 | Escape with no take | Leaves the Booth | Playwright | Pass |
| 33 | Chapter stepper | Changes the chapter and the text | Playwright | Pass |
| 34 | Pickup session (Pickups' Open in Booth at this line) | Pickups chip, the line marked, N Next pickup in the hints | Playwright | Pass |
| 35 | Credits | The credits read as the text; the chip names the unfilled tokens | Playwright | Pass |
| 36 | Narrow window, 390 px | The top bar wraps without overlap; no sideways scroll | Playwright | **Fail**: progress, chapter and resume overlap (#1718) |
| 37 | Small desktop, 1100 px | No sideways scroll; the side panel is a drawer | Playwright | Pass |
| 38 | Dark theme | The Booth follows the app theme | Playwright | Pass |
| 39 | No manuscript | The Booth asks for one | Playwright | Pass (the app routes to Production's import) |
| 40 | Engine | The live engine and model are chosen in Settings > Booth; the mock Booth has no engine picker (PRD phase 9, dropped) | Owner on Windows | Not a Booth control |
| 41 | Record in REAPER for real | The take lands on the chapter's track at the end of the last item | Owner on Windows | Pending (owner) |
| 42 | Foot pedal | Space from the pedal starts and stops | Owner on Windows | Pending (owner) |

## Differences from the mock

Found by capturing the mock (`docs/research/mockups/studio-next`, `npx vite`) and the app in the same states, 2026-10-13. Sample data differs and is not a difference.

| Where | Mock | App on `main` 13ca3b55 |
| - | - | - |
| Levels menu | The microphone's name with "Chosen in REAPER"; Input level and Monitor level sliders | "Chosen in REAPER" with no name; no sliders |
| Side panel order | Reference, Pickups, Suspected, Last punch, Voices in this scene, Coming up, This session | Voices and Coming up before Last punch |
| Side panel rows | Plain rows; speaker chips in their colour with a play button | Bordered boxes; the speaker as plain text |
| Footer | The meter and the room tone (a chip, green when measured) on the right | Both on the left, the room tone as text |
| Unconfirmed speaker | A dashed "?" chip | A blank chip |
| Leave dialog | Compact, at the top; Keep recording and Stop and leave | Wide, centred; Cancel and Stop and leave; the body carries a focus ring |
| Bookmark keys | [ and ] | Alt+[ and Alt+] (the shared catalogue binds [ and ] to Editing's flags) |
| 390 px | The top bar is cut at the right edge | The top bar's parts overlap |
