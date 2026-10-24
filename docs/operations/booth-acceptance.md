# Booth acceptance walkthrough

The steps a narrator takes to record a chapter in the Booth (`/booth`, `src/studio/ui/src/components/booth/page/BoothNextPage.tsx`), what each must do, and what proves it. The Booth is accepted when every row passes. The spec is the Studio Next mock's Booth (`docs/research/mockups/studio-next/src/pages/Booth.tsx` and `src/pages/booth/`) and [the Booth PRD](../prds/studio-next-booth.prd.md).

**How verified:**

- **Playwright**: a `booth` row of `src/studio/ui/tests/visual/catalog/booth.ts` whose driver in `src/studio/ui/tests/visual/drivers/booth.ts` asserts the behaviour.
- **vitest**: a unit test.
- **Owner on Windows**: something only the desktop build on Windows with a microphone and a DAW can prove. Each is pending with the owner until it is reported on [#992](https://github.com/countrymanprime/narration-studio/issues/992).

The record path (the built-in recorder, the record gating in the DAW, the microphone check and the reason Record cannot start) belongs to the `fix/booth-record` stream. Its rows are here so the walkthrough is complete.

**Status columns:** the result of driving each step in the mock build (`pnpm --dir src/studio/ui dev:mock`, Chromium at 1440×900 unless the step names a width) on `main` at `13ca3b55`, 2026-10-13, and with [#1735](https://github.com/countrymanprime/narration-studio/pull/1735). A blank in the second column means no change from `main`. The last column is what was re-driven on `fix/booth-resiliency` on 2026-10-16 by `src/studio/ui/tests/visual/booth-acceptance.spec.ts`, one test per row, in the mock build in Chromium at 1440×900 unless the step names a width. The mock's DAW is stateful and scriptable now (`?mockDaw=live|late|quiet|different|refuse|restart|busy`, `window.__NARRATION_MOCK_DAW__`; `src/studio/ui/src/api/dawMock.ts`), so the record path is driven end to end and not read from the code. Rows 40 to 42 need a real REAPER, a pedal and a microphone: nothing in the mock proves them.

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
| 14 | Levels menu | Input meter, the microphone, input and monitor level | Playwright | **Fail**: no microphone name; the mock's two level sliders are missing | Microphone named; the sliders are still missing | Pass in pass 3. The meter, the named microphone and both sliders are there (`booth-matrix.spec.ts`, `LevelsSliders.test.tsx`). **Monitor level (output)** sets REAPER's first hardware output (the `monitor_level` command, Experimental); **Input level** is off with the capability's sentence, because no DAW can set an audio interface's input gain. Real REAPER: pending (owner) |
| 15 | Side panel | Reference, Pickups, Suspected, Last punch, In this chapter, Coming up, This session, in the mock's order; the toggle hides and shows it | Playwright | **Fail**: Voices and Coming up come before Last punch | Pass | Pass |
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
| 40 | Engine | The live engine and model are chosen in Settings > Speech to text; the mock Booth has no engine picker (PRD phase 9, dropped) | Owner on Windows | Not a Booth control | Not a Booth control |
| 41 | Record in REAPER for real | The take lands on the chapter's track at the end of the last item | Owner on Windows | Pending (owner) | Pending (owner) |
| 42 | Foot pedal | Space from the pedal starts and stops | Owner on Windows | Pending (owner) | Pending (owner). Space held and repeated is driven (`booth-matrix.spec.ts`): one toggle; with a menu or popover open Space closes it and toggles (`booth-keys.spec.ts`), while a question keeps every key |
| 43 | Built-in recorder: a take with no DAW | Record starts a take on the chosen microphone with no track and no DAW; Stop ends it and the take is listed in the project's Recordings folder | Playwright, vitest, Go (a fake engine), owner on Windows | **Fail**: Record went to REAPER's path and was refused ("REAPER is not connected to this app") | **Pass in the mock and in the host over a fake engine** (`booth-acceptance.spec.ts`, `bindings_booth_record_test.go`). A real microphone: pending (owner) |
| 44 | Built-in recorder: Experimental off | Record disabled with the capability's sentence; "Recording in the built-in recorder is experimental" with Turn on Record | Playwright, vitest | Not reachable | Pass (`builtin-refusal`, `recordBuiltIn.test.tsx`) |
| 45 | Built-in recorder: the microphone | One microphone: used. Several and none chosen: "Choose the microphone in Levels". None: "No microphone found". Blocked: the engine's sentence | Go, vitest | Not reachable | Pass over a fake engine (`TestBuiltinBoothRecordPicksTheMicrophone`, `builtinBoothMock.test.ts`). A real blocked device: pending (owner) |
| 46 | Built-in recorder: a take that ends by itself | The Booth ends the take, says why and that the audio is kept; Record is ready again | Playwright, vitest, Go, owner on Windows | Not reachable | Pass over a fake engine (`builtin-take-ended`, `recordBuiltIn.test.tsx`, `TestBuiltinBoothTakeEndingByItselfIsHeardAndKept`). Unplugging a real microphone and a full disk: pending (owner) |
| 47 | Built-in recorder: leave and reload mid-take | Escape asks "Stop recording?"; a reload takes the take back; Experimental off mid-take still lets Stop work | Playwright, vitest, Go | Not reachable | Pass (`BoothNextPage.test.tsx`, `recordBuiltIn.test.tsx`, `TestBuiltinBoothStopWorksWhileExperimentalIsOff`) |

## Differences from the mock

Found by capturing the mock (`docs/research/mockups/studio-next`, `npx vite`) and the app in the same states, 2026-10-13. Sample data differs and is not a difference.

| Where | Mock | App on `main` 13ca3b55 |
| - | - | - | - |
| Levels menu | The microphone's name with "Chosen in REAPER"; Input level and Monitor level (output) sliders | "Chosen in REAPER" with no name; no sliders (`main` 13ca3b55). Pass 3 draws both; Input level is off with its reason |
| Side panel order | Reference, Pickups, Suspected, Last punch, In this chapter, Coming up, This session | Voices and Coming up before Last punch |
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
| Navigation chip, Settings > Recording & DAW, the engine panel | `bootstrap`'s `dawReachable` and `dawProjectMatches` | Read again when the DAW starts or stops answering, and on window focus (at most every 2 s) | The last answer | Chip "Linked", "REAPER is reachable" | "Not running", "REAPER is not reachable" | A different project open is named | n/a | The next event or focus |
| A launch from the DAW while the app is busy | `system:attached` with a reason | The event | n/a | The project is taken | n/a | The host's sentence as a message until dismissed, and in the connect notice with what to do | n/a | Finish or cancel the work, press Open and connect again |
| Listening microphone (Levels) | The DAW's input, the microphone list, the listening session's state | The listening session's state and the device list on open | The footer says why the text cannot follow | Named in Levels | n/a | n/a | A session that ends in an error (a microphone unplugged mid-take) says so in the footer; the take goes on and stops | Choose another microphone in Levels |
| Other-project notice | The open project against the linked one (`bootstrap`'s `dawProjectMatches`), read with the capabilities | Focus, Check again, every 4 s while the notice is up or a take runs, every 15 s while Record is ready (REAPER sends no event when another project opens) | Not shown: the host reports no match while nothing is linked or the DAW is silent | The notice is gone | "Can't tell whether REAPER has the linked project open." and "Last checked N s ago" | The picker's own refusal, as a message | "The project could not be linked: …" | Link the open project, or open the linked one in the DAW, then Check again |
| Levels: Monitor level (output) | `monitor_level` (REAPER's first hardware output), `dawMonitorLevel`, `dawSetMonitorLevel` | Read when the menu opens and on focus | Slider off with "Reading the level from the DAW…" | The level the DAW holds | Read again on focus | The capability's sentence, slider off | "Could not read the monitor level: …", "The monitor level could not be changed: …", the slider back on the confirmed level | Close and open the menu, or Experimental on in Settings |
| Levels: Input level | `input_level`, unsupported on every engine | n/a | n/a | n/a | n/a | The capability's sentence under an off slider | n/a | Set it in the audio interface's own control panel |
| Levels: the DAW's input and output meters | `daw_meters` (REAPER's master and first armed track), `dawMeters` | Read four times a second while the menu is open, one at a time | "Reading the levels from REAPER…" | The armed track's level under Input level, with its name, and the output under Monitor level; "No track is armed" with no input | "Can't tell: the DAW's levels were last heard N s ago" after two seconds without an answer | The capability's sentence once, with **Turn on in Settings** when Experimental is all that keeps it off | The DAW's own sentence under the input meter, "Could not read the DAW's levels: …" | Arm the track in REAPER, or **Turn on in Settings** |
| Speech-model notice | `assetsList` (manifests only) | On open, on focus, after a download | No notice | No notice | n/a | n/a | A failed read claims nothing; the first start asks, as before | Download in Settings, or press Space and be asked |
| Pickups, flags, resume offer | DAW markers and the REAPER follow | Not covered by this pass | | | | | | |

The shared `useCapability` (every capability gate on every page) now also re-reads on window focus, and on a timer while nothing has been heard.

## Pass 3 state matrix

Written before the code, filled in as the tests landed. Each cell names its test, or says "not tested" with the reason. Item numbers are those of PR #1756's walkthrough tables (S, M and walkthrough-4 numbers). Test files: `useTakeClock.test.ts`, `BoothNextPage.test.tsx`, `recordSetup.test.tsx`, `recordLive.test.tsx`, `useStaleToasts.test.ts`, `overlay.test.tsx`, `useToastClearance.test.tsx`, `useMonitorLevel.test.tsx`, `LevelsSliders.test.tsx`, `BoothText.test.tsx`, `roll.test.tsx`, `ChapterStepper.test.tsx`, `listeningProblem.test.ts`, `useListeningModelState.test.tsx`, and the Playwright specs `booth-live`, `booth-matrix`, `booth-notice`.

| Control | Items | Empty / one / many / huge | Refused / failed | Stale / quiet | Long, RTL, emoji | Rapid double-fire | Reload / leave mid-action |
| - | - | - | - | - | - | - | - |
| Take timer | S2, M10 | Yes: 0 s, 3 h (`useTakeClock.test.ts`) | n/a: no host call | Yes: a slept window, a hidden one, a clock set back (`useTakeClock.test.ts`, `booth-live`) | n/a: digits | Yes: stop then start restarts at 0 | A take the app started comes back at 00:00 when the Booth is opened again (the DAW's own take start is not read); a reload forgets the take (#1756) |
| REC pill while a question holds the take | S2 | Yes | n/a | Yes: the timer goes on while the question is open (`BoothNextPage.test.tsx`) | n/a | Yes: Escape, Keep recording | Yes: Escape, Keep recording, Stop and leave |
| Other-project notice | S4, M4, M11, M15, 10 | Yes: not linked, linked, another open (`recordSetup.test.tsx`) | Yes: picker refused, cancelled, host throws | Yes: DAW quiet, last read failed says "Can't tell"; the open project changing with no event is found by focus, Check again and the 4 s / 15 s reads (`recordLive.test.tsx`, `booth-live`) | Not tested: it names no project file; the DAW's name is the only variable text | Yes: two presses open one picker | Yes: reload and return re-read it (`booth-live`) |
| Notice above toasts | M1, M2, M3, 9, 12 | Yes: 800×600, 400×700, 1440×500 (`booth-notice`) | Yes: a refusal toast with the notice up | Yes: the starting message goes once the DAW answers (`booth-live`, `useStaleToasts.test.ts`) | Yes: a 300-character word in a toast wraps | Yes: ten Space presses, one toast | n/a |
| Toasts | M2, M3, 9 | Yes: none, one, thirty identical, a topic (`overlay.test.tsx`) | Yes | Yes: a refusal goes when Record is ready | Yes | Yes | n/a |
| Quiet DAW mid-take | 10 | n/a | n/a | Yes: "can't tell", not "the take ended there"; a DAW that answers "stopped" still says stopped (`recordLive.test.tsx`, `booth-live`) | n/a | n/a | n/a |
| Speech-model notice | S3 | Yes: installed, missing, repair needed, not in the catalog, read failed (`useListeningModelState.test.tsx`) | Yes: a failed read claims nothing | Yes: read again on focus and after a download | n/a | n/a | n/a |
| Levels: microphone name | M8 | Yes: 0, 1, 50, 300 characters with spaces and with none, RTL, emoji (`booth-matrix`) | n/a | n/a | Yes | n/a | n/a |
| Levels: Monitor level | item 3 | Yes: loading, read, set; the DAW's rounding shown (`useMonitorLevel.test.tsx`) | Yes: refused (the DAW's sentence), throws; slider goes back | Yes: read again on focus; out-of-order answers cannot happen, one call at a time | Yes: a 300-character sentence wraps | Yes: a drag is one call, the newest value waits | Yes: leaving with a change waiting sends nothing |
| Levels: Input level | item 3 | Yes: off with the capability's sentence on every engine | n/a | n/a | n/a | n/a | n/a |
| Levels: the DAW's meters | #2251 item 11 | Yes: armed, no track armed, off, refused, quiet (`dawMeters.test.tsx`) | Yes: the DAW's sentence; a read that hangs is not doubled | Yes: a quiet DAW says when it was last heard | Yes: a 200-character name with emoji and right-to-left text wraps | Yes: one read at a time | Yes: closing the menu stops the reads |
| Reader text | M9 | Yes: a 276-character word wraps inside the text (`booth-matrix`) | n/a | n/a | Yes: RTL and emoji books (#1756) | n/a | n/a |
| Rapid R | M12 | n/a | Yes: a refused roll leaves no pause | n/a | n/a | Yes: ten presses, one roll; a press after 0.7 s rolls again (`roll.test.tsx`, `booth-matrix`) | n/a |
| Side-panel "set" | M14 | Yes: it is status text in the mock, not a control; nothing in the panel is out of the Tab order (`BoothSidePanel.test.tsx`) | n/a | n/a | n/a | n/a | n/a |
| Chapter picker while recording | 13 | Yes: a tab stop that carries the reason (`ChapterStepper.test.tsx`) | n/a | n/a | Yes: the existing long-name story | n/a | n/a |
| 100,000-word chapter | perf | Yes: one chapter of 100,000 words, 5000 chapters (`booth-matrix`) | n/a | n/a | n/a | n/a | n/a |

The DAW-facing rows also cover, with the mock DAW's own control (`window.__NARRATION_MOCK_DAW__`): never answers (`quiet`), answers late (`late`), out of order and repeated (`recordFuzzTransport.test.tsx`), loses an event (`dropEvents`), the wrong project open at any moment (`openProject('other')`), the wrong version (a report with no `monitor_level` entry), and restarts mid-session (`restart`).
