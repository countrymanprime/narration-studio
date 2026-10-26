// The `settings` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: one page of eight categories and an index of what
// moved to a page (src/studio/ui/src/components/settings), then the states of the page itself (search, a deep link, loading, unreadable, save failed).
import type { StateEntry } from '../lib/types';
import { REFLOW, KEEPS_DESKTOP_SCROLL, FOLDS_WITH_THE_PAGE_WIDTH, FREEZES_THE_CLOCK, wholePage } from './shared';

export const settingsStates: StateEntry[] = [
  {
    page: 'settings',
    state: 'jump-menu',
    description: 'Settings, the jump menu typed "microphone": the setting row under its category in On this page, before any command',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'page-top',
    description:
      'Settings arriving on Recording & DAW at its defaults: the Settings heading with Search settings and the All / Changed / In this project filter, the category list with its three groups and Set on a page, and the Recording tool section with "Record with" (REAPER, Audacity, Built-in recorder) and its connection card, then the Microphone',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-builtin',
    description:
      'Settings, Recording & DAW with the built-in recorder chosen (?mockDawExperimentalOn=1) after its confirm: "Built-in recorder. Recordings live in the app." is the checked radio and the connection card says nothing needs connecting',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-sample-output-daw',
    description:
      'Settings, Recording & DAW with REAPER chosen: the Voice sample output row is a sentence saying samples play on this computer’s default output and REAPER’s own audio device is not changed, with Test sound and no choice',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-sample-output-builtin',
    description:
      'Settings, Recording & DAW with the built-in recorder chosen (?mockDawExperimentalOn=1) on a computer with two named outputs: the Voice sample output row with Headphones chosen, Refresh the list, Test sound and what the choice changes',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-sample-output-long-name',
    description:
      'Settings, Recording & DAW with the built-in recorder on a computer whose outputs have a very long name and an Arabic one with an emoji: the Voice sample output row with the long one chosen, kept inside its card at every width',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-found',
    description:
      'Settings, Recording & DAW for a folder holding one .rpp that is not linked (?mockDawChoice=found): REAPER chosen, every engine listed with its state, "REAPER not linked", "Alice.rpp is in the project folder." and Link Alice.rpp',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-several',
    description:
      'Settings, Recording & DAW for a folder holding two .rpp files and none linked (?mockDawChoice=several): "2 REAPER project files are in the project folder" and Choose a project file, no one-click link',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-linked',
    description:
      'Settings, Recording & DAW after Link Alice.rpp: "REAPER linked: Alice.rpp" is not running ("Start it here and it connects", the launcher switch named as off), the bridge line, Change linked file and Start REAPER',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-starting',
    description:
      'Settings, Recording & DAW while the app opens REAPER on the linked project (?mockDawChoice=starting): "Starting REAPER", "The app opened REAPER and connects on its own once REAPER has the project open. Opened 4 s ago." and the bridge line, no steps in REAPER',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'settings',
    state: 'recording-builtin-confirm',
    description:
      'Settings, Recording & DAW with REAPER linked and the Built-in recorder radio pressed: the "Stop recording with REAPER?" confirm saying where new takes go, that takes in REAPER stay there and stop being read, that the link is kept, with Keep REAPER and Switch to the built-in recorder',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'recording-not-installed',
    description:
      'Settings, Recording & DAW with REAPER chosen for an empty folder on a computer without it (?mockDawChoice=not-installed): "REAPER was not found on this computer" under its radio and "No REAPER project file is in the project folder yet"',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-advanced',
    description:
      'Settings, Recording & DAW with Advanced open: the REAPER program path box, Experimental DAW actions and the Capabilities table (each capability with its Auto / On / Off setting and what the recording tool reports now)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-sync-activity',
    description:
      'Settings, Recording & DAW with Advanced open (?mockChapterSync=activity): the Sync activity row under Chapter sync, newest first, with Undo on the link sync made',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'recording-reaper-path-invalid',
    description:
      'Settings, Recording & DAW, Advanced: a REAPER program path that does not end in reaper.exe is refused in the row with "This is not the path to reaper.exe..." and the old value stays',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'speech',
    description:
      'Settings, Speech to text: the Transcription model row (All projects, with Override for this project), the Live engine and Live model rows of the Booth, and the Advanced group closed',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'speech-costly-confirm',
    description:
      'Settings, Speech to text: choosing another Transcription model asks "Change the transcription model?" and says earlier checks are marked out of date, with Change model and Cancel',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'speech-advanced',
    description:
      'Settings, Speech to text with Advanced open: the Recording check rows (Two-pass check, First-pass model, Re-check model, Parallel processes, Chunk length)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'speech-model-offer',
    description:
      'Settings, Speech to text where the chosen Transcription model is not on this computer (?mockAssets=missing): the row says "Not on this computer" and offers Download beside a link to Models & downloads',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'voice',
    description:
      'Settings, Voice & pronunciation: the Preview voice row offering Download for the voice that is not installed, then the definitions source radios with the local dictionary and the online service states',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'voice-key-saved',
    description:
      'Settings, Voice & pronunciation, Advanced: the Merriam-Webster key row after a key was saved, showing Key saved with dots, Test key and Remove key',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'models',
    description:
      'Settings, Models & downloads: the disk use panel, the Show filter, and the table of every model, voice and tool with its size, state, who uses it and the one action its state allows',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-downloading',
    description:
      'Settings, Models & downloads with the voice download already running when the page opened (?mockAssets=installing): real bytes, a percent and Cancel in its row',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-failed',
    description: 'Settings, Models & downloads after a download failed (?mockAssets=download-fails): the reason is written in the row with Retry and Dismiss',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-needs-repair',
    description: 'Settings, Models & downloads with a model that failed its check (?mockAssets=damaged): Needs repair, with Repair and Remove in its row',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-remove-confirm',
    description: 'Settings, Models & downloads: the danger confirm before a model is removed, with the settings that use it and what it frees',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-remove-refused',
    description:
      'Settings, Models & downloads after Remove was confirmed on the only installed transcription model: an alert says it was not removed and names the setting that needs it',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-empty',
    description:
      'Settings, Models & downloads with nothing downloaded yet (?mockAssets=missing): the "Nothing is downloaded yet" panel with Download the recommended set above the table',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-loading',
    description: 'Settings, Models & downloads while the list of downloads is still being read (?mockAssetsList=loading): the heading and placeholder rows',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'models-error',
    description:
      'Settings, Models & downloads when the list cannot be read (?mockAssetsList=fails): "The list of models could not be read." with the reason and Retry',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'delivery',
    description: "Settings, Delivery: this project's Delivery profile select with the limits of the chosen profile, and the Default profile for new projects",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'delivery-profile-editor',
    description:
      "Settings, Delivery, Advanced: a duplicate of ACX open in the profile editor with its name, each file rule on or off, the numbers of a rule with a range beside ACX's, a changed peak marked Changed, and a fixed rule that can only be turned off",
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'delivery-profile-custom',
    description:
      'Settings, Delivery with the project judged against a custom profile (?mockDeliveryProfile=custom): the select names "My ACX, tighter peak" and the limits shown are its own',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project',
    description:
      'Settings, Project: the Manuscript row (imported date and words, Replace manuscript…), then the Story Bible section with the language model, Entry types and Marks',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'import-choose',
    description:
      'Settings, Project with Replace manuscript… pressed: step 1 of 2, "Choose your manuscript", with the drop zone, Choose a file… and the read-only note',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'manuscript',
    description: 'Settings, Project with Replace manuscript… pressed: the "Import Alice.docx" review dialog over the page, naming what a replace clears',
    sameAs: {
      of: 'production/import-confirm',
      reason: 'Both open the same Import confirm dialog, and CI found the two captures identical at these widths.',
      viewports: ['desktop', 'small-desktop', 'tablet'],
    },
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'marks-dialog',
    description: 'Settings, Project with Edit marks pressed on the Marks row: the Define how you mark up dialog over the page, a row per mark type',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'project-credits',
    description:
      "Settings, Project with Edit credits… open in the Credits row: the template library, this project's values with a live preview, and the retail sample range",
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'project-credits-chapter-announcement',
    description:
      'Settings, Project, Credits editor with a chapter announcement template selected (?mockCredits=extras): its body previews as "Chapter 1: Down the Rabbit-Hole." with "Shown for Chapter 1"',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'project-credits-retail-sample',
    description:
      'Settings, Project, Credits editor scrolled to Retail sample (?mockCredits=extras): the saved sample "Chapter 3, lines 1 to 3" with its words and length, the start and end pickers, Save sample and Clear sample',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'project-credits-retail-sample-refused',
    description:
      'Settings, Project, Credits editor, Retail sample: a range from Chapter 1 to Chapter 12 refused with "a retail sample can be at most 5 minutes..." and nothing saved',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'project-data-confirm',
    description:
      'Settings, Project, Advanced: the danger confirm "Clear derived project data?" opened from Clear derived data…, naming what is removed and that settings remain',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'appearance',
    description:
      'Settings, Appearance & keys: the Theme radios (Match my system, Light, Dark), the Motion radios (Follow Windows, Reduce), the four reader rows (Reader font, Reader text size, Line spacing, Column width), Note colour and Zoom, then Shortcuts',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'help-open',
    description:
      'Settings, Appearance & keys: the "?" beside Zoom pressed, its note "About Zoom" open as a popover over the rows (the details a row keeps out of the page)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'reader-text',
    description:
      'Settings, Appearance & keys scrolled to the reader rows: Reader font, Reader text size, Line spacing and Column width, each its own row, with the preview quote under Column width',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'global-keyboard',
    description:
      'Settings, Appearance & keys scrolled to Shortcuts: every command grouped by scope (Global, Page, Booth), gestures as Kbd chips, a Find a shortcut box and Reset all to defaults',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'global-keyboard-recording',
    description:
      'Settings, Shortcuts: the recorder open inline under "Record or stop" after a captured J, its live region announcing the capture, Replace / Add as another key / Unbind / Reset to default / Cancel',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'global-keyboard-conflict',
    description:
      'Settings, Shortcuts: the recorder over "Next paragraph", → captured and already bound to "Next word" (a real findConflicts page/page collision), the conflict alert, Replace / Try another key / Cancel',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'app',
    description:
      'Settings, App & updates, nothing checked yet: the This version panel (the version, "Not checked yet.", Check for updates), Updates, Notifications and Diagnostics',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-update-available',
    description: 'Settings, App & updates with a newer release found (?mockUpdate=available): "Version 0.2.7 is available" with Download update',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'about-check-failed',
    description: 'Settings, App & updates after a check that could not reach GitHub (?mockUpdate=failed)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'about-download-confirm',
    description: 'Settings, App & updates: the confirm before an update is downloaded (?mockUpdate=available)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-download-progress',
    description: 'Settings, App & updates: the update download dialog with real bytes, 40 percent and Cancel (?mockUpdate=downloading)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-download-failed',
    description: 'Settings, App & updates: the update download dialog after the checksum check failed (?mockUpdate=download-fails)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-update-ready',
    description: 'Settings, App & updates with the update downloaded and checked, ready to install (?mockUpdate=ready)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'about-install-confirm',
    description: 'Settings, App & updates: the confirm before the app replaces itself and restarts (?mockUpdate=ready)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-installing',
    description:
      'Settings, App & updates: the blocking dialog while the app installs the update and restarts, with the cannot-be-cancelled notice (?mockUpdate=ready)',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'about-install-refused',
    description: 'Settings, App & updates after an install was refused because work is running (?mockUpdate=install-refused)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'about-install-blocked',
    description:
      'Settings, App & updates where the app may not replace itself: why, and Show the downloaded file (?mockUpdate=install-blocked, after a download)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'about-development-build',
    description: 'Settings, App & updates in a development build, which has no release to compare with (?mockUpdate=development)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'pages',
    description:
      'Settings, Set on a page: the index of settings that belong on one page, each with where it will be set, an Open <page> button and "Change it here for now" closed',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'pages-panel-open',
    description: 'Settings, Set on a page with "Change it here for now" opened behind Recording check rules: the Recording check panel that always edited it',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'settings',
    state: 'pages-navigate-away-confirm',
    description:
      'Settings, Set on a page with a change typed into the Recording check panel and another page pressed in the navigation: the Unsaved settings confirm with its three actions, over the page',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'search-results',
    description:
      'Settings with "whisper" typed in Search settings: matching rows from several categories, each under its category with Show the whole category, and a count read aloud',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'search-empty',
    description: 'Settings with a search that matches nothing ("zzzz"): "No settings match “zzzz”" and the hint to try a word from a setting\'s name',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'filter-changed',
    description:
      'Settings with Show: Changed after one setting was changed from its default: only that row, under its category, marked Changed with its reset button',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'filter-project',
    description: 'Settings with Show: In this project: the rows that belong to this project or that it overrides, grouped by category',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'deep-link',
    description:
      "Settings opened from the Booth's credits notice (/settings#credits): the Project category with the Credits row lit and scrolled into view, and Back to Booth beside the heading",
    ...REFLOW,
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'settings',
    state: 'folded-category-list',
    description:
      "Settings at a width where the category list folds: the Category button names the current category and its list is open below it with the three groups and Set on a page (wider, the list is always open and this is the page's top)",
    sameAs: {
      of: 'settings/page-top',
      reason: 'The category list folds only where the page is narrower than 760 px; wider, it is always open and this is the top of the page.',
      viewports: ['desktop'],
    },
    ...REFLOW,
    ...FOLDS_WITH_THE_PAGE_WIDTH,
  },
  {
    page: 'settings',
    state: 'loading',
    description: 'Settings while the settings file is still being read (?mockSettings=loading): the heading and four placeholder rows, nothing to change yet',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'unreadable',
    description:
      'Settings when the settings file cannot be read (?mockSettings=unreadable): "Your settings could not be read." with the reason and Retry, and the rows disabled',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'save-failed',
    description:
      'Settings after a change could not be saved (?mockSettings=save-fails): "Changes cannot be saved right now." above the pane, and the row names the reason and keeps the old value',
    ...REFLOW,
  },
  {
    page: 'settings',
    state: 'override',
    description:
      'Settings, Project: a setting that belongs to both scopes overridden by the project (Build the Story Bible after import, Override for this project): "This project uses" with its own control, Use computer setting, and "overridden here" in the row\'s scope',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
];
settingsStates.push(wholePage(settingsStates, 'page-top'));
