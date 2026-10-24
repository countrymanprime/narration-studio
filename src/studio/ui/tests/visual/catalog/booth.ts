// The `booth` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the Studio Next Booth
// (docs/research/mockups/studio-next/src/pages/Booth.tsx), mounted at `/booth` by SN-O10, and the Companion, which has its own route.
import type { StateEntry } from '../lib/types';
import { COMPANION, FREEZES_THE_CLOCK, POPUP_ANCHORED_AT_FIRST_WIDTH, REFLOW, SIDE_PANEL_DEPENDS_ON_WIDTH } from './shared';

export const boothStates: StateEntry[] = [
  {
    page: 'booth',
    state: 'setup',
    description:
      "Booth, ready to record (the record capability on, ?mockRecordCapabilityOn=1): the top bar with the chapter stepper, the progress line, \"Resume at ¶ 14 from the saved project\" and the REAPER setup chip; the text full-bleed with the reading position on its first word; the side panel (In this chapter, Coming up, Last punch, This session); the footer with Record, the timer, Levels, and at its right the level bar and the room tone chip (the mock's .lvl-inline), and the key hints from the catalogue. Also captured at the 390 px reflow width (#1718): the top bar wraps as the mock's .btop does, the chapter picker at the mock's medium 190 px, so the progress line, the resume line and the setup chip never overlap the picker",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'daw-not-linked',
    description:
      'Booth for a folder holding one .rpp that is not linked (?mockDawChoice=found): the setup chip reads "REAPER · not linked" in the warning tone, its accessible name "Recording setup: REAPER, not linked" (the tooltip that names Alice.rpp is pinned by record.test.tsx, not captured)',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'daw-not-running',
    description:
      'Booth with REAPER linked and its bridge open but not answering (?mockDawChoice=not-running): the setup chip reads "REAPER · not running" in the warning tone, its accessible name "Recording setup: REAPER, not running"',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'refusal',
    description:
      'Booth with the record capability switched off (the mock\'s default): Record looks off (aria-disabled, still pressable) and the footer says why in the capability\'s own sentence ("Experimental: switched off in Settings."), naming no DAW of its own; above the footer, the quiet "Record is switched off" chip that opens the dialog',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'refusal-pressed',
    description:
      'The same Booth after Record was pressed (issue 2251 item 3: a press that cannot start a take is answered in front of the narrator): the "Recording in REAPER is experimental" dialog explains it and offers Turn on Record, Check again and DAW settings, with what it waits for and when it last checked; nothing records',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-unlinked',
    description:
      'Booth on a chapter with no linked track (?mockDawExperimentalOn=1&mockRecordCapabilityOn=1&mockReaperState=no_link, issue 2251 items 3 and 4): the "Chapter 1 is not linked to a track" dialog opens by itself, saying Record cannot start until the chapter has a track, with the project\'s tracks to choose from (best match preselected), Link track, the offer to create a new track named after the chapter, Check again and when it last checked',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-unlinked-closed',
    description:
      'The same Booth after the dialog was closed: the "Not linked to a track" chip above the footer reopens it, Record looks off and the footer says the chapter has no track to record on and that Record links one; a press of Record reopens the dialog',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-unlinked-created',
    description:
      'The same Booth after Create a new track: REAPER added a track named after the chapter and it is linked; the message says so and that the REAPER project should be saved, the chip is gone and Record is ready',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-connect',
    description:
      "Booth opened without REAPER's bridge (?mockDawConnected=0 with the record capability on, the app started on its own): Record is disabled with the capability's sentence, and a dialog opens by itself saying REAPER is not connected, with what still works, when it last checked, the launcher steps (the mock reports no launcher path, so the step names the file; the Booth/RecordSetup stories show the path with Copy path), Open in REAPER and connect (off until a project file is linked) and Check again",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-connect-closed',
    description:
      'The same Booth after the dialog was closed with its X: the quiet "REAPER not connected" mark stands above the footer and reopens it; Record stays disabled with the capability\'s sentence',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-turned-away',
    description:
      'Booth after REAPER was started from its connect notice but the busy app turned the project away (?mockDaw=busy, Record turned on and the project linked first): the connect dialog (reopened for it) says "REAPER started, but this app turned its project away: The app is busy, so the current project was left unchanged. Finish or cancel what is running, then press Open in REAPER and connect again.", and the host\'s sentence stays as a message until it is dismissed; Record stays off',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'record-other-project',
    description:
      'Booth after REAPER was started from its connect notice and answered with another project open (?mockDaw=different, Record turned on and the project linked first): the "REAPER has a different project open" dialog opens by itself, saying a take would not land in the linked project, with Link the open project, DAW settings, what it waits for and when it last checked, and Check again; behind it the chip above the footer, Record off and the footer\'s same reason in its own sentence',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'builtin-setup',
    description:
      'Booth for a project that records with the built-in recorder (?mockEngine=builtin, the record capability on): the setup chip reads "Built-in", Record is enabled with no track to link, and the footer\'s Levels lists the computer\'s microphones to choose from',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'builtin-refusal',
    description:
      'Booth for a project that records with the built-in recorder while Experimental actions are off (?mockEngine=builtin): Record looks off and the footer says why in the capability\'s own sentence; above the footer, the "Record is switched off" chip opens the dialog that says the take is saved in the project\'s Recordings folder, with Turn on Record',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'builtin-recording',
    description:
      'Booth, a take running with the built-in recorder (Record pressed, the page clock paused so the timer reads 00:00): Stop in place of Record, the REC pill beside the "Built-in" chip, and the session section counting the take',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'builtin-take-ended',
    description:
      "Booth after the built-in recorder's take ended by itself (the microphone stopped delivering audio, ?mockRecorder=failed): Record is back, and a message says why it stopped and that the audio before it is kept in the project's Recordings folder",
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'recording',
    description:
      'Booth, a take running (Record pressed, the page clock paused so the timer reads 00:00): Stop in place of Record, the REC pill beside the setup chip, the resume line gone, and the session section counting the take',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'take-saved',
    description:
      'Booth right after a take stopped in the DAW (Stop pressed): Record is back, and the message "Take saved" offers Undo, which takes the take back in the DAW; the take is in the undo history as "Recorded a take of <chapter>"',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'following',
    description:
      'Booth, six seconds into a take (the page clock run on, then held): the text follows the voice - the mock teleprompter replays a recorded reading, so the reading position has left ¶ 1 and the progress line counts it; Levels names the microphone the DAW records from, so the footer says nothing about the listening',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  // Voice samples (phase 5 of docs/prds/character-voice-samples.prd.md), seeded by `?mockVoiceSamples=bible`: a Queen of Hearts with four samples and the Hatter
  // with one. A listening session paused by a sample has Vitest and no row: a session runs only during a take, and a sample is refused during one.
  {
    page: 'booth',
    state: 'voice-samples-picker',
    description:
      'Booth, the speaker picker opened from a speaker chip: the characters who speak in the chapter under In this chapter, then Everyone else, a count and a play control on each character who has voice samples, "no sample" on the rest',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'voice-samples-panel',
    description:
      'Booth, "In this chapter" in the side panel with voice samples: a play control and the count on each voice that has some, the Queen of Hearts opened to list her samples (the primary starred), and where to make one for a voice with none',
    ...REFLOW,
    ...SIDE_PANEL_DEPENDS_ON_WIDTH,
  },
  {
    page: 'booth',
    state: 'voice-samples-recording',
    description: 'Booth, a take recording: the voices\' play controls are off, and the hint on a control says "Not while recording. Stop the take first."',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'listening-no-mic',
    description:
      'Booth with no microphone listed (?mockNoDevices=1): the footer says in the warning colour that the text cannot follow the voice and why; Record still records',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'model-required',
    description:
      "Booth, Record pressed with the live engine's model not installed (?mockAssets=missing): the take starts and the first-use question asks to download the model, naming its size, publisher and licence; nothing downloads until Download model",
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'leave-dialog',
    description:
      'Booth, Escape pressed during a take: the "Stop recording?" question ("REAPER is recording. Leaving the Booth stops it."), with Keep recording (the mock\'s name for staying) and Stop and leave; the take is held while it is open, so the pill reads REC PAUSED',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'roll-confirm',
    description:
      'Booth, R pressed during a take on a DAW whose roll replaces audio (?mockRollReplaces=1, REAPER\'s punch declared destructive): "Roll again from ¶ n?" asks first, with the take held',
    ...FREEZES_THE_CLOCK,
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'resume',
    description:
      'Booth, "Resume at ¶ 14" chosen: the reading position moves to where the recording ends, in ¶ 14, the text scrolls there and the progress line reads ¶ 14 of 24',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'levels-menu',
    description:
      'Booth, the footer\'s Levels menu open: the input level and the microphone the DAW records from, named, with "Chosen in REAPER" (TeleprompterReaperInput)',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'levels-menu-preroll',
    description:
      "Booth, the Levels menu open with Experimental DAW actions on: the Punch part is REAPER's own pre-roll, read only: off on record, 2 measures, one measure in seconds at the cursor, and where it is set in REAPER",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'room-tone-kept',
    description:
      'Booth ready to record with a room tone the host kept for the microphone (an earlier take or Levels meter measured it): the footer chip reads "Room −58.6 dB" with the menu closed (TeleprompterRoomTone)',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'text-popover',
    description:
      "Booth (as setup) with the top bar's Text settings open: the reader font (the choice the Script's text settings share) and the Booth size, 40 px, on a slider from 24 to 72 in steps of 4",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'marked-note',
    description:
      "Booth after a word was marked on the Script with a Word stress note: the word underlined in its type colour, the note under its paragraph, and a click on the word shows the note in the side panel's Reference",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'bookmarks-ribbon',
    description:
      'Booth (as setup) after B: the word being read is bookmarked, a ribbon shows in the margin to the right of the text level with its line, and the toast says "Bookmark added." with Undo',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'search-shown',
    description:
      'Booth (as setup) after Ctrl+F, "the" and choosing a match under "In this chapter": every match in the text tinted, the chosen one ringed and the reading position on it',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'pickup-session',
    description:
      'Booth opened from Pickups\' "Open in Booth at this line" (/booth?chapter=<id>&pickups=<id>): the top bar\'s "Pickups · n open" chip, the pickup\'s paragraph marked with a bar in the text and the reading position on it, the side panel\'s Pickups section listing the line first, and N "Next pickup" in the footer hints',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'credits-unresolved',
    description:
      "Booth on the closing credits (?credits=closing, the record capability on): the credits read as the text, and the top bar's warning chip says how many tokens have no value; it opens Settings > Credits",
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'credits-missing',
    description:
      'Booth on the closing credits with no closing template (?credits=closing&mockCreditsMissing=1): a panel says "The closing credits are not set up" and offers Set up credits in Settings and Back to the chapters (Escape leaves the Booth), instead of a blank window',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'dark',
    description:
      'Booth (as setup) with Dark selected in Settings > Appearance - the Booth follows the app theme, so this differs from setup only in the palette',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'companion-default',
    description:
      'The Companion (/companion, opened from the jump menu\'s Open Companion; frozen as built, DQ-13): the same session in CompactShell, the whole window (the host narrows it to 380 px and pins it beside the DAW, src/studio/desktop/bindings_companion.go; also captured at that companion width) - the Companion heading with REAPER\'s playhead badge ("Playhead stopped") and Full app, then the Script (chapter title, Play Kbd-labelled Space, Stop reading, the resume prompt and the text in its own scroll box), the Pickups section, the Hotkeys that work while this window has focus, and the reserved Note at playhead and This chapter sections ("Coming soon")',
    ...COMPANION,
  },
  {
    page: 'booth',
    state: 'companion-listening',
    description:
      'The Companion mid-session (?mockTeleprompter=listening, 30 words into the first paragraph) with REAPER playing (?mockDawPlayhead=134.6) - the header badge reads "Playhead 2:14.6", the Script shows Pause (Kbd Space), Stop reading and Follow, and the current word highlighted in its scroll box',
    ...COMPANION,
  },
  {
    page: 'booth',
    state: 'no-manuscript',
    description: 'Booth with no manuscript imported (?mockNoManuscript=1): the page asks for the manuscript and keeps the rail, which a recording would hide',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'loading',
    description:
      'Booth while its chapters are still being read (?mockChapters=loading): the page in its own frame as grey blocks - the top bar with the chapter and the progress, the reading column, the side panel (inline only above 1280 px) and the footer - with the hidden page title kept and one polite "Reading the chapters…" status',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'load-failed',
    description:
      'Booth when the chapters cannot be read (?mockChapters=fails): the page title and "This page could not be loaded" with the read\'s own sentence as an alert and a Retry button that reads the chapters again and a Leave the Booth button beside it (Escape leaves too); no skeleton left behind',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'companion-loading',
    description:
      'The Companion while its chapters are still being read (?mockChapters=loading): the whole-window column with its Companion title and grey blocks where the playhead badge, Full app and the sections will be, with one polite "Reading the chapters…" status',
    ...COMPANION,
  },
  {
    page: 'booth',
    state: 'address-checking',
    description:
      'Booth opened from a link to a chapter the list does not have, while the list is read once more (?mockChapters=reread-hangs, at /booth?chapter=gone): the Booth\'s top bar with its visible Booth title and a Go to Production button, then the reading column, side panel and footer as grey blocks, with one polite "Checking this link…" status',
    ...REFLOW,
  },
];
