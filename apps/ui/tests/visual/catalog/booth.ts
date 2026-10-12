// The `booth` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the Studio Next Booth
// (docs/research/mockups/studio-next/src/pages/Booth.tsx), mounted at `/booth` by SN-O10, and the Companion, which has its own route.
import type { StateEntry } from '../lib/types';
import { COMPANION, FREEZES_THE_CLOCK } from './shared';

export const boothStates: StateEntry[] = [
  {
    page: 'booth',
    state: 'setup',
    description:
      'Booth, ready to record (the record capability on, ?mockRecordCapabilityOn=1): the top bar with the chapter stepper, the progress line, "Resume at ¶ 14 from the saved project" and the REAPER setup chip; the text full-bleed with the reading position on its first word; the side panel (Voices in this scene, Coming up, Last punch, This session); the footer with Record, the timer, Levels, the level bar and room tone, and the key hints from the catalogue',
  },
  {
    page: 'booth',
    state: 'refusal',
    description:
      'Booth with the record capability switched off (the mock\'s default): Record is disabled and the footer says why in the capability\'s own sentence ("Experimental: switched off in Settings."), naming no DAW of its own',
  },
  {
    page: 'booth',
    state: 'recording',
    description:
      'Booth, a take running (Record pressed, the page clock paused so the timer reads 00:00): Stop in place of Record, the REC pill beside the setup chip, the resume line gone, and the session section counting the take',
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'booth',
    state: 'leave-dialog',
    description:
      'Booth, Escape pressed during a take: the "Stop recording?" question ("REAPER is recording. Leaving the Booth stops it."), with Cancel and Stop and leave; the take is held while it is open, so the pill reads REC PAUSED (ADR 0790)',
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'booth',
    state: 'roll-confirm',
    description:
      'Booth, R pressed during a take on a DAW whose roll replaces audio (?mockRollReplaces=1, REAPER\'s punch declared destructive): "Roll again from ¶ n?" asks first, with the take held',
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'booth',
    state: 'resume',
    description:
      'Booth, "Resume at ¶ 14" chosen: the reading position moves to where the recording ends, in ¶ 14, the text scrolls there and the progress line reads ¶ 14 of 24',
  },
  {
    page: 'booth',
    state: 'levels-menu',
    description: 'Booth, the footer\'s Levels menu open: the input level and the microphone, chosen in the DAW ("Chosen in REAPER")',
  },
  {
    page: 'booth',
    state: 'credits-unresolved',
    description:
      "Booth on the closing credits (?credits=closing, the record capability on): the credits read as the text, and the top bar's warning chip says how many tokens have no value; it opens Settings > Credits",
  },
  {
    page: 'booth',
    state: 'dark',
    description:
      'Booth (as setup) with Dark selected in Settings > Appearance - the Booth follows the app theme (ADR 0365), so this differs from setup only in the palette',
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
