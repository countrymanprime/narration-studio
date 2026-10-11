// The interaction feedback rows for the extraction call sites (see interactionFeedback.catalog.ts for what a row says). The extraction slices append their rows.
import { type FeedbackRow, row } from './row';

// prettier-ignore
export const extractionFeedback: Record<string, FeedbackRow> = {
  // Suggestion row (SN-X41; unmounted until SN-B8)
  'src/components/storybible/suggested/row/commands.ts::extractionAccept#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'na', 'ok', 'Accept and Save and accept are busy while the host applies the suggestion and writes the suggestions file, one decision at a time; the row changes when the host answers, and a refusal (a locked entry, a name another entry owns) is the host\'s own sentence in a toast with the row and the open edit unchanged.'),
  'src/components/storybible/suggested/row/commands.ts::extractionReject#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'na', 'ok', 'Reject is busy while the host takes back what the suggestion changed and keeps a tombstone, one decision at a time; a refusal is the host\'s own sentence in a toast and the row stays.'),
  'src/components/storybible/suggested/row/commands.ts::extractionReview#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'na', 'ok', 'Mark this suggestion reviewed is busy while the host makes the automatic acceptance the narrator\'s, one decision at a time; a refusal is the host\'s own sentence in a toast and the row stays.'),
  'src/components/storybible/suggested/row/commands.ts::extractionReopen#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'The undo of a decision, run from the history list or a toast (the journal, ADR 0771): the suggestion goes back to the status the 75% rule gave it and the page hears it through onChanged; a refusal is the journal\'s sentence.'),
};
