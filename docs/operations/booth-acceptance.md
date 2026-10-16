# Booth acceptance walkthrough

The steps a narrator takes to record a chapter in the Booth (`/booth`, `apps/ui/src/components/booth/page/BoothNextPage.tsx`), what each must do, and what proves it. The Booth is accepted when every row passes. The spec is the Studio Next mock's Booth (`docs/research/mockups/studio-next/src/pages/Booth.tsx` and `src/pages/booth/`) and [the Booth PRD](../prds/studio-next-booth.prd.md).

**How verified:**

- **Playwright**: a `booth` row of `apps/ui/tests/visual/catalog/booth.ts` whose driver in `apps/ui/tests/visual/drivers/booth.ts` asserts the behaviour.
- **vitest**: a unit test.
- **Owner on Windows**: something only the desktop build on Windows with a microphone and a DAW can prove. Each is pending with the owner until it is reported on [#992](https://github.com/countrymanprime/narration-utils/issues/992).

The record path (the built-in recorder, the record gating in the DAW, the microphone check and the reason Record cannot start) belongs to the `fix/booth-record` stream. Its rows are here so the walkthrough is complete.

**Status columns:** the result of driving each step in the mock build (`pnpm --dir apps/ui dev:mock`, Chromium at 1440×900 unless the step names a width) on `main` at `13ca3b55`, 2026-10-13, and with [#1735](https://github.com/countrymanprime/narration-utils/pull/1735). A blank in the second column means no change from `main`. The last column is what was re-driven on `fix/booth-resiliency` on 2026-10-16 (mock build, Chromium, `pnpm --dir apps/ui dev:mock`); "Not re-driven" means that row was not driven again, not that it passes.

## Steps

| # | Step | Expected | How verified | Status on `main` 13ca3b55 | With #1735 | On `fix/booth-resiliency`, 2026-10-16 |
| - | - | - | - | - | - | - |
| 1 | Open the Booth from a chapter (the Script chapter card's Record in Booth) | The Booth opens on that chapter (`/booth?chapter=<id>`) | Playwright | Pass | | Not re-driven |
| 2 | Read the text | The chapter's paragraphs, in order, with every word whole | Playwright, vitest (`boothUnits.test.ts`) | **Fail**: ¶ 3 reads "nothi ng" (#1708) | | Not re-driven |
| 3 | Unattributed paragraphs | No empty speaker chip; an unconfirmed speaker shows the mock's "?" chip | Playwright | **Fail**: the last paragraph has a blank chip named "Speaker ." | Pass | Not re-driven |
| 4 | Space (Record) | A take starts; Stop replaces Record; the REC pill shows | Playwright | Pass | | Not re-driven |
| 5 | Follow the voice during a take | The reading position moves with the voice | Playwright (mock replay), owner on Windows | **Fail**: no listening microphone is chosen, so the session never starts and nothing says why | Pass | Not re-driven |
| 6 | The listening microphone | With a DAW, the microphone the DAW records from is used and named in Levels ("… · Chosen in REAPER"); otherwise the narrator picks it in Levels | Playwright, owner on Windows | **Fail**: Levels names no microphone and offers no picker; Settings' help sends the narrator back to the Booth | Pass | Not re-driven |
| 7 | Speech model missing | Starting a take asks to download the model and nothing downloads until asked | Playwright | **Fail**: nothing is asked; the take runs and the text never follows | Pass | Not re-driven |
| 8 | No microphone listed | The Booth says the text cannot follow and why | Playwright | **Fail**: nothing is said | Pass | Not re-driven |
| 9 | Space again (Stop) | The take ends; This session counts it | Playwright | Pass | | Not re-driven |
| 10 | Arrow keys | ↑ ↓ move a phrase, ← → a word | Playwright | Pass | | Not re-driven |
| 11 | Click a word | The reading position moves to it | Playwright | Pass | | Not re-driven |
| 12 | Wheel and Page Down | The view moves; the reading position stays | Playwright | Pass | | Not re-driven |
| 13 | Text settings (font, size) | They apply at once and are the same after a reload | Playwright | Pass | | Not re-driven |
| 14 | Levels menu | Input meter, the microphone, input and monitor level | Playwright | **Fail**: no microphone name; the mock's two level sliders are missing | Microphone named; the sliders are still missing | Not re-driven |
| 15 | Side panel | Reference, Pickups, Suspected, Last punch, Voices in this scene, Coming up, This session, in the mock's order; the toggle hides and shows it | Playwright | **Fail**: Voices and Coming up come before Last punch | Pass | Not re-driven |
| 16 | Suspected flags | Shown while reading; Dismiss removes one | Playwright | Pass | | Not re-driven |
| 17 | A Story Bible name or a marked word | Its reference in the side panel | Playwright | Pass | | Not re-driven |
| 18 | Record refused by the capability | Record disabled; the capability's sentence beside it | Playwright | Pass | | Not re-driven |
| 19 | Record with no DAW project linked | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason | | **Fail in the mock, one live case closed.** With `?mockDawExperimentalOn=1&mockNoDaw=1` Record is enabled with no reason: the mock's DAW port answers a connected REAPER whatever the link flags say. In the real host a REAPER launch is linked by definition and an unlinked standalone launch is refused by the capability (`standalone`), so no live gap was found for "no project linked". The wrong-project-open case was one and is now refused |
| 20 | Record with the DAW not running | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason | | **Mixed.** DAW not running: not drivable in the mock (its capabilities are static; `?mockDawNotDetected` only changes Settings). Wrong project open: the host reports linked and heard but not matching and Record now refuses it with a sentence (`useRecordControl`, `recordLive.test.tsx`); not driven in the browser, since the mock's `dawReachable` is never true |
| 21 | Built-in recorder | Record available; the setup chip names the built-in recorder | Playwright (record path), owner on Windows | **Fail**: Record disabled, the chip says REAPER (`?mockEngine=builtin`) | | **Fail in the mock, explained.** `?mockEngine=builtin` changes the chip ("Built-in") but not the DAW port: with experimental off Record is refused behind REAPER's notice; with `?mockDawExperimentalOn=1` Record is enabled and the chip names the built-in recorder. The real host follows the project's `Recording.engine` row (`projectDaw`), so this is the mock's. Not fixed: the mock's DAW port does not take the engine |
| 22 | Escape during a take | "Stop recording?"; Keep recording stays and the take goes on | Playwright | Pass (the button says Cancel; the mock says Keep recording) | | Not re-driven |
| 23 | Leave by the jump menu during a take | "Stop recording?"; Stop and leave stops the take and goes | Playwright | Pass | | Not re-driven |
| 24 | R during a take on a DAW whose roll replaces audio | "Roll again from ¶ n?" first | Playwright | Pass | | Not re-driven |
| 25 | R during a take on a DAW that keeps the take | Rolls without asking; Last punch logs it | Playwright | Pass (with the punch capability on) | | Not re-driven |
| 26 | Resume at ¶ n | The reading position moves to where the recording ends | Playwright | Pass | | Not re-driven |
| 27 | B | Bookmarks the word; a ribbon in the margin; the toast offers Undo | Playwright | Pass | | Not re-driven |
| 28 | Step between bookmarks | Alt+[ and Alt+] move between them | Playwright | Pass (the mock binds [ and ] without Alt) | | Not re-driven |
| 29 | Key hints | The footer lists the Booth keys from the catalogue | Playwright | Pass | | Not re-driven |
| 30 | F11 | Full screen on and off | Playwright, owner on Windows | Pass in Chromium | | Not re-driven |
| 31 | Right-click | Start from here, Bookmark here, phrase, roll, text size, Exit Booth | Playwright | Pass | | Not re-driven |
| 32 | Escape with no take | Leaves the Booth | Playwright | Pass | | Not re-driven |
| 33 | Chapter stepper | Changes the chapter and the text | Playwright | Pass | | Not re-driven |
| 34 | Pickup session (Pickups' Open in Booth at this line) | Pickups chip, the line marked, N Next pickup in the hints | Playwright | Pass | | Not re-driven |
| 35 | Credits | The credits read as the text; the chip names the unfilled tokens | Playwright | Pass | | Not re-driven |
| 36 | Narrow window, 390 px | The top bar wraps without overlap; no sideways scroll | Playwright | **Fail**: progress, chapter and resume overlap (#1718) | | **Pass** at 390 px in Chromium (1440 wide not re-driven): no sideways scroll (`scrollWidth` 390), the top bar wraps onto three rows without overlap. With the record notice up the reading area is one line tall; not fixed |
| 37 | Small desktop, 1100 px | No sideways scroll; the side panel is a drawer | Playwright | Pass | | Not re-driven |
| 38 | Dark theme | The Booth follows the app theme | Playwright | Pass | | Not re-driven |
| 39 | No manuscript | The Booth asks for one | Playwright | Pass (the app routes to Production's import) | | Not re-driven |
| 40 | Engine | The live engine and model are chosen in Settings > Booth; the mock Booth has no engine picker (PRD phase 9, dropped) | Owner on Windows | Not a Booth control | | Not re-driven |
| 41 | Record in REAPER for real | The take lands on the chapter's track at the end of the last item | Owner on Windows | Pending (owner) | | Not re-driven |
| 42 | Foot pedal | Space from the pedal starts and stops | Owner on Windows | Pending (owner) | | Not re-driven |

## Differences from the mock

Found by capturing the mock (`docs/research/mockups/studio-next`, `npx vite`) and the app in the same states, 2026-10-13. Sample data differs and is not a difference.

| Where | Mock | App on `main` 13ca3b55 |
| - | - | - | - |
| Levels menu | The microphone's name with "Chosen in REAPER"; Input level and Monitor level sliders | "Chosen in REAPER" with no name; no sliders |
| Side panel order | Reference, Pickups, Suspected, Last punch, Voices in this scene, Coming up, This session | Voices and Coming up before Last punch |
| Side panel rows | Plain rows; speaker chips in their colour with a play button | Bordered boxes; the speaker as plain text |
| Footer | The meter and the room tone (a chip, green when measured) on the right | Both on the left, the room tone as text |
| Unconfirmed speaker | A dashed "?" chip | A blank chip |
| Leave dialog | Compact, at the top; Keep recording and Stop and leave | Wide, centred; Cancel and Stop and leave; the body carries a focus ring |
| Bookmark keys | [ and ] | Alt+[ and Alt+] (the shared catalogue binds [ and ] to Editing's flags) |
| 390 px | The top bar is cut at the right edge | The top bar's parts overlap |

## What the Booth depends on, and how it recovers

Every Booth control that depends on a DAW or other integration, the input it reads, how the Booth learns it changed, and what the narrator sees. "Re-read" is a fresh read of the same host call. The rules are those of the "Talking to an integration" rules of the definition of done ([PR #1755](https://github.com/countrymanprime/narration-utils/pull/1755), `.claude/rules/definition-of-done.md`, not yet on `main`). Rows marked **gap** are known not to meet them yet.

| Control | Depends on | How the Booth learns it changed | Unknown (not heard) | Ok | Quiet or stale | Refused | Failed | Recovery |
| - | - | - | - | - | - | - | - | - |
| Record and Stop | The `record` capability, the chapter's track count, the link facts, the open project | `daw_capabilities_changed`; a re-read on window focus, on Check again and every 4 s while Record cannot start or a read failed | Record off: "Can't tell whether REAPER is ready (not heard yet). Press Check again." | On | The last answer stays, with "Can't tell … last heard N s ago" beside it | Off, with the capability's or the host's sentence; a different open project is refused naming Settings | A failed press shows "Record did not start: …" and changes nothing | Check again; the timer; the next event |
| Record setup notice | The `record` refusal (`experimental_off`, `turned_off`, `standalone`, `not_running`) and whether a project file is linked | The same reads as Record, plus the link facts with each | "Not checked yet" | The notice is gone | "Can't tell whether REAPER is connected (last checked N s ago)" | What it waits for is named ("Waiting for REAPER to connect") with when it last checked | A failed link read shows "Could not read whether a project file is linked" instead of the link step | Check again, Link in Settings, Open and connect |
| Open and connect | `saveSettings`, `launchDaw` | The press | n/a | "REAPER is starting (path)" | n/a | n/a | "REAPER could not be started: …" | Press again |
| Transport (the REC pill, a take stopped in the DAW) | `daw_transport_changed`, pushed only on a change | The event | The last state | Follows the event | **gap**: no re-read, so a lost event leaves the pill as it was | n/a | n/a | **gap**: leave the Booth and come back |
| Project saved state (unsaved changes warning) | `projectState` | Read on open and after each take starts or stops | Absent | Shown | **gap**: not re-read on a timer | n/a | Absent | Leave and return |
| Chapter track match | `readAloudReaperState` | Read when the capability or the chapter changes | `unread`: Record is left to the host's refusal at the press | Record on | **gap**: not re-read on focus | The host's sentence, Record off | Treated as `unread` | Change chapter |
| Listening microphone (Levels) | The DAW's input, the microphone list | Per [the Levels rows](#steps) | Not re-driven in this pass | | | | | |
| Pickups, flags, resume offer | DAW markers and the REAPER follow | Not covered by this pass | | | | | | |

The shared `useCapability` (every capability gate on every page) now also re-reads on window focus, and on a timer while nothing has been heard.
