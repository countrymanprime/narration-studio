# Booth acceptance walkthrough

The steps a narrator takes to record a chapter in the Booth (`/booth`, `apps/ui/src/components/booth/page/BoothNextPage.tsx`), what each must do, and what proves it. The Booth is accepted when every row passes. The spec is the Studio Next mock's Booth (`docs/research/mockups/studio-next/src/pages/Booth.tsx` and `src/pages/booth/`) and [the Booth PRD](../prds/studio-next-booth.prd.md).

**How verified:**

- **Playwright**: a `booth` row of `apps/ui/tests/visual/catalog/booth.ts` whose driver in `apps/ui/tests/visual/drivers/booth.ts` asserts the behaviour.
- **vitest**: a unit test.
- **Owner on Windows**: something only the desktop build on Windows with a microphone and a DAW can prove. Each is pending with the owner until it is reported on [#992](https://github.com/countrymanprime/narration-utils/issues/992).

The record path (the built-in recorder, the record gating in the DAW, the microphone check and the reason Record cannot start) belongs to the `fix/booth-record` stream. Its rows are here so the walkthrough is complete.

**Status columns:** the result of driving each step in the mock build (`pnpm --dir apps/ui dev:mock`, Chromium at 1440×900 unless the step names a width) on `main` at `13ca3b55`, 2026-10-13, and with [#1735](https://github.com/countrymanprime/narration-utils/pull/1735). A blank in the second column means no change from `main`. The last column is what was re-driven on `fix/booth-resiliency` on 2026-10-16 by `apps/ui/tests/visual/booth-acceptance.spec.ts`, one test per row, in the mock build in Chromium at 1440×900 unless the step names a width. The mock's DAW is stateful and scriptable now (`?mockDaw=live|late|quiet|different|refuse|restart|busy`, `window.__NARRATION_MOCK_DAW__`; `apps/ui/src/api/dawMock.ts`), so the record path is driven end to end and not read from the code. Rows 40 to 42 need a real REAPER, a pedal and a microphone: nothing in the mock proves them.

## Steps

| # | Step | Expected | How verified | Status on `main` 13ca3b55 | With #1735 | On `fix/booth-resiliency`, 2026-10-16 |
| - | - | - | - | - | - | - |
| 1 | Open the Booth from a chapter (the Script chapter card's Record in Booth) | The Booth opens on that chapter (`/booth?chapter=<id>`) | Playwright | Pass | Pass |
| 2 | Read the text | The chapter's paragraphs, in order, with every word whole | Playwright, vitest (`boothUnits.test.ts`) | **Fail**: ¶ 3 reads "nothi ng" (#1708) | Pass: every word whole, "nothi ng" is gone |
| 3 | Unattributed paragraphs | No empty speaker chip; an unconfirmed speaker shows the mock's "?" chip | Playwright | **Fail**: the last paragraph has a blank chip named "Speaker ." | Pass | Pass |
| 4 | Space (Record) | A take starts; Stop replaces Record; the REC pill shows | Playwright | Pass | Pass |
| 5 | Follow the voice during a take | The reading position moves with the voice | Playwright (mock replay), owner on Windows | **Fail**: no listening microphone is chosen, so the session never starts and nothing says why | Pass | Pass: the mock's replay moves the reading position during a take |
| 6 | The listening microphone | With a DAW, the microphone the DAW records from is used and named in Levels ("… · Chosen in REAPER"); otherwise the narrator picks it in Levels | Playwright, owner on Windows | **Fail**: Levels names no microphone and offers no picker; Settings' help sends the narrator back to the Booth | Pass | Pass: Levels names the microphone and "Chosen in REAPER" |
| 7 | Speech model missing | Starting a take asks to download the model and nothing downloads until asked | Playwright | **Fail**: nothing is asked; the take runs and the text never follows | Pass | Pass |
| 8 | No microphone listed | The Booth says the text cannot follow and why | Playwright | **Fail**: nothing is said | Pass | Pass |
| 9 | Space again (Stop) | The take ends; This session counts it | Playwright | Pass | Pass |
| 10 | Arrow keys | ↑ ↓ move a phrase, ← → a word | Playwright | Pass | Pass |
| 11 | Click a word | The reading position moves to it | Playwright | Pass | Pass |
| 12 | Wheel and Page Down | The view moves; the reading position stays | Playwright | Pass | Pass |
| 13 | Text settings (font, size) | They apply at once and are the same after a reload | Playwright | Pass | Pass (the size survives a reload) |
| 14 | Levels menu | Input meter, the microphone, input and monitor level | Playwright | **Fail**: no microphone name; the mock's two level sliders are missing | Microphone named; the sliders are still missing | **Partial.** The meter and the named microphone pass. The mock's two sliders (Input level, Monitor level) are not built: the app has no host call that sets the DAW's input or monitor level, so a slider would move and do nothing. An owner decision, not a fix |
| 15 | Side panel | Reference, Pickups, Suspected, Last punch, Voices in this scene, Coming up, This session, in the mock's order; the toggle hides and shows it | Playwright | **Fail**: Voices and Coming up come before Last punch | Pass | Pass |
| 16 | Suspected flags | Shown while reading; Dismiss removes one | Playwright | Pass | Pass (the one pressed is the one that goes; the mock's session keeps raising flags while it listens) |
| 17 | A Story Bible name or a marked word | Its reference in the side panel | Playwright | Pass | Pass |
| 18 | Record refused by the capability | Record disabled; the capability's sentence beside it | Playwright | Pass | Pass |
| 19 | Record with no DAW project linked | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason | **Pass in the mock.** With nothing linked and no bridge, Record is off, the footer gives the reason and the notice has Link in Settings. In the real host a REAPER launch is linked by definition |
| 20 | Record with the DAW not running | Record disabled with the reason | Playwright (record path) | **Fail**: Record enabled, no reason | **Pass in the mock.** REAPER's bridge open but silent: "REAPER is not answering", Record off with a reason, Check again does not fake an answer; a heartbeat arriving by hand clears it. Another project open than the linked one: Record is refused in a sentence and is offered again when the right project is open |
| 21 | Built-in recorder | Record available; the setup chip names the built-in recorder | Playwright (record path), owner on Windows | **Fail**: Record disabled, the chip says REAPER (`?mockEngine=builtin`) | **Pass in the mock.** `?mockEngine=builtin` now starts the mock DAW as Built-in: the chip names it, and Record is available once the recorder's own Experimental switch is on (it declares `record` Experimental like REAPER) |
| 22 | Escape during a take | "Stop recording?"; Keep recording stays and the take goes on | Playwright | Pass (the button says Cancel; the mock says Keep recording) | Pass. Escape pressed again with the question open now answers it, Keep recording, instead of closing and re-asking it |
| 23 | Leave by the jump menu during a take | "Stop recording?"; Stop and leave stops the take and goes | Playwright | Pass | Pass |
| 24 | R during a take on a DAW whose roll replaces audio | "Roll again from ¶ n?" first | Playwright | Pass | Pass |
| 25 | R during a take on a DAW that keeps the take | Rolls without asking; Last punch logs it | Playwright | Pass (with the punch capability on) | Pass |
| 26 | Resume at ¶ n | The reading position moves to where the recording ends | Playwright | Pass | Pass |
| 27 | B | Bookmarks the word; a ribbon in the margin; the toast offers Undo | Playwright | Pass | Pass |
| 28 | Step between bookmarks | Alt+[ and Alt+] move between them | Playwright | Pass (the mock binds [ and ] without Alt) | Pass: stepping works, and a step that goes round the book says so |
| 29 | Key hints | The footer lists the Booth keys from the catalogue | Playwright | Pass | Pass |
| 30 | F11 | Full screen on and off | Playwright, owner on Windows | Pass in Chromium | Pass: F11 asks the page for full screen (headless Chromium cannot show it, so the call is what is asserted) |
| 31 | Right-click | Start from here, Bookmark here, phrase, roll, text size, Exit Booth | Playwright | Pass | Pass |
| 32 | Escape with no take | Leaves the Booth | Playwright | Pass | Pass |
| 33 | Chapter stepper | Changes the chapter and the text | Playwright | Pass | Pass: and Next pressed rapidly in one tick moves one chapter per press |
| 34 | Pickup session (Pickups' Open in Booth at this line) | Pickups chip, the line marked, N Next pickup in the hints | Playwright | Pass | Pass |
| 35 | Credits | The credits read as the text; the chip names the unfilled tokens | Playwright | Pass | Pass |
| 36 | Narrow window, 390 px | The top bar wraps without overlap; no sideways scroll | Playwright | **Fail**: progress, chapter and resume overlap (#1718) | **Pass** at 390 px: no sideways scroll, the top bar wraps without overlap. With the record notice up the word being read stays in view (`booth-notice.spec.ts`) |
| 37 | Small desktop, 1100 px | No sideways scroll; the side panel is a drawer | Playwright | Pass | Pass |
| 38 | Dark theme | The Booth follows the app theme | Playwright | Pass | Pass |
| 39 | No manuscript | The Booth asks for one | Playwright | Pass (the app routes to Production's import) | Pass |
| 40 | Engine | The live engine and model are chosen in Settings > Booth; the mock Booth has no engine picker (PRD phase 9, dropped) | Owner on Windows | Not a Booth control | Not a Booth control |
| 41 | Record in REAPER for real | The take lands on the chapter's track at the end of the last item | Owner on Windows | Pending (owner) | Pending (owner) |
| 42 | Foot pedal | Space from the pedal starts and stops | Owner on Windows | Pending (owner) | Pending (owner). Space held and repeated is driven (`booth-matrix.spec.ts`): one toggle, and no key reaches the Booth behind an open popover or question |

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

Every Booth control that depends on a DAW or other integration, the input it reads, how the Booth learns it changed, and what the narrator sees. "Re-read" is a fresh read of the same host call. The rules are those of the "Talking to an integration" rules of [the definition of done](../../.claude/rules/definition-of-done.md). A row marked **gap** is known not to meet them yet; none is left in this table.

| Control | Depends on | How the Booth learns it changed | Unknown (not heard) | Ok | Quiet or stale | Refused | Failed | Recovery |
| - | - | - | - | - | - | - | - | - |
| Record and Stop | The `record` capability, the chapter's track count, the link facts, the open project | `daw_capabilities_changed`; a re-read on window focus, on Check again and every 4 s while Record cannot start or a read failed | Record off: "Can't tell whether REAPER is ready (not heard yet). Press Check again." | On | The last answer stays, with "Can't tell … last heard N s ago" beside it | Off, with the capability's or the host's sentence; a different open project is refused naming Settings | A failed press shows "Record did not start: …" and changes nothing | Check again; the timer; the next event |
| Record setup notice | The `record` refusal (`experimental_off`, `turned_off`, `standalone`, `not_running`) and whether a project file is linked | The same reads as Record, plus the link facts with each | "Not checked yet" | The notice is gone | "Can't tell whether REAPER is connected (last checked N s ago)" | What it waits for is named ("Waiting for REAPER to connect") with when it last checked | A failed link read shows "Could not read whether a project file is linked" instead of the link step | Check again, Link in Settings, Open and connect |
| Open and connect | `saveSettings`, `launchDaw` | The press | n/a | "REAPER is starting (path)" | n/a | n/a | "REAPER could not be started: …" | Press again |
| Transport (the REC pill, a take stopped in the DAW) | `daw_transport_changed`, pushed only on a change, and the project's play state | The event; while a take runs the play state is also read every 4 s | The last state | Follows the event | A DAW that says it is not recording after having said it was, or three times running, ends the take here with "REAPER stopped recording"; three failed reads in a row say "Can't tell whether REAPER is still recording" once | n/a | A take that the DAW refuses to stop stays shown, with the host's sentence | The timer; Stop pressed again |
| Project saved state (unsaved changes warning), and a take started in the DAW itself | `projectState`, the transport event | Read on open, after each take starts or stops, and with every capability read (focus, Check again, the 4 s timer while Record cannot start) | Absent | Shown | The last answer stays; a failed read changes nothing | A take the DAW holds that this app did not start: Record is off, "REAPER is already recording. Stop it in REAPER before recording here." | Absent | Check again; stop it in the DAW |
| Chapter track match | `readAloudReaperState` | Read when the capability or the chapter changes, with every capability read, and when a take starts or stops | `unread`: Record is left to the host's refusal at the press | Record on | Re-read on focus, Check again and the timer while it refuses | The host's sentence, Record off | Treated as `unread` | Check again; fix the track in the DAW |
| Navigation chip, Settings > DAW Integration, the engine panel | `bootstrap`'s `dawReachable` and `dawProjectMatches` | Read again when the DAW starts or stops answering, and on window focus (at most every 2 s) | The last answer | Chip "Linked", "REAPER is reachable" | "Not running", "REAPER is not reachable" | A different project open is named | n/a | The next event or focus |
| A launch from the DAW while the app is busy | `system:attached` with a reason | The event | n/a | The project is taken | n/a | The host's sentence as a message until dismissed, and in the connect notice with what to do | n/a | Finish or cancel the work, press Open and connect again |
| Listening microphone (Levels) | The DAW's input, the microphone list, the listening session's state | The listening session's state and the device list on open | The footer says why the text cannot follow | Named in Levels | n/a | n/a | A session that ends in an error (a microphone unplugged mid-take) says so in the footer; the take goes on and stops | Choose another microphone in Levels |
| Pickups, flags, resume offer | DAW markers and the REAPER follow | Not covered by this pass | | | | | | |

The shared `useCapability` (every capability gate on every page) now also re-reads on window focus, and on a timer while nothing has been heard.
