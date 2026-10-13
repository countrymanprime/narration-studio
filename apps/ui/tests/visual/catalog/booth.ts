// The `booth` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the Studio Next Booth
// (docs/research/mockups/studio-next/src/pages/Booth.tsx), mounted at `/booth` by SN-O10, and the Companion, which has its own route.
import type { StateEntry } from '../lib/types';
import { COMPANION, FREEZES_THE_CLOCK, REFLOW } from './shared';

export const boothStates: StateEntry[] = [
  {
    page: 'booth',
    state: 'setup',
    description:
      'Booth, ready to record (the record capability on, ?mockRecordCapabilityOn=1): the top bar with the chapter stepper, the progress line, "Resume at ¶ 14 from the saved project" and the REAPER setup chip; the text full-bleed with the reading position on its first word; the side panel (Voices in this scene, Coming up, Last punch, This session); the footer with Record, the timer, Levels, the level bar and room tone, and the key hints from the catalogue',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'refusal',
    description:
      'Booth with the record capability switched off (the mock\'s default): Record is disabled and the footer says why in the capability\'s own sentence ("Experimental: switched off in Settings."), naming no DAW of its own',
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
    state: 'leave-dialog',
    description:
      'Booth, Escape pressed during a take: the "Stop recording?" question ("REAPER is recording. Leaving the Booth stops it."), with Cancel and Stop and leave; the take is held while it is open, so the pill reads REC PAUSED (ADR 0790)',
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
    description: 'Booth, the footer\'s Levels menu open: the input level and the microphone, chosen in the DAW ("Chosen in REAPER")',
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
    state: 'dark',
    description:
      'Booth (as setup) with Dark selected in Settings > Appearance - the Booth follows the app theme (ADR 0365), so this differs from setup only in the palette',
    ...REFLOW,
  },
  {
    page: 'booth',
    state: 'companion-default',
    description:
      'The Companion (/companion, opened from the jump menu\'s Open Companion; frozen as built, DQ-13): the same session in CompactShell, the whole window (the host narrows it to 380 px and pins it beside the DAW, ADR 0401; also captured at that companion width) - the Companion heading with REAPER\'s playhead badge ("Playhead stopped") and Full app, then the Script (chapter title, Play Kbd-labelled Space, Stop reading, the resume prompt and the text in its own scroll box), the Pickups section, the Hotkeys that work while this window has focus, and the reserved Note at playhead and This chapter sections ("Coming soon")',
    ...COMPANION,
  },
  {
    page: 'booth',
    state: 'companion-listening',
    description:
      'The Companion mid-session (?mockTeleprompter=listening, 30 words into the first paragraph) with REAPER playing (?mockDawPlayhead=134.6) - the header badge reads "Playhead 2:14.6", the Script shows Pause (Kbd Space), Stop reading and Follow, and the current word highlighted in its scroll box',
    ...COMPANION,
  },
];
