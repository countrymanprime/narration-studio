// The interaction feedback rows for the manuscript call sites (see interactionFeedback.catalog.ts for what a row says).
import { type FeedbackRow, row } from './row';

// prettier-ignore
export const manuscriptFeedback: Record<string, FeedbackRow> = {
  // Manuscript
  'src/components/script/scriptPageHost.ts::creditsTemplates#1': row(
    'mount',
    'file-io',
    'na',
    'na',
    'ui',
    'silent',
    'na',
    'exempt',
    'Loads the credits template library behind the Opening/Closing credits pseudo-entries; a failed load simply renders no credits entries rather than a toast over the manuscript itself, which already has its own load-error state for the chapters it cannot do without.',
  ),
  'src/components/script/scriptPageHost.ts::creditsRetailSample#1': row('mount', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Reads the retail sample to mark its lines (ADR 0152); a failed read leaves the reader unmarked, and Settings > Credits shows the real error.'),
  'src/components/script/scriptPageHost.ts::creditsPreview#1': row(
    'effect',
    'instant',
    'na',
    'na',
    'ui',
    'inline',
    'na',
    'exempt',
    'Renders the first opening-kind template (ADR 0093\'s convention) with the current project values for the Opening credits entry; a failed render leaves that entry showing "Nothing to preview yet." (same fallback as CreditsPanel.tsx) rather than a toast.',
  ),
  'src/components/script/scriptPageHost.ts::creditsPreview#2': row(
    'effect',
    'instant',
    'na',
    'na',
    'ui',
    'inline',
    'na',
    'exempt',
    'Renders the first closing-kind template (ADR 0093\'s convention) with the current project values for the Closing credits entry; a failed render leaves that entry showing "Nothing to preview yet." rather than a toast.',
  ),

  // The Script page's Words tab and Define marks dialog (scriptPageHost.ts)
  'src/components/script/scriptPageHost.ts::pronunciationCandidate#1': row('click', 'python', 'pending', 'pending', 'ui', 'inline', 'na', 'ok', 'Choosing a source on a word card asks it for the word alone: the card is busy until it answers; a miss or a refused call is a note under the card and the saved value stays.'),
  'src/components/script/scriptPageHost.ts::pronunciationOnlineLookup#1': row('input', 'download', 'inline', 'na', 'ui', 'inline', 'na', 'ok', 'With the online service chosen as the definition source, the word card reads Merriam-Webster for that one word (D72): the block says it is loading, and a failure is the host\'s sentence in the block with Try again.'),
  'src/components/script/scriptPageHost.ts::pronunciationLookupOpen#1': row('click', 'instant', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Opens a fixed look-up page in the browser; the browser is the acknowledgment, a refusal is a toast.'),
  'src/components/script/scriptPageHost.ts::marksSaveTypes#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Define marks saves each change at once: a small file write; the dialog shows the types the host answers and the marks are read again, a refusal is a toast and the dialog keeps the last saved list.'),
};
