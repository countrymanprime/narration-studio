// The `settings` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { REFLOW, KEEPS_DESKTOP_SCROLL } from './shared';

export const settingsStates: StateEntry[] = [
  // Settings
  {
    page: 'settings',
    state: 'page-top',
    description:
      "Settings, the top of the page (the Studio Next mock's panels): the Recording radios on the launch's DAW, the Delivery profile select on ACX, the Reader text panel (font, size, line spacing, column width and the preview quote), the Marks pills with Edit marks, the Story Bible types, the Appearance theme radios, the Keyboard shortcuts list read-only and the Manuscript panel with Replace manuscript, above the kept panels",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'reader-text',
    description:
      "Settings scrolled to the Reader text panel: the Script reader's font, size, line spacing and column width over the preview quote, then the Marks pills and the Story Bible types",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'analysis-tools',
    description:
      'Settings scrolled to the Story Bible analysis panel: GLiNER, both BookNLP sizes and the local language model, each Not available yet with the host’s reason, and Offer better analysis when scanning, then Appearance',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'manuscript',
    description: 'Settings scrolled to the Manuscript panel: "Imported Jan 1 · 2,672 words" and the danger Replace manuscript…, then the kept General panel',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'marks-dialog',
    description: "Settings' Marks panel with Edit marks pressed: the Define how you mark up dialog over the page, a row per mark type",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-builtin',
    description: 'Settings\' Recording panel with the built-in recorder chosen: "Built-in recorder. Recordings live in the app." is the checked radio',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-found',
    description:
      'Settings\' Recording panel for a folder holding one .rpp that is not linked (?mockDawChoice=found): REAPER chosen by the folder, every engine listed with its state (Experimental, switched off, with the DAW Integration link), "REAPER not linked", "Alice.rpp is in the project folder." and Link Alice.rpp',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-several',
    description:
      'Settings\' Recording panel for a folder holding two .rpp files and none linked (?mockDawChoice=several): REAPER, "2 REAPER project files are in the project folder" and Choose a project file, no one-click link',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-linked',
    description:
      'Settings\' Recording panel after Link Alice.rpp: "REAPER linked: Alice.rpp", REAPER not running with the launcher switch named, Change linked file and Start REAPER',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-not-installed',
    description:
      'Settings\' Recording panel with REAPER chosen for an empty folder on a computer without it (?mockDawChoice=not-installed): "REAPER was not found on this computer" under its radio, and "No REAPER project file is in the project folder yet"',
    ...REFLOW,
  },
  { page: 'settings', state: 'global-general', description: 'Settings, the General panel (Global only)', ...REFLOW },
  {
    page: 'settings',
    state: 'global-keyboard',
    description:
      'Settings, the Keyboard & pedals panel in Global: every command grouped by scope (Global, Page, Booth), gestures as Kbd chips, and Reset all to defaults',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-keyboard-recording',
    description:
      'Settings, Keyboard & pedals: the recorder open inline under "Record or stop" after a captured J, its live region announcing the capture, Replace / Add as another key / Unbind / Reset to default / Cancel',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'global-keyboard-conflict',
    description:
      'Settings, Keyboard & pedals: the recorder over "Next paragraph", → captured and already bound to "Next word" (a real findConflicts page/page collision), the conflict alert, Replace / Try another key / Cancel',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'global-recording-check',
    description:
      'Settings, the Recording check panel in Global (ADR 0131): the four number settings at their defaults (0.8, 3, 8, 3 words; ADR 0132), under a summary that labels them uncalibrated and states the rule they make',
    ...REFLOW,
  },
  { page: 'settings', state: 'global-proofing', description: 'Settings, the Proof panel in Global', ...REFLOW },
  {
    page: 'settings',
    state: 'global-storybible',
    description: 'Settings, the Story Bible panel in Global, with the online dictionary panel offering a free Merriam-Webster key',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-storybible-key-saved',
    description: 'Settings, the Story Bible panel in Global after the narrator saved their own Merriam-Webster key: Key saved, Replace and Remove',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-delivery',
    description:
      'Settings, the Delivery profiles panel in Global (ADR 0179): the default delivery profile every project without its own choice is judged against (ACX), and the profiles, the built-in one read-only with Duplicate',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'delivery-profile-editor',
    description:
      "Settings / Delivery, a duplicate of ACX open in the profile editor: its name, each file rule on or off, the numbers of a rule with a range beside ACX's, a changed peak marked Changed, and a fixed rule that can only be turned off",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-daw',
    description:
      'Settings, the DAW Integration panel in Global, with the DAW catalog panel showing REAPER detected and a REAPER project already linked, so only the "Check again" action shows (docs/architecture/daw-integration.md)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-daw-capabilities',
    description:
      "Settings, the DAW Integration panel in Global, the capability section below the per-capability toggles: each capability with its level as a word and a glyph, the host's reason sentence when unavailable, the destructive warning chip and the mode phrase",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-daw-not-detected',
    description:
      'Settings, the DAW Integration panel in Global with REAPER not detected (?mockDawNotDetected=1, docs/architecture/daw-integration.md): the not-detected dot and the "Get REAPER" button that opens the vendor\'s download page',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-daw-handoff',
    description:
      'Settings, the DAW Integration panel in Global with REAPER detected but no REAPER project linked yet (?mockNoDaw=1, docs/architecture/daw-integration.md): the "Link a REAPER project file" handoff button next to the detected entry, and the "Check again" action below it',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-manuscript',
    description: 'Settings, the Note colour panel in Global: the reader-note colour picker (the Manuscript panel itself is at the top of the page)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'global-stage-recommendations',
    description: 'Settings, the Stage suggestions panel in Global: the master switch and the recording signal choice (required/ignored)',
    ...REFLOW,
  },
  { page: 'settings', state: 'global-tts', description: 'Settings, the TTS panel in Global', ...REFLOW },
  {
    page: 'settings',
    state: 'global-booth',
    description: 'Settings, the Booth panel in Global (microphone, live engine and model choice)',
    ...REFLOW,
  },
  { page: 'settings', state: 'global-about', description: 'Settings, the About and updates panel in Global (the version, nothing checked yet)', ...REFLOW },
  {
    page: 'settings',
    state: 'about-update-available',
    description: 'Settings, About and updates with a newer release found (the mock seam ?mockUpdate=available)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-check-failed',
    description: 'Settings, About and updates after a check that could not reach GitHub (?mockUpdate=failed)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-download-confirm',
    description: 'Settings, About and updates: the confirm before an update is downloaded (?mockUpdate=available)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-download-progress',
    description: 'Settings, About and updates: the update download dialog with real bytes, 40 percent and Cancel (?mockUpdate=downloading)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-download-failed',
    description: 'Settings, About and updates: the update download dialog after the checksum check failed (?mockUpdate=download-fails)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-update-ready',
    description: 'Settings, About and updates with the update downloaded and checked, ready to install (?mockUpdate=ready)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-install-confirm',
    description: 'Settings, About and updates: the confirm before the app replaces itself and restarts (?mockUpdate=ready)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-installing',
    description:
      'Settings, About and updates: the blocking dialog while the app installs the update and restarts, with the cannot-be-cancelled notice (?mockUpdate=ready)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-install-refused',
    description: 'Settings, About and updates after an install was refused because work is running (?mockUpdate=install-refused)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-install-blocked',
    description:
      'Settings, About and updates where the app may not replace itself: why, and Show the downloaded file (?mockUpdate=install-blocked, after a download)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-development-build',
    description: 'Settings, About and updates in a development build, which has no release to compare with (?mockUpdate=development)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets',
    description:
      'Settings, the Local assets panel in Global: every voice and model with its sizes, licence and state, the folder and the total on disk (the voice is not installed, the others are)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets-downloading',
    description:
      'Settings, Local assets with a download that was already running when the page opened, followed through activeJobId: real bytes, 39 percent and Cancel (?mockAssets=installing)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets-verifying',
    description: 'Settings, Local assets with a download at its check: a busy button, no Cancel (?mockAssets=checking)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets-needs-repair',
    description: 'Settings, Local assets with a model that failed its verification: Needs repair, with Repair and Remove (?mockAssets=damaged)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets-failed',
    description: 'Settings, Local assets after a download failed: the reason is written in the row and Download stays (?mockAssets=download-fails)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'local-assets-remove-confirm',
    description: 'Settings, Local assets: the danger confirm before a model is removed, with what it frees and what asks again',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-recording-check',
    description:
      'Settings, the Recording check panel in This project: every setting unset in the project and inheriting its default, with the note that a blank project value uses the Global one',
    ...REFLOW,
  },
  { page: 'settings', state: 'project-proofing', description: 'Settings, the Proof panel in This project', ...REFLOW },
  { page: 'settings', state: 'project-storybible', description: 'Settings, the Story Bible panel in This project', ...REFLOW },
  {
    page: 'settings',
    state: 'delivery-profile-custom',
    description:
      'Settings\' Delivery profile panel with the project judged against a custom profile (?mockDeliveryProfile=custom): the select names "My ACX, tighter peak"',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-daw',
    description: 'Settings, the DAW Integration panel in This project (new: previously global-only): "REAPER project linked" and Change linked project file',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-daw-not-linked',
    description:
      'Settings, the DAW Integration panel in This project with no linked REAPER project file (?mockNoDaw=1): "No REAPER project linked" and Link a REAPER project file',
    ...REFLOW,
  },
  { page: 'settings', state: 'project-data', description: 'Settings, the Project data panel in This project (clear derived project data)', ...REFLOW },
  {
    page: 'settings',
    state: 'project-credits',
    description: 'Settings, the Credits panel in This project: template library, live preview and project credit values',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-credits-detected',
    description:
      'Settings, Project scope / Credits, every empty field with a manuscript-detected candidate captioned with its source (?mockCredits=detected): Title and Author from the title page, Year and Copyright holder from the copyright line, and a low-confidence Publisher marked "(check this)"',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-credits-chapter-announcement',
    description:
      'Settings, Project scope / Credits, a chapter announcement template selected: its body "[Chapter]{: [Chapter Title]}." previews as "Chapter 1: Down the Rabbit-Hole." with "Shown for Chapter 1, one of 12 chapters", and the kind hint names [Chapter] and [Chapter Title]',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-credits-retail-sample',
    description:
      'Settings, Project scope / Credits scrolled to Retail sample: the saved sample "Chapter 3, line 1 to Chapter 3, line 3" with its words and length, the start and end pickers, Save sample and Clear sample',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'project-credits-retail-sample-refused',
    description:
      'Settings, Project scope / Credits, Retail sample: a range from Chapter 1 to Chapter 12 refused with "a retail sample can be at most 5 minutes; this range is ... words, about ..." and nothing saved',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  { page: 'settings', state: 'dirty-footer', description: 'Settings, unsaved-changes footer visible', ...REFLOW, ...KEEPS_DESKTOP_SCROLL },
  { page: 'settings', state: 'navigate-away-confirm', description: 'Settings, navigate-away-while-dirty confirm dialog', ...REFLOW },
  {
    page: 'settings',
    state: 'reset-override',
    description: 'Settings, reset/clear-override control on a field',
    pointer: 'keep',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
];
