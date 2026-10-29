// The `engine` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the engine panel, a slide-over from
// the header's engine chip that replaced the Tracks page. Each
// state is the panel, or one of its REAPER tools' dialogs opened from it, over the Production home. The Tracks page's player states
// (`default`'s transport, `playing`, `skipped-forward`, `last-track-selected`, `unplayable-track-selected`) went with the player:
// a chapter is heard in its Proof chapter view. `tracks/sync-consent` went too: the same dialog over the Production home is
// `production/chapter-sync-consent`.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL } from './shared';

export const engineStates: StateEntry[] = [
  {
    page: 'engine',
    state: 'default',
    description:
      'The engine panel opened from the header chip over the Production home: the linked Alice.rpp and "Change file…", the six REAPER tools on a three-column grid, Chapter sync (its facts as label and value rows, "Not chapters" among them), the track list with each track\'s chapter and its unplayable items flagged, and Chapter links',
  },
  {
    page: 'engine',
    state: 'from-tracks-link',
    description:
      "An old /tracks link or bookmark: it lands on Proof, query and hash kept, with the engine panel open over it, since that is where the Tracks page's project, tracks and tools went",
  },
  {
    page: 'engine',
    state: 'sync-off',
    description: 'The engine panel, the Chapter sync section with sync turned off (?mockChapterSync=off)',
  },
  {
    page: 'engine',
    state: 'sync-background-wait',
    description:
      'The engine panel, Chapter sync with background recording checks on but waiting (?mockChapterSync=background): a "Background checks" row reading "Waiting: REAPER is recording."',
  },
  {
    page: 'engine',
    state: 'sync-needs-you',
    description:
      'The engine panel after an automatic link was undone in Settings > Recording & DAW > Sync activity (?mockChapterSync=activity): Chapter sync\'s "Needs you" list with that chapter, its track picker and Link',
  },
  {
    page: 'engine',
    state: 'audacity-linked',
    description:
      "The engine panel for an Audacity project (?mockAudacityLink=linked): the Audacity card in place of the REAPER project section, answering with this project's Book One.aup3, Chapter sync's Last synced naming Book One.aup3 in Audacity (never a .rpp), and no REAPER tools",
  },
  {
    page: 'engine',
    state: 'audacity-not-running',
    description:
      'The engine panel for an Audacity project with Audacity closed (?mockAudacityLink=not-running): the card says Audacity is not running and offers to start it, and when it last answered',
  },
  {
    page: 'engine',
    state: 'rpp-picker',
    description: 'The engine panel, more than one .rpp file found - choose-a-project-file prompt (reached via the ?mockMultipleRpp=1 mock seam)',
  },
  {
    page: 'engine',
    state: 'no-rpp',
    description: 'The engine panel, no .rpp file in the project folder - "No REAPER project file found" empty state (reached via the ?mockNoRpp=1 mock seam)',
  },
  {
    page: 'engine',
    state: 'no-daw-link',
    description:
      'The engine panel with no linked REAPER project file (?mockNoDaw=1): the panel’s own DAW-link control reads "Link file…" instead of "Change file…" and the header chip reading REAPER with a quiet dot - the panel stays usable since it reads its .rpp through its own discovery flow',
  },
  {
    page: 'engine',
    state: 'wrong-project',
    description:
      'The engine panel with REAPER answering on a different project than the linked one (?mockDawMismatch=1): the REAPER project card’s warning callout says so, then "Waiting for REAPER to open the linked project.", "Last checked N s ago.", Link the open project… and Check again',
  },
  {
    page: 'engine',
    state: 'folder-tracks',
    description:
      'The engine panel for a project whose tracks sit in REAPER folders (?mockTrackFolders=1): the Tracks card as an indented tree - guides, caret, folder icon, child count and an "N of M linked" roll-up on each folder, Co-narrator\'s empty folder, the search box and open/close all - scrolling inside its own card',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'folder-tracks-picker',
    description:
      "The engine panel with REAPER folders, a Chapter links row's track picker open: the same tree in a popover with its search box, a folder with no audio of its own shown but not choosable (?mockTrackFolders=1&mockChapterLink=none)",
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'folder-tracks-picker-search',
    description:
      'The same picker with "chap" typed in its search box (?mockTrackFolders=1): the list flattens to the matching tracks, each with its folder path, and the track another chapter holds says "linked to Chapter 1"',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-link-confirmed',
    description:
      'The engine panel, the Chapter links list at the foot of the page - the first chapter confirmed to a track shows Linked with the track name, Change and Clear',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-link-missing',
    description:
      'The engine panel, a chapter confirmed to a track GUID no longer in the project - Track missing, with the missing-track message and Change/Clear (reached via the ?mockChapterLink=missing mock seam)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'editing-check-unmapped',
    description:
      'The engine panel, the Chapter links list\'s "Editing check…" opened on an unlinked chapter, Check editing pressed: "This chapter can\'t be checked yet" with the inline track-link prompt, same as the recording check offers (?mockEditingRefusal=unmapped)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'link-chapters-preview',
    description:
      'The engine panel, "Link chapters" dialog open with one chapter mapped to a track - preview of the items that will be stamped, nothing written yet',
  },
  {
    page: 'engine',
    state: 'link-chapters-success',
    description:
      'The engine panel, "Link chapters" dialog after a completed Read - every row status shown at once (ok, drift, stale-source, removed, unrecognized)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'link-chapters-conflict',
    description: 'The engine panel, "Link chapters" dialog after a Stamp that hit a stale item and a conflict - both GUID lists shown',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'link-chapters-error',
    description: 'The engine panel, "Link chapters" dialog when REAPER reports a problem - inline error message, nothing written',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'render-config-prefilled',
    description:
      'The engine panel, "Prepare chapter render" dialog open before any configure - the suggested output folder prefilled, Configure render enabled',
  },
  {
    page: 'engine',
    state: 'render-config-success',
    description:
      'The engine panel, "Prepare chapter render" dialog after a completed configure - the resulting chapter file names and the "press Render in REAPER" instruction shown',
  },
  {
    page: 'engine',
    state: 'render-config-no-regions',
    description: 'The engine panel, "Prepare chapter render" dialog after a configure with no chapter regions yet - 0 files, "create them before rendering"',
  },
  {
    page: 'engine',
    state: 'render-config-error',
    description:
      'The engine panel, "Prepare chapter render" dialog when REAPER reports a problem - inline error message, nothing rendered (reached via the ?mockRenderConfig=error mock seam)',
  },
  {
    page: 'engine',
    state: 'create-regions-empty',
    description:
      'The engine panel, "Create chapter regions" dialog open before any chapter is linked or a credits track chosen - every chapter listed as skipped ("No track is linked to this chapter."), Create 0 regions disabled, the "regions" capability at its Experimental-off-by-default state',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'create-regions-preview',
    description:
      'The engine panel, "Create chapter regions" dialog with Chapter 1 already linked (?mockChapterLink=confirmed) and an opening credits track chosen - one planned region shown as "New region", Create 2 regions enabled (REAPER answers, so the regions capability is on)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'create-regions-success',
    description:
      'The engine panel, "Create chapter regions" dialog after Create pressed - the sent/created/existing/updated/ambiguous/failed counts shown, Close replaces Cancel',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'create-regions-error',
    description:
      'The engine panel, "Create chapter regions" dialog when REAPER refuses to write the regions - inline error message, nothing created (reached via the ?mockRegionsCreateError=1 mock seam)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-tags-idle',
    description:
      'The engine panel, "Embed chapter tags" dialog open before any chapter render is configured - "Prepare chapter render first" message, Embed disabled',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-tags-ready',
    description:
      'The engine panel, "Embed chapter tags" dialog with two rendered chapters known - the chapter list, destination field and confirm checkbox, Embed enabled once both are filled in (reached via the ?mockChapterTags=ready mock seam)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-tags-not-rendered',
    description:
      'The engine panel, "Embed chapter tags" dialog with a chapter configured but not yet rendered - a "Not rendered yet" badge and the press-Render-first warning, Embed disabled (reached via the ?mockChapterTags=not-rendered mock seam)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-tags-success',
    description:
      'The engine panel, "Embed chapter tags" dialog after a completed embed - the new tagged file\'s path shown, the original file unmentioned as changed',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'chapter-tags-error',
    description:
      'The engine panel, "Embed chapter tags" dialog when the embed fails - inline error message (reached via the ?mockChapterTags=ready&mockChapterTagsEmbedError=1 mock seam)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'engine',
    state: 'cleanup-tools-idle',
    description: 'The engine panel, "Cleanup tools" dialog open before any launch - Repair Pops/Clicks and Magnolius DeClick, each with its own Open button',
  },
  {
    page: 'engine',
    state: 'cleanup-tools-launched',
    description:
      'The engine panel, "Cleanup tools" dialog after REAPER opened Repair Pops/Clicks - "is open in REAPER. Nothing has changed yet" (reached via the ?mockCleanupTools=launched mock seam)',
  },
  {
    page: 'engine',
    state: 'cleanup-tools-error',
    description:
      'The engine panel, "Cleanup tools" dialog when REAPER refuses a launch - "Magnolius DeClick is not installed" inline alert, nothing opened (reached via the ?mockCleanupTools=error mock seam)',
  },
  {
    page: 'engine',
    state: 'retake-lanes-list',
    description:
      'The engine panel, "Retakes on lanes" dialog - two lines of Chapter 1 with their retakes by lane, which lane plays in the saved project, and a "Play this lane" button per retake',
  },
  {
    page: 'engine',
    state: 'retake-lanes-picked',
    description:
      'The engine panel, "Retakes on lanes" dialog after REAPER confirmed a pick - lane 2 now plays for both lines of the track, "Undo in REAPER" status line (reached via the ?mockRetakeLanes=picked mock seam)',
  },
  {
    page: 'engine',
    state: 'retake-lanes-none',
    description:
      'The engine panel, "Retakes on lanes" dialog for a project with no fixed-lane track - says why nothing is listed (reached via the ?mockRetakeLanes=none mock seam)',
  },
  {
    page: 'engine',
    state: 'retake-lanes-error',
    description:
      'The engine panel, "Retakes on lanes" dialog when REAPER refuses a pick - "not in fixed item lane mode" inline alert, nothing changed (reached via the ?mockRetakeLanes=error mock seam)',
  },
];
