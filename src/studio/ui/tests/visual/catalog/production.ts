// The `production` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, LIVE_PROGRESS_MOVES_ON, TOAST_FADES_OUT, wholePage } from './shared';

export const productionStates: StateEntry[] = [
  {
    page: 'production',
    state: 'load-error',
    description:
      'Production when its overview could not be read (?mockInvalidPayload=production): the title, "This page could not be loaded" with Retry; navigation still works',
  },
  // The Production home at `/` (mock 01)
  {
    page: 'production',
    state: 'no-data',
    description:
      "Production before anything is logged or set - every undefined figure a dash with why (no measured time, no contracted amount, no delivery date), the chapter pipeline from the chapters' statuses and stage suggestions with Prep and Delivery a dash, and Next up with Start timer",
  },
  {
    page: 'production',
    state: 'on-pace',
    reloadPerViewport: true,
    description:
      'Production with a time log, a delivery date 18 days out and a contracted amount (?mockProduction=on-pace) - hours by stage, PFH and the effective rate from logged hours and measured audio only, the running timer on Chapter 6 with Stop timer, and no Start timer while it runs',
  },
  {
    page: 'production',
    state: 'at-risk',
    reloadPerViewport: true,
    description:
      'Production 3 days from its delivery date with chapters unfinished (?mockProduction=at-risk) - the delivery date as a warning, a higher PFH from more hours logged, and Next up led by the chapters whose stage is held back',
  },

  // Home's surfaces, opened from the board
  {
    page: 'production',
    state: 'no-manuscript',
    description:
      'Production with no imported manuscript (?mockNoManuscript=1): the page is the import - "No imported manuscript" with Import manuscript, and no figures or board (which replaced Home)',
  },
  // The track slide-over, from a chapter's Recorded cell.
  // The renamed state (04) has no host or mock simulation yet (nothing records a track's name at confirm time to compare
  // against), so it is not captured here.
  {
    page: 'production',
    state: 'chapter-track-panel-linked',
    description: 'Production, chapter track panel open on a confirmed link, showing its facts and how it was found (?mockChapterLink=confirmed)',
  },
  {
    page: 'production',
    state: 'chapter-track-panel-ambiguous',
    description: 'Production, chapter track panel open on a chapter confirmed to two tracks at once, offering to keep one (?mockChapterLink=ambiguous, TL6)',
  },
  {
    page: 'production',
    state: 'chapter-track-panel-missing',
    description: 'Production, chapter track panel open on a confirmed link whose track is no longer in the project (?mockChapterLink=missing)',
  },
  {
    page: 'production',
    state: 'chapter-remove-confirm',
    description: 'Production, "Remove from recording?" open from a chapter\'s track slide-over',
  },
  {
    page: 'production',
    state: 'chapter-removed-list',
    description: 'Production, the board with the last narration chapter already removed from recording, listed under it with Restore (?mockRemoved=1)',
    // The list is under the board: on the first screen beside Next up at 1440 px, below it when Next up stacks above the board.
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'production',
    state: 'chapter-sync-toast-undo',
    description: 'Production, the toast for a chapter-sync batch that just linked a track, with Undo (?mockChapterSync=linked)',
    ...TOAST_FADES_OUT,
  },
  { page: 'production', state: 'manuscript-candidate-offer', description: 'Production, offer to import a manuscript file found in the project folder' },
  {
    page: 'production',
    state: 'credits-setup-dialog',
    description:
      'Production, "Set up the credits" dialog (?mockCredits=setup): Title and Author prefilled from the detected front matter with their source captions, Narrator empty with "Use for all my projects" checked since no global default is set, "Don\'t ask for this project" alongside Not now and Save',
  },
  {
    page: 'production',
    state: 'credits-setup-dialog-narrator-default',
    description:
      'Production, "Set up the credits" dialog when the narrator token already has a value (?mockCredits=setup-narrator-default): only Title and Author are asked, with no Narrator field or checkbox - the state a returning narrator with a saved default sees',
  },
  {
    page: 'production',
    state: 'credits-setup-banner',
    description: 'Production, the credits-setup banner after "Not now" - naming the unresolved tokens, "Don\'t ask for this project" and "Fill in"',
  },
  { page: 'production', state: 'import-activity-log', description: 'Production, manuscript import finished with its live activity log populated' },
  {
    page: 'production',
    state: 'import-confirm',
    description:
      'Production, import manuscript confirm dialog with format/paragraph/chapter preview (reached via Settings > Manuscript, "Replace manuscript…", since a manuscript is already loaded)',
    sameAs: {
      of: 'settings/manuscript',
      reason:
        'The Manuscript row moved to Settings > Project (#1834), so a loaded project reaches the import confirm through Replace manuscript… there: the same dialog over the same page, not one over Production.',
    },
  },
  {
    page: 'production',
    state: 'import-confirm-markdown',
    description: 'Production, import review dialog for a Markdown file: the same review plus the chapter heading level choice in an options group',
  },
  {
    page: 'production',
    state: 'import-review-collapsed',
    description: 'Production, import review with every group folded: the summary and one line per group say what was found',
  },
  {
    page: 'production',
    state: 'import-review-characters',
    description: 'Production, import review with the character suggestions open and one unchecked: the summary and the group count both say 2 of 3',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'production',
    state: 'import-review-repaired',
    description: 'Production, import review of a Word file whose headings the importer repaired: the repairs are listed as a group',
  },
  {
    page: 'production',
    state: 'import-review-subtitles-off',
    description: "Production, import review with Subtitles turned off: every heading's second line is joined to its title and none is drawn on a second line",
  },
  {
    page: 'production',
    state: 'import-review-text-subtitle',
    description: 'Production, import review of a plain-text file with Subtitles turned off: the epigraph under the first heading is read as text',
  },

  {
    page: 'production',
    state: 'live-updates-degraded',
    description: 'Production, the notice that live updates from the desktop host could not be read and the page may be out of date',
  },
  {
    page: 'production',
    state: 'daw-not-linked',
    description:
      'Production with no linked REAPER project file (?mockNoDaw=1): the header engine chip reads REAPER with a quiet dot, its tooltip pointing to the engine panel',
  },

  // The recording check (docs/utilities/recording-coverage.md) from a chapter's row menu: Check recordings, the one dialog every page opens,
  // with the row's chapter ticked. What a check found is Proof's check card (catalog/proof.ts, check-*). The mock's chapters 1-3 have a
  // current check with every word, 4-6 a current check with a third of the text missing, the rest were never checked.
  {
    page: 'production',
    state: 'recording-check-never',
    description:
      "Production, Check recordings opened from Chapter 7's row menu (never checked): the run options, the chapter ticked with Not checked yet, and Check 1 chapter",
  },
  {
    page: 'production',
    state: 'recording-check-running',
    description:
      'Production, a recording check running (?mockCoverage=hold) in the Check recordings dialog: the chapter with the real percent from the host, and Stop checking',
    ...LIVE_PROGRESS_MOVES_ON,
  },
  {
    page: 'production',
    state: 'report-dialog',
    description:
      'Production, Export status report: two panes, the Include checkboxes (with the contracted amount and rate, off) and the format beside a tall live preview, under the 26 px title and "project · as of date"',
  },
  {
    page: 'production',
    state: 'recording-check-rules',
    description:
      "Production, the Recording check rules dialog opened from the jump menu: the note that the values are proposed, then the share of each paragraph, the missing and misread runs, the shortest match and the background switch, this project's values",
  },
  {
    page: 'production',
    state: 'recording-check-refused',
    description:
      "Production, a recording check refused because the chapter has no confirmed track (?mockCoverageRefusal=unmapped): the row in the Check recordings dialog says why in plain words, with the host's detail and Open the audio engine panel",
  },
  {
    page: 'production',
    state: 'recording-check-model-required',
    description:
      'Production, Check recordings when the chosen speech model is not installed (?mockAssets=missing): the dialog says to download it in Settings and Check stays off, never a silent download',
  },
  // Stage suggestions, on `?mockStages=mixed`: Chapter 4 read in
  // full (suggested), Chapter 5 with no track linked (can't tell), Chapter 6 short (not ready), Chapter 7 confirmed into Editing and since
  // found short (evidence changed), Chapter 8 confirmed on evidence that still holds.
  {
    page: 'production',
    state: 'stage-suggestion-options',
    description:
      "Production, the Stage suggestion options dialog opened from the jump menu (?mockStages=mixed): the switch and each readiness signal as Required or Ignored, this project's values",
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'production',
    state: 'stage-evidence-recommended',
    description:
      'Production, the evidence of a suggestion in its slide-over: the verdict, Confirm and Dismiss, the recording check met with its evidence, the saved-project basis and its age, Check now',
  },
  {
    page: 'production',
    state: 'stage-evidence-not-ready',
    description: 'Production, the evidence of a chapter not ready: the check not met, its reason, the missing region with Go to paragraph',
  },
  {
    page: 'production',
    state: 'stage-evidence-unknown',
    description: 'Production, the evidence of a chapter that can’t tell yet: the cause (no track linked), what resolves it and Check recordings…',
  },
  {
    page: 'production',
    state: 'stage-evidence-changed',
    description:
      'Production, "Evidence changed since you confirmed": when it was confirmed, the check now not met, and Revert to Recording; nothing moved on its own',
  },

  // Editing check panel, opened from SR's evidence popover's "Open
  // editing check" (?mockEditingSignal=, main.tsx). The panel never starts a scan on its own, so every state but
  // running/partial is reached with no click at all, straight from the signal or the seeded findings.
  {
    page: 'production',
    state: 'editing-check-never-checked',
    description:
      'Production, editing check panel: empty space "Can’t tell yet: not checked yet", click and breath always "Not yet validated on the corpus" (not validated yet), the source-audio caveat, Check editing (?mockEditingSignal=never)',
  },
  {
    page: 'production',
    state: 'editing-check-running',
    description:
      'Production, editing check panel: Check editing pressed, real progress and Cancel over the last scan’s counts (?mockEditing=hold&mockEditingSignal=not-met&mockEditingCandidates=1)',
    ...LIVE_PROGRESS_MOVES_ON,
  },
  {
    page: 'production',
    state: 'editing-check-partial',
    description:
      'Production, editing check panel: Cancel pressed mid-run - the items already checked stay cached, and Check again offers a fresh run (?mockEditing=hold&mockEditingSignal=not-met&mockEditingCandidates=1)',
  },
  {
    page: 'production',
    state: 'editing-check-complete-candidates',
    description:
      'Production, editing check panel: empty space "Not met" with its open candidates, which Clean up in Editing opens on the Editing page’s Clean up tab, and Match levels (?mockEditingCandidates=1&mockEditingSignal=not-met)',
  },
  {
    page: 'production',
    state: 'editing-check-complete-clean',
    description: 'Production, editing check panel: empty space "Met. Checked; no open empty-space candidate remains." (?mockEditingSignal=met)',
  },
  {
    page: 'production',
    state: 'editing-check-gain-match-confirm',
    description:
      "Production, editing check panel: \"Match levels…\" (CapabilityGate('item_gain')) opened, its ConfirmDialog previewing the linked track's one gain candidate (?mockEditingSignal=met&mockDawExperimentalOn=1)",
  },
  {
    page: 'production',
    state: 'editing-check-stale',
    description:
      'Production, editing check panel: empty space "Can’t tell yet: Check editing again: since the last check an item on this chapter’s track changed." (?mockEditingSignal=stale)',
  },
  {
    page: 'production',
    state: 'editing-check-settings-unset',
    description:
      'Production, editing check panel: empty space "Can’t tell yet: No maximum gap is set for empty space." with a link to Settings > Editing (?mockEditingSignal=settings-unset)',
  },
  {
    page: 'production',
    state: 'editing-check-unsupported',
    description:
      'Production, editing check panel: empty space "Can’t tell yet: An item on this chapter’s track is not a WAV file the check can analyze." (?mockEditingSignal=unsupported)',
  },
  // A credits row's slide-over (moved from Home's table rows)
  {
    page: 'production',
    state: 'credits-panel',
    description:
      'Production, the Opening credits row opened from its Edit cell in the pipeline: its template, words and estimated length, Open in Script, its status select and why credits are not checked yet',
  },
  {
    page: 'production',
    state: 'credits-closing-not-set-up',
    description:
      'Production with no closing template in the library (?mockCreditsMissing=1): the pipeline has the Opening credits row and no Closing credits row (the template is added in Settings > Credits), scrolled to the foot of the pipeline',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'production',
    state: 'chapter-sync-consent',
    description: 'Production, "Sync chapters to tracks?" (?mockChapterSync=ask) - it shows from every link path, not only Tracks',
  },
  {
    page: 'production',
    state: 'loading',
    description:
      'Production while the production log is still being read (?mockHold=overview): the page header with its title and buttons, and grey blocks where the chapter and word counts, the due date and the verdict will be (never "0 chapters" or "No due date set"), and grey blocks in place of the KPI row, the three cards, the chapter pipeline and the side panels, with one polite "Reading the production log…" status',
  },
];
productionStates.push(wholePage(productionStates, 'on-pace'));
