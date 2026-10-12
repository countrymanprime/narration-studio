// The `proof-chapter` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: Proof's chapter view,
// `/proof/:chapterId`. The Editing page replaced its workspace (SN-E9); what is left is the recording check's state, the Proofing page
// folded in (the `proofing` page key: the compare run and its summary, and the Preview and stage panels) and the native takes.
import type { StateEntry } from '../lib/types';
import { FREEZES_THE_CLOCK, KEEPS_DESKTOP_SCROLL, LIVE_PROGRESS_MOVES_ON } from './shared';

export const proofChapterStates: StateEntry[] = [
  // The chapter view, reached from a linked chapter's "Open in Proof" link in the engine panel.
  {
    page: 'proof-chapter',
    state: 'never',
    description: 'Proof chapter view, a chapter with a confirmed track link that has never been checked - "hasn’t been checked yet" and Check recording',
  },
  {
    page: 'proof-chapter',
    state: 'stale',
    description: 'Proof chapter view, a stale check (an item was trimmed since) - the "Check stale" state pill and Check again',
  },
  {
    page: 'proof-chapter',
    state: 'current',
    description: 'Proof chapter view, a current check - "Proof · Chapter 1" header with the "Check current" pill and Check again, then the compare run',
  },

  // The compare run (the Proofing page's setup, run and results), scrolled into view.
  {
    page: 'proof-chapter',
    state: 'compare-setup',
    description: 'Proof chapter view, the compare run’s setup with its default model, chunk length and workers',
  },
  {
    page: 'proof-chapter',
    state: 'compare-setup-alt',
    description: 'Proof chapter view, the compare run’s setup with the Large model picked, capping chunk length and workers',
  },
  {
    page: 'proof-chapter',
    state: 'compare-running',
    description: 'Proof chapter view, a comparison running mid-progress with its live activity log',
    ...LIVE_PROGRESS_MOVES_ON,
  },
  {
    page: 'proof-chapter',
    state: 'compare-results-summary',
    description: 'Proof chapter view, a finished comparison’s summary - how many discrepancies are this chapter’s, Export 1 marker and New comparison',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'compare-results-changed-since',
    description:
      'Proof chapter view, reviewing the last completed comparison after a low-frequency background check finds REAPER’s edit count has moved past it - a "may have changed" note in text and an icon, never colour alone, beside the summary; nothing re-runs on its own',
    ...KEEPS_DESKTOP_SCROLL,
  },
  { page: 'proof-chapter', state: 'compare-toast', description: 'Proof chapter view, Suggest from manuscript answered with a toast', ...FREEZES_THE_CLOCK },
  // The vocabulary hints tag-input box: the pills box is the input, no separate Add row.
  {
    page: 'proof-chapter',
    state: 'compare-hints-typing',
    description: 'Proof chapter view, the vocabulary hints box mid-typed, the draft inline after the last pill',
  },
  {
    page: 'proof-chapter',
    state: 'compare-hints-many-pills',
    description: 'Proof chapter view, the vocabulary hints box with many accepted terms wrapping across lines',
  },
  {
    page: 'proof-chapter',
    state: 'compare-hints-pending-suggestions',
    description: 'Proof chapter view, the vocabulary hints box with dashed suggested-term pills from Suggest from manuscript',
  },
  {
    page: 'proof-chapter',
    state: 'compare-hints-chips',
    description: 'Proof chapter view, the vocabulary hints box with one suggested term accepted (a solid pill) beside the ones still pending',
  },
  {
    page: 'proof-chapter',
    state: 'compare-no-daw',
    description: 'Proof chapter view with no linked REAPER project file (?mockNoDaw=1): Start comparison is gated, with the reason as its description',
  },
  // The Preview panel: a suggested five-minute excerpt from the manuscript, computed on
  // read (never applied, exported or stored), beside the compare run.
  {
    page: 'proof-chapter',
    state: 'preview-default',
    sameAs: {
      of: 'proof-chapter/compare-setup',
      reason:
        'The chapter view is about one screen tall since the Editing page took its workspace: the compare run and the default Preview table show in the same picture, scrolled to the foot of the page.',
    },
    description: 'Proof chapter view, the Preview panel with its default candidates from the demo manuscript: three full-length chapters, no warnings',
  },
  {
    page: 'proof-chapter',
    state: 'preview-computing',
    description: 'Proof chapter view, the Preview panel still reading candidates (?mockPreviewCandidates=computing)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'preview-no-manuscript',
    description:
      'Proof chapter view, the Preview panel answering no_manuscript (?mockPreviewCandidates=no-manuscript) - a defensive state the binding can return that the page itself cannot otherwise reach, since a chapter view redirects away with no manuscript at all',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'preview-nothing-eligible',
    description: 'Proof chapter view, the Preview panel with no eligible text found (?mockPreviewCandidates=nothing-eligible)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'preview-shorter',
    description:
      'Proof chapter view, the Preview panel with a candidate shorter than the target length even in full (?mockPreviewCandidates=shorter), warned in text and an icon',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'preview-warnings',
    description:
      'Proof chapter view, the Preview panel with a full-length candidate warned for a reason other than being short (an unclassified import, ?mockPreviewCandidates=warnings) - text and an icon, never colour alone',
    ...KEEPS_DESKTOP_SCROLL,
  },
  // The pin and adjust UI: the narrator's own pinned window, settled on
  // rather than recomputed, with edge adjustment and a stale banner when the manuscript has moved on since.
  {
    page: 'proof-chapter',
    state: 'preview-pinned',
    description:
      'Proof chapter view, a pinned preview beneath the candidates (?mockPreviewCandidates=pinned): its range, reasons, and the edge-adjustment controls',
  },
  {
    page: 'proof-chapter',
    state: 'preview-pin-stale',
    description:
      'Proof chapter view, a pinned preview whose manuscript text changed since it was pinned (?mockPreviewCandidates=pin-stale) - the stale banner in text and an icon, never colour alone, beside its still-recomputed evidence',
  },
  // The stage recommendations panel:
  // every narration chapter currently in Proofing, with the StageSuggestion/StageEvidence pattern Home's breakdown table uses.
  {
    page: 'proof-chapter',
    state: 'stage-panel-suggestions',
    description:
      'Proof chapter view, the stage recommendations panel with both default Proofing chapters seeded (?mockProofingStages=mixed): Chapter 9 clear (Suggested: Finalized), Chapter 10 with an open pickup (Not ready)',
  },
  {
    page: 'proof-chapter',
    state: 'stage-panel-evidence-recommended',
    description:
      'Proof chapter view, the stage recommendations panel: Why opened on the clear chapter (?mockProofingStages=mixed), Confirm and Dismiss offered',
  },
  {
    page: 'proof-chapter',
    state: 'stage-panel-evidence-not-ready',
    description: 'Proof chapter view, the stage recommendations panel: Why opened on the chapter with an open pickup (?mockProofingStages=mixed), naming Proof',
  },
  {
    page: 'proof-chapter',
    state: 'stage-panel-evidence-unknown',
    description:
      'Proof chapter view, the stage recommendations panel: Why opened on an unmapped-track cause (?mockProofingSignal=unmapped-track) - "Open the audio engine panel", never "Open recording check" (stageText.ts PROOFING_CAUSE_TEXT)',
  },
  // The chosen rendered file the delivery checks are about.
  {
    page: 'proof-chapter',
    state: 'render-none',
    description: 'Proof chapter view, the readiness panel’s Rendered file section with nothing chosen yet - "Choose the rendered file for this chapter."',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'render-chosen',
    description: 'Proof chapter view, a rendered file just chosen - its name, when it was chosen, and Change/Clear/Measure offered',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'render-measured',
    description: 'Proof chapter view, the chosen render measured - "Measured <time>." under the file, Measure offered again',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'render-stale',
    description:
      'Proof chapter view, a chosen render gone stale (?mockProofingRender=chapter-9-stale) - "changed since you chose it", Choose rendered file again',
    ...KEEPS_DESKTOP_SCROLL,
  },
  // Native takes ("take review integration"): the built-in recorder's takes
  // (?mockEngine=builtin) beside REAPER-sourced take review on the same Proof page - one take-review experience
  // whatever the source.
  {
    page: 'proof-chapter',
    state: 'native-takes-unassigned',
    description:
      'Proof chapter view, the Native takes panel (?mockEngine=builtin) with an unassigned take offered for assignment to one of the chapter’s paragraphs',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof-chapter',
    state: 'native-takes-keeper',
    description:
      'Proof chapter view, the Native takes panel with two takes assigned to the same line, one marked the keeper (narrator-confirmed, undoable) and the other not',
    ...KEEPS_DESKTOP_SCROLL,
  },
];
