// The interaction feedback rows for the Pickups call sites (see interactionFeedback.catalog.ts for what a row says): the
// Studio Next Pickups page and the pickups state the Booth companion's Pickups section and Proof's proofer sheet read.
import { type FeedbackRow, row, subscription } from './row';

// prettier-ignore
export const pickupsFeedback: Record<string, FeedbackRow> = {
  'src/components/pickups/usePickupsState.ts::pickupsState#1': row('mount', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Hydrates whatever run was already in flight when the page or the Booth companion opened; the live event follows anyway.'),
  'src/components/pickups/usePickupsState.ts::subscribePickups#1': subscription('The pickups state event, shared by every import, export, next, resolve and count run the Pickups page starts; the Booth companion only reads it.'),
  'src/components/pickups/usePickupsState.ts::pickupsCount#1': row(
    'mount',
    'job',
    'na',
    'na',
    'ui',
    'silent',
    'na',
    'exempt',
    'An automatic refresh right after the hydrate above settles, so the remaining count is current without an extra press; a failure here just leaves the count at whatever the hydrate answered, and the narrator can still import or export the proofer sheet on Proof, each of which shows its own failure.',
  ),
  // The Studio Next Pickups page (SNQ-9): the host's merged list, and every change answering the whole list (ADR 0840).
  'src/components/pickups/PickupsPage.tsx::manuscriptChapters#1': row('mount', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'Read with the list on opening for the chapter stepper and the group rows; a failure is a toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#1': row('mount', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'Read with the chapters on opening, which is what reconciles the list with the DAW\'s markers; a failure is a toast and the list stays empty.'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Read again after adding markers, so the lines show their markers; a failure is the marker action\'s toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsAdd#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'no', 'ok', 'Add a pickup by hand: the popover\'s Add is pending until the host answers the list; a refusal (an empty line, a time outside the chapter) is a toast in the host\'s words.'),
  'src/components/pickups/PickupsPage.tsx::pickupsAdd#2': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'yes', 'ok', 'Undo of removing a line added by hand adds it again; a refusal is a toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsRemove#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'The row leaves the list when the host answers; a line added by hand offers Undo, a refusal is a toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsSetIncluded#1': row('input', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'The checkbox and the session panel follow the host\'s answer; a refusal is a toast and the box keeps the stored state.'),
  'src/components/pickups/PickupsPage.tsx::pickupsSetDone#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Mark recorded or open again goes through the DAW marker when the DAW holds it; a refusal is a toast in the DAW\'s words.'),
};
